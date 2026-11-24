/** Anonymous online sessions. Credentials stay outside the game's save / backup data. */
export const ONLINE_STORAGE_KEY = 'beast-king-online-profile-v1';
export const ONLINE_API_BASE = 'https://beast-king.hisa-0128-1996.chatgpt.site/api';
export const ONLINE_POLL_INTERVAL = 1000;

export class OnlineClientError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', phase = null, payload = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'OnlineClientError';
    this.status = status;
    this.code = code;
    this.phase = phase;
    this.payload = payload;
  }
}

const aborted = () => Object.assign(new Error('このオンライン操作は取り消されました。'), { name: 'AbortError', code: 'CANCELLED' });
const isAbort = error => error?.name === 'AbortError';
const privateKeys = new Set(['token', 'accesstoken', 'refreshtoken', 'tokenhash', 'authorization', 'bearer', 'credentials', 'activationcode', 'operatorcode', 'secret']);
const publicPayload = payload => {
  if (Array.isArray(payload)) return payload.map(publicPayload);
  if (!payload || typeof payload !== 'object') return payload;
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !privateKeys.has(key.replace(/[_-]/g, '').toLowerCase())).map(([key, value]) => [key, publicPayload(value)]));
};
const cloneProfile = profile => profile ? publicPayload(profile) : null;
const PROFILE_ORIGINS = new Set(['mountain','river','seed','grass','flower','tree','king']);
const actionIdentifier = () => globalThis.crypto?.randomUUID?.() || `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * Methods return server JSON with credential fields removed. Link codes are
 * returned only to their caller; they are not included in onUpdate events.
 * onUpdate receives { phase, payload, source: 'request'|'poll' }; phases include
 * profile/room/queue/match/cloud/account/public/presence/operator/inbox/events.
 * refreshProfile always revalidates an existing bearer and returns current server activity.
 * A revoked identity is explicit and is never replaced by a silent registration.
 * Cancellation / superseded responses reject with AbortError and do not call onError.
 * documentImpl and timers allow deterministic tests; browsers use their native equivalents.
 */
export function createOnlineClient({
  baseUrl = ONLINE_API_BASE,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage,
  onUpdate,
  onError,
  documentImpl = globalThis.document ?? null,
  timers = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) },
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl が必要です。');
  const endpoint = String(baseUrl).replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(endpoint)) throw new TypeError('baseUrl は http または https の URL を指定してください。');
  let savedStorage = storage;
  if (storage === undefined) {
    try { savedStorage = globalThis.localStorage ?? null; } catch { savedStorage = null; }
  }
  let token = null;
  let profile = null;
  let nickname = '';
  let origin = 'mountain';
  let authInvalidated = false;
  try {
    const stored = JSON.parse(savedStorage?.getItem(ONLINE_STORAGE_KEY) || 'null');
    if (stored && typeof stored === 'object') {
      if (typeof stored.token === 'string' && stored.token) token = stored.token;
      if (stored.profile && typeof stored.profile.id === 'string') profile = cloneProfile(stored.profile);
      if (typeof stored.nickname === 'string') nickname = stored.nickname;
      if (PROFILE_ORIGINS.has(stored.profile?.origin)) origin = stored.profile.origin;
      else if (PROFILE_ORIGINS.has(stored.origin)) origin = stored.origin;
      authInvalidated = stored.authInvalidated === true;
    }
  } catch { /* Unreadable local storage should not prevent an in-memory session. */ }

  let destroyed = false;
  let ready = false;
  let registration = null;
  let activityVersion = 0;
  let identityVersion = 0;
  let identityChanging = false;
  let identityChange = null;
  let roomCode = null;
  let pollSession = null;
  let membershipTail = Promise.resolve();
  let profileMutationTail = Promise.resolve();
  let lastError = null;
  const requests = new Set();
  const reads = new Map();
  const actions = new Map();
  const latestRevisions = new Map();
  const auxiliaryReads = new Map();
  const reportedErrors = new WeakSet();
  const visible = () => !documentImpl || (!documentImpl.hidden && documentImpl.visibilityState !== 'hidden');
  const usable = () => { if (destroyed) throw aborted(); };
  const current = (version, guard) => !destroyed && version === activityVersion && (!guard || guard());
  const assertCurrent = (version, guard) => { if (!current(version, guard)) throw aborted(); };
  const safeCall = (callback, value) => { try { callback?.(value); } catch { /* Consumer callbacks do not control transport cleanup. */ } };
  const saveIdentity = () => {
    try { savedStorage?.setItem(ONLINE_STORAGE_KEY, JSON.stringify({ token, profile, nickname, origin, authInvalidated })); } catch { /* Continue in memory. */ }
  };
  const acceptProfile = payload => {
    if (!payload.profile || typeof payload.profile.id !== 'string') {
      throw new OnlineClientError('プロフィールを読み取れませんでした。', { code: 'INVALID_RESPONSE', phase: 'profile' });
    }
    if (typeof payload.token === 'string' && payload.token) token = payload.token;
    profile = cloneProfile(payload.profile);
    nickname = typeof profile.nickname === 'string' ? profile.nickname : nickname;
    origin = PROFILE_ORIGINS.has(profile.origin) ? profile.origin : origin;
    authInvalidated = false;
    ready = true;
    saveIdentity();
  };
  const assertIdentity = version => { usable(); if (version !== identityVersion) throw aborted(); };
  const sessionError = () => new OnlineClientError('この端末の連携が解除されています。端末連携で接続し直してください。', { status: 401, code: 'SESSION_REVOKED', phase: 'profile' });
  function invalidateIdentity(exceptRecord) {
    identityVersion += 1;
    token = null;
    ready = false;
    authInvalidated = true;
    clearPoll();
    roomCode = null;
    latestRevisions.clear();
    for (const item of requests) if (item !== exceptRecord) item.controller.abort();
    saveIdentity();
  }
  const report = (error, phase, version = activityVersion, guard) => {
    if (isAbort(error) || !current(version, guard) || reportedErrors.has(error)) return;
    reportedErrors.add(error);
    if (error.phase == null) error.phase = phase;
    lastError = { message: error.message, status: error.status || 0, code: error.code || 'NETWORK_ERROR', phase };
    safeCall(onError, error);
  };
  const emit = (phase, payload, source, version, guard) => {
    assertCurrent(version, guard);
    const match = payload?.match;
    if (match?.id && Number.isInteger(match.revision)) {
      const previous = latestRevisions.get(match.id);
      if (previous !== undefined && match.revision < previous) throw aborted();
      latestRevisions.set(match.id, match.revision);
    }
    lastError = null;
    safeCall(onUpdate, { phase, payload, source });
    return payload;
  };

  async function request(path, { method = 'GET', body, authenticate = true, phase, category = 'read', signal, keepalive = false } = {}) {
    usable();
    if (authenticate && !token) throw new OnlineClientError('オンラインプロフィールが必要です。', { status: 401, code: 'AUTH_REQUIRED', phase });
    const controller = new AbortController();
    const requestIdentity = identityVersion;
    const record = { controller, category };
    requests.add(record);
    const forwardAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });
    const headers = { Accept: 'application/json' };
    if (authenticate) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetchImpl(`${endpoint}${path}`, {
        method, headers, credentials: 'omit', cache: 'no-store', signal: controller.signal,
        ...(keepalive ? { keepalive: true } : {}),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (destroyed || controller.signal.aborted) throw aborted();
      let payload;
      try { payload = await response.json(); }
      catch (cause) {
        throw new OnlineClientError('サーバーの応答を読み取れませんでした。', { status: response.status || 0, code: 'INVALID_RESPONSE', phase, cause });
      }
      if (destroyed || controller.signal.aborted) throw aborted();
      assertIdentity(requestIdentity);
      if (!response.ok || !payload || payload.ok !== true) {
        if (authenticate && response.status === 401) invalidateIdentity(record);
        throw new OnlineClientError(payload?.error || 'オンライン操作を完了できませんでした。', {
          status: response.status || 0, code: payload?.code || 'REQUEST_FAILED', phase, payload: publicPayload(payload),
        });
      }
      return payload;
    } catch (error) {
      if (destroyed || controller.signal.aborted || isAbort(error)) throw aborted();
      if (error instanceof OnlineClientError) throw error;
      throw new OnlineClientError('サーバーに接続できません。通信状況を確認して、もう一度お試しください。', { phase, cause: error });
    } finally {
      requests.delete(record);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }

  function loadProfile(requestedNickname, refresh = false, requestedOrigin) {
    try { usable(); } catch (error) { return Promise.reject(error); }
    if (identityChanging) return Promise.reject(new OnlineClientError('端末連携を切り替えています。', { code: 'IDENTITY_CHANGING', phase: 'profile' }));
    if (authInvalidated) return Promise.reject(sessionError());
    if (registration) return registration;
    if (ready && !refresh) return Promise.resolve({ ok: true, profile: cloneProfile(profile) });
    const version = activityVersion;
    const identity = identityVersion;
    const task = (async () => {
      try {
        let payload;
        if (token) {
          payload = await request('/profile', { phase: 'profile', category: 'profile' });
        }
        if (!payload) {
          const name = typeof requestedNickname === 'string' ? requestedNickname.trim() : nickname;
          payload = await request('/profile', {
            method: 'POST', body: { ...(name ? { nickname: name } : {}), origin: requestedOrigin === undefined ? origin : requestedOrigin }, authenticate: false, phase: 'profile', category: 'profile',
          });
          if (typeof payload.token !== 'string' || !payload.token) {
            throw new OnlineClientError('認証情報を取得できませんでした。', { code: 'INVALID_RESPONSE', phase: 'profile' });
          }
        }
        assertIdentity(identity);
        acceptProfile(payload);
        const safe = publicPayload(payload);
        if (current(version)) emit('profile', safe, 'request', version);
        return safe;
      } catch (error) {
        report(error, 'profile', version);
        throw error;
      }
    })();
    registration = task;
    task.finally(() => { if (registration === task) registration = null; }).catch(() => {});
    return task;
  }

  const ensureProfile = requestedNickname => loadProfile(requestedNickname);
  // Refresh activity after a lost mutation response; a ready guest must still reach the server.
  const refreshProfile = () => loadProfile(undefined, true);

  function updateProfile(values = {}) {
    try { usable(); } catch (error) { return Promise.reject(error); }
    if (!values || typeof values !== 'object' || Array.isArray(values)) return Promise.reject(new TypeError('プロフィールはオブジェクトで指定してください。'));
    const version = activityVersion;
    const changes = {};
    if (values.nickname !== undefined) changes.nickname = String(values.nickname ?? '').trim();
    if (values.origin !== undefined) changes.origin = values.origin;
    const task = profileMutationTail.catch(() => {}).then(async () => {
      try {
        assertCurrent(version);
        const initial = await loadProfile(changes.nickname, false, changes.origin);
        assertCurrent(version);
        if (Object.entries(changes).every(([key,value]) => profile?.[key] === value)) return initial;
        const payload = await request('/profile', { method: 'POST', body: changes, phase: 'profile', category: 'profile' });
        assertCurrent(version);
        acceptProfile(payload);
        return emit('profile', publicPayload(payload), 'request', version);
      } catch (error) { report(error, 'profile', version); throw error; }
    });
    profileMutationTail = task.catch(() => {});
    return task;
  }
  const updateNickname = value => updateProfile({ nickname: value });

  function clearPoll() {
    const old = pollSession;
    pollSession = null;
    if (old) {
      if (old.timer !== null) timers.clearTimeout(old.timer);
      old.controller?.abort();
    }
  }
  function invalidateActivity() {
    activityVersion += 1;
    clearPoll();
    for (const record of requests) if (record.category === 'read') record.controller.abort();
    return activityVersion;
  }
  function stopPolling() { invalidateActivity(); }

  function membership(operation) {
    try { usable(); } catch (error) { return Promise.reject(error); }
    const version = invalidateActivity();
    const task = membershipTail.catch(() => {}).then(() => operation(version));
    membershipTail = task.catch(() => {});
    return task;
  }
  async function changeMembership(path, body, phase, version, method = 'POST') {
    await ensureProfile();
    assertCurrent(version);
    try {
      const raw = await request(path, { method, ...(body !== undefined ? { body } : {}), phase, category: 'membership' });
      // Retain a newly created room's code even if cancellation arrived while the server was creating it.
      // leaveRoom waits for this mutation before sending DELETE, so it can close that room correctly.
      if (raw.room?.code) roomCode = raw.room.code;
      assertCurrent(version);
      return emit(phase, publicPayload(raw), 'request', version);
    } catch (error) { report(error, phase, version); throw error; }
  }
  const encode = value => encodeURIComponent(String(value ?? ''));
  function createRoom(deck, special, deckSlotId=null) {
    return membership(version => changeMembership('/rooms', { deck, special, ...(deckSlotId?{deckSlotId}:{}) }, 'room', version));
  }
  function joinRoom(code, deck, special, deckSlotId=null) {
    return membership(version => changeMembership(`/rooms/${encode(String(code).trim())}/join`, { deck, special, ...(deckSlotId?{deckSlotId}:{}) }, 'room', version));
  }
  function startRanked(deck, special, deckSlotId=null) {
    return membership(version => changeMembership('/queue', { deck, special, ...(deckSlotId?{deckSlotId}:{}) }, 'queue', version));
  }
  function leaveRoom(code) {
    return membership(async version => {
      const leavingCode = code || roomCode;
      if (!leavingCode) return emit('room', { ok: true, status: 'idle', room: null, match: null }, 'request', version);
      const payload = await changeMembership(`/rooms/${encode(leavingCode)}`, undefined, 'room', version, 'DELETE');
      if (current(version)) roomCode = null;
      return payload;
    });
  }
  function cancelRanked() {
    return membership(version => changeMembership('/queue', undefined, 'queue', version, 'DELETE'));
  }

  function readPhase(phase, path, { source = 'request', version = activityVersion, guard, signal } = {}) {
    const key = `${version}:${phase}:${path}`;
    if (reads.has(key)) return reads.get(key);
    const task = (async () => {
      try {
        await ensureProfile();
        assertCurrent(version, guard);
        const payload = publicPayload(await request(path, { phase, category: 'read', signal }));
        assertCurrent(version, guard);
        if (payload.room?.code) roomCode = payload.room.code;
        return emit(phase, payload, source, version, guard);
      } catch (error) { report(error, phase, version, guard); throw error; }
    })();
    reads.set(key, task);
    task.finally(() => { if (reads.get(key) === task) reads.delete(key); }).catch(() => {});
    return task;
  }
  function getRoom(code = roomCode) {
    if (!code) return Promise.reject(new OnlineClientError('ルームコードを指定してください。', { code: 'ROOM_REQUIRED', phase: 'room' }));
    return readPhase('room', `/rooms/${encode(code)}`);
  }
  const getQueue = () => readPhase('queue', '/queue');
  const getMatch = id => readPhase('match', `/matches/${encode(id)}`);

  // Cloud/account requests have their own identity guard. Changing an arena poll
  // must not cancel a save, but switching accounts must invalidate its response.
  const emitAuxiliary = (phase, payload) => {
    const safe = publicPayload(payload);
    const eventPayload = safe?.link?.code ? { ...safe, link: { expiresAt: safe.link.expiresAt } } : safe;
    safeCall(onUpdate, { phase, payload: eventPayload, source: 'request' });
    return safe;
  };
  function auxiliary(phase, path, { method = 'GET', body, authenticate = true, keepalive = false } = {}) {
    try { usable(); } catch (error) { return Promise.reject(error); }
    const identity = identityVersion;
    const key = `${identity}:${phase}:${path}`;
    if (method === 'GET' && auxiliaryReads.has(key)) return auxiliaryReads.get(key);
    const task = (async () => {
      try {
        if (authenticate) await ensureProfile();
        assertIdentity(identity);
        const payload = await request(path, { method, body, authenticate, phase, category: 'auxiliary', keepalive });
        assertIdentity(identity);
        if (authenticate && payload.profile) {
          if (payload.profile.id !== profile?.id) throw new OnlineClientError('保存先のプロフィールが一致しません。', { code: 'IDENTITY_MISMATCH', phase });
          acceptProfile({ profile: payload.profile });
        }
        return emitAuxiliary(phase, payload);
      } catch (error) {
        if (identity === identityVersion || error.status === 401) report(error, phase, activityVersion);
        throw error;
      }
    })();
    if (method === 'GET') {
      auxiliaryReads.set(key, task);
      task.finally(() => { if (auxiliaryReads.get(key) === task) auxiliaryReads.delete(key); }).catch(() => {});
    }
    return task;
  }
  const getCloudSave = () => auxiliary('cloud', '/cloud-save');
  const saveCloudSave = values => {
    const mutationId = values?.mutationId || actionIdentifier();
    return auxiliary('cloud', '/cloud-save', { method: 'POST', body: { revision: values?.revision, data: publicPayload(values?.data), mutationId } }).catch(error => { if (!isAbort(error)) error.mutationId = mutationId; throw error; });
  };
  const createDeviceLink = () => auxiliary('account', '/account/link-code', { method: 'POST', body: {} });
  const getSessions = () => auxiliary('account', '/account/sessions');
  const getPublicStatus = () => auxiliary('public', '/public-status', { authenticate: false });
  const updatePresence = (values = {}, options = {}) => auxiliary('presence', '/presence', { method: 'POST', body: { online: values.online === true, ...(values.login === true ? { login: true } : {}) }, keepalive: options.keepalive === true });
  const activateOperator = code => auxiliary('operator', '/operator/activate', { method: 'POST', body: { code } });
  const claimOperatorRegalia = (code, revision, options={}) => auxiliary('cloud', '/operator/regalia/claim', { method: 'POST', body: { code, revision, ...(options.upgrade?{upgrade:true}:{}) } });
  const getOperator = () => auxiliary('operator', '/operator');
  const getOperatorDeck = () => auxiliary('operator', '/operator/deck');
  const replaceOperatorArtwork = artwork => auxiliary('operator','/operator/artwork',{method:'POST',body:{artwork}});
  const updateOperatorSettings = settings => operatorMutation('/operator/settings', settings);
  const queryString = values => {const query=new URLSearchParams(Object.entries(values||{}).filter(([,value])=>value!==undefined&&value!==null).map(([key,value])=>[key,String(value)])).toString();return query?'?'+query:'';};
  const getOperatorRecords = values => auxiliary('operator','/operator/records'+queryString(values));
  const getInbox = values => auxiliary('inbox', '/inbox'+queryString(values));
  const markInboxRead = id => auxiliary('inbox', `/inbox/${encode(id)}/read`, { method: 'POST', body: {} });
  const claimGift = (id, revision) => auxiliary('cloud', `/inbox/${encode(id)}/claim`, { method: 'POST', body: { revision } });
  const getEvents = values => auxiliary('events', '/events'+queryString(values));
  const claimEvent = (id, revision) => auxiliary('cloud', `/events/${encode(id)}/claim`, { method: 'POST', body: { revision } });
  function operatorMutation(path, values = {}) {
    const mutationId = values?.mutationId || actionIdentifier();
    return auxiliary('operator', path, { method: 'POST', body: { ...publicPayload(values), mutationId } }).catch(error => {
      if (!isAbort(error)) error.mutationId = mutationId;
      throw error;
    });
  }
  const sendOperatorMessage = values => operatorMutation('/operator/messages', values);
  const sendOperatorGift = values => operatorMutation('/operator/gifts', values);
  const saveOperatorEvent = values => operatorMutation('/operator/events', values);
  const saveOperatorNotice = values => operatorMutation('/operator/notices', values);
  async function revokeSession(id) {
    const payload = await auxiliary('account', `/account/sessions/${encode(id)}`, { method: 'DELETE' });
    if (payload.currentRevoked) {
      invalidateIdentity();
      emitAuxiliary('profile', { ok: true, profile: cloneProfile(profile), sessionRevoked: true });
    }
    return payload;
  }
  function claimDeviceLink(code, deviceName) {
    try { usable(); } catch (error) { return Promise.reject(error); }
    if (identityChange) return identityChange;
    identityChanging = true;
    invalidateActivity();
    identityVersion += 1;
    for (const record of requests) record.controller.abort();
    registration = null;
    const identity = identityVersion;
    const task = (async () => {
      try {
        const payload = await request('/account/link-claim', { method: 'POST', body: { code, ...(deviceName ? { deviceName } : {}) }, authenticate: false, phase: 'account', category: 'identity' });
        assertIdentity(identity);
        if (typeof payload.token !== 'string' || !payload.token) throw new OnlineClientError('連携先の認証情報を取得できませんでした。', { code: 'INVALID_RESPONSE', phase: 'account' });
        acceptProfile(payload);
        roomCode = null;
        latestRevisions.clear();
        identityChanging = false;
        return emitAuxiliary('profile', payload);
      } catch (error) { report(error, 'account', activityVersion); throw error; }
      finally { identityChanging = false; }
    })();
    identityChange = task;
    task.finally(() => { if (identityChange === task) identityChange = null; }).catch(() => {});
    return task;
  }

  function sendAction(matchId, action) {
    const body = { ...action, actionId: action?.actionId || actionIdentifier() };
    const version = activityVersion;
    const key = `${version}:${matchId}:${body.actionId}:${JSON.stringify(body)}`;
    if (actions.has(key)) return actions.get(key);
    const task = (async () => {
      try {
        await ensureProfile();
        assertCurrent(version);
        const payload = publicPayload(await request(`/matches/${encode(matchId)}/actions`, { method: 'POST', body, phase: 'match', category: 'action' }));
        return emit('match', payload, 'request', version);
      } catch (error) {
        if (!isAbort(error)) error.actionId = body.actionId;
        report(error, 'match', version);
        throw error;
      }
    })();
    actions.set(key, task);
    task.finally(() => { if (actions.get(key) === task) actions.delete(key); }).catch(() => {});
    return task;
  }

  function startPolling(target = {}) {
    usable();
    const choices = [Boolean(target.roomCode), target.queue === true, Boolean(target.matchId)].filter(Boolean).length;
    if (choices !== 1) throw new TypeError('roomCode、queue、matchId のいずれか1つを指定してください。');
    const version = invalidateActivity();
    const phase = target.roomCode ? 'room' : target.queue ? 'queue' : 'match';
    const path = phase === 'room' ? `/rooms/${encode(target.roomCode)}` : phase === 'queue' ? '/queue' : `/matches/${encode(target.matchId)}`;
    const session = { phase, target: { ...target }, version, timer: null, controller: null, inFlight: false, visibilityVersion: 0 };
    pollSession = session;
    const tick = async () => {
      if (pollSession !== session || destroyed || !visible() || session.inFlight) return;
      session.timer = null;
      session.inFlight = true;
      session.controller = new AbortController();
      const visibilityVersion = session.visibilityVersion;
      const guard = () => pollSession === session && visible() && session.visibilityVersion === visibilityVersion;
      try { await readPhase(phase, path, { source: 'poll', version, guard, signal: session.controller.signal }); }
      catch { /* Errors are reported once by readPhase; cancellation is intentionally silent. */ }
      finally {
        session.inFlight = false;
        session.controller = null;
        if (pollSession === session && !destroyed && visible()) session.timer = timers.setTimeout(tick, ONLINE_POLL_INTERVAL);
      }
    };
    session.tick = tick;
    if (visible()) void tick();
    return () => { if (pollSession === session) stopPolling(); };
  }
  function handleVisibility() {
    const session = pollSession;
    if (!session || destroyed) return;
    session.visibilityVersion += 1;
    if (session.timer !== null) { timers.clearTimeout(session.timer); session.timer = null; }
    if (!visible()) session.controller?.abort();
    else if (!session.inFlight) void session.tick();
  }
  documentImpl?.addEventListener?.('visibilitychange', handleVisibility);

  function getStatus() {
    return {
      profile: cloneProfile(profile), authenticated: ready && Boolean(token), destroyed,
      authInvalidated, identityChanging,
      polling: Boolean(pollSession), phase: pollSession?.phase || null,
      target: pollSession ? { ...pollSession.target } : null,
      visible: visible(), lastError: lastError ? { ...lastError } : null,
    };
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    invalidateActivity();
    for (const record of requests) record.controller.abort();
    documentImpl?.removeEventListener?.('visibilitychange', handleVisibility);
  }
  return Object.freeze({
    ensureProfile, refreshProfile, updateProfile, updateNickname, createRoom, joinRoom, getRoom, leaveRoom,
    startRanked, getQueue, cancelRanked, getMatch, sendAction,
    getCloudSave, saveCloudSave, createDeviceLink, claimDeviceLink, getSessions, revokeSession,
    getPublicStatus, updatePresence, activateOperator, claimOperatorRegalia, getOperator, getOperatorDeck, replaceOperatorArtwork, updateOperatorSettings,
    getInbox, markInboxRead, claimGift, getEvents, claimEvent,
    sendOperatorMessage, sendOperatorGift, saveOperatorEvent, saveOperatorNotice, getOperatorRecords,
    startPolling, stopPolling, destroy, getStatus,
    get profile() { return cloneProfile(profile); },
  });
}
