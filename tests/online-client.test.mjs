import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineClient, ONLINE_STORAGE_KEY, ONLINE_POLL_INTERVAL, OnlineClientError } from '../online.js';

const BASE = 'https://beast-king.example/api';
const PROFILE = { id: 'guest-1', nickname: '旅人', origin: 'mountain', rating: 1000, wins: 0, losses: 0, draws: 0 };
const DECK = Array.from({ length: 32 }, (_, i) => `B${String(i + 1).padStart(4, '0')}`);
const SPECIAL = ['F0001', 'F0002', 'F0003', 'F0004'];
const reply = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const authReply = () => reply({ ok: true, token: 'private-token', profile: { ...PROFILE } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
const memoryStorage = (initial = {}) => {
  const entries = new Map(Object.entries(initial));
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), entries };
};
const fakeTimers = () => {
  let next = 1;
  const pending = new Map();
  return {
    setTimeout(callback, delay) { const id = next++; pending.set(id, { callback, delay }); return id; },
    clearTimeout(id) { pending.delete(id); },
    runNext() { const first = pending.entries().next().value; if (!first) return false; pending.delete(first[0]); void first[1].callback(); return true; },
    pending,
  };
};
const visibleDocument = () => {
  const doc = new EventTarget();
  doc.hidden = false;
  doc.visibilityState = 'visible';
  doc.setHidden = hidden => { doc.hidden = hidden; doc.visibilityState = hidden ? 'hidden' : 'visible'; doc.dispatchEvent(new Event('visibilitychange')); };
  return doc;
};
function harness(handler, options = {}) {
  const calls = [], updates = [], errors = [];
  const client = createOnlineClient({
    baseUrl: BASE, storage: options.storage || memoryStorage(),
    fetchImpl: async (url, init) => {
      const call = { url, path: url.slice(BASE.length), ...init, parsedBody: init.body ? JSON.parse(init.body) : undefined };
      calls.push(call);
      return handler(call, calls.length);
    },
    onUpdate: event => updates.push(event), onError: error => errors.push(error),
    ...options,
  });
  return { client, calls, updates, errors };
}

test('concurrent registration makes one request and keeps bearer credentials out of public state', async () => {
  const registration = deferred(), storage = memoryStorage();
  const h = harness(call => call.path === '/profile' ? registration.promise : reply({ ok: true, status: 'waiting', room: { code: 'ABC123' }, match: null }), { storage });
  const first = h.client.ensureProfile('旅人');
  const second = h.client.ensureProfile('旅人');
  assert.equal(first, second);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].headers.Authorization, undefined);
  registration.resolve(authReply());
  const payload = await first;
  assert.equal(payload.profile.id, PROFILE.id);
  assert.equal('token' in payload, false);
  assert.equal(JSON.stringify(h.updates).includes('private-token'), false);
  assert.equal(JSON.stringify(h.client.getStatus()).includes('private-token'), false);
  assert.equal(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)).token, 'private-token');
  assert.deepEqual([...storage.entries.keys()], [ONLINE_STORAGE_KEY]);
  await h.client.createRoom(DECK, SPECIAL);
  assert.equal(h.calls[1].headers.Authorization, 'Bearer private-token');
  assert.deepEqual(h.calls[1].parsedBody, { deck: DECK, special: SPECIAL });
  assert.equal(h.calls[1].credentials, 'omit');
  const mutable = h.client.profile;
  mutable.nickname = '変更';
  assert.equal(h.client.profile.nickname, '旅人');
  h.client.destroy();
});

test('stored identity is verified with its bearer and nickname changes persist without a second guest', async () => {
  const storage = memoryStorage({ [ONLINE_STORAGE_KEY]: JSON.stringify({ token: 'saved-token', profile: PROFILE, nickname: '旅人' }) });
  const h = harness(call => reply({ ok: true, profile: { ...PROFILE, nickname: call.method === 'POST' ? call.parsedBody.nickname : '旅人' } }), { storage });
  await h.client.ensureProfile();
  await h.client.updateNickname('新しい名');
  assert.deepEqual(h.calls.map(c => [c.method, c.path]), [['GET', '/profile'], ['POST', '/profile']]);
  assert.ok(h.calls.every(c => c.headers.Authorization === 'Bearer saved-token'));
  assert.equal(h.client.profile.nickname, '新しい名');
  assert.equal(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)).nickname, '新しい名');
  assert.equal(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)).token, 'saved-token');
  h.client.destroy();
});

test('updateProfile registers a selected origin in one request and keeps the token private',async()=>{
  const storage=memoryStorage();
  const h=harness(call=>reply({ok:true,token:'private-token',profile:{...PROFILE,...call.parsedBody}}),{storage});
  const result=await h.client.updateProfile({nickname:'草の王',origin:'grass'});
  assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].parsedBody,{nickname:'草の王',origin:'grass'});assert.equal(h.calls[0].headers.Authorization,undefined);
  assert.equal(result.profile.origin,'grass');assert.equal(result.token,undefined);assert.equal(h.client.profile.origin,'grass');
  assert.equal(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)).profile.origin,'grass');
  assert.equal(JSON.stringify(h.updates).includes('private-token'),false);assert.equal(JSON.stringify(h.client.getStatus()).includes('private-token'),false);
  h.client.destroy();
});

test('origin updates and legacy nickname updates preserve each other and refreshProfile returns the saved choice',async()=>{
  let serverProfile={...PROFILE,origin:'river'};
  const storage=memoryStorage({[ONLINE_STORAGE_KEY]:JSON.stringify({token:'saved-token',profile:serverProfile,nickname:serverProfile.nickname})});
  const h=harness(call=>{
    if(call.method==='POST'){
      if(call.parsedBody.origin==='invalid')return reply({ok:false,code:'invalid_origin',error:'オリジンを選んでください。'},400);
      serverProfile={...serverProfile,...call.parsedBody};
    }
    return reply({ok:true,profile:{...serverProfile},activity:null});
  },{storage});
  await h.client.ensureProfile();
  assert.equal((await h.client.updateProfile({origin:'flower'})).profile.origin,'flower');assert.deepEqual(h.calls.at(-1).parsedBody,{origin:'flower'});
  assert.equal((await h.client.updateNickname('花の王')).profile.origin,'flower');assert.deepEqual(h.calls.at(-1).parsedBody,{nickname:'花の王'});
  const refreshed=await h.client.refreshProfile();assert.equal(refreshed.profile.origin,'flower');assert.equal(refreshed.profile.nickname,'花の王');assert.equal(refreshed.token,undefined);
  await assert.rejects(h.client.updateProfile({origin:'invalid'}),{code:'invalid_origin'});
  assert.equal(h.client.profile.origin,'flower');assert.equal(h.client.profile.nickname,'花の王');
  assert.ok(h.calls.every(call=>call.headers.Authorization==='Bearer saved-token'));
  assert.equal(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)).profile.origin,'flower');assert.equal(JSON.stringify(h.updates).includes('saved-token'),false);
  h.client.destroy();
});

test('an expired stored bearer is invalidated without silently registering a different player', async () => {
  const storage = memoryStorage({ [ONLINE_STORAGE_KEY]: JSON.stringify({ token: 'expired-token', profile: PROFILE, nickname: '旅人' }) });
  const h = harness(call => call.method === 'GET' ? reply({ ok: false, code: 'UNAUTHORIZED', error: '認証期限切れ' }, 401) : authReply(), { storage });
  const checks = await Promise.allSettled([h.client.ensureProfile(), h.client.ensureProfile()]);
  assert.ok(checks.every(result => result.status === 'rejected' && result.reason.status === 401));
  assert.equal(h.calls.length, 1);
  assert.equal(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)).token, null);
  assert.equal(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)).authInvalidated, true);
  assert.equal(h.errors.length, 1);
  assert.equal(h.client.getStatus().authenticated, false);
  assert.equal(h.client.getStatus().authInvalidated, true);
  await assert.rejects(h.client.ensureProfile(), { code: 'SESSION_REVOKED' });
  assert.equal(h.calls.length, 1);
  assert.equal(JSON.stringify(h.errors.map(error => error.payload)).includes('expired-token'), false);
  h.client.destroy();
});

test('cancelling ranked discards a late matched response and leaves BOT decisions to the server', async () => {
  const late = deferred();
  const h = harness(call => {
    if (call.path === '/profile') return authReply();
    if (call.method === 'GET') return late.promise;
    return reply({ ok: true, status: call.method === 'DELETE' ? 'idle' : 'waiting', queue: null, match: null });
  });
  await h.client.startRanked(DECK, SPECIAL);
  const pending = h.client.getQueue();
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await flush();
  const cancelled = await h.client.cancelRanked();
  assert.equal(cancelled.status, 'idle');
  late.resolve(reply({ ok: true, status: 'matched', match: { id: 'too-late', revision: 0 } }));
  await rejected;
  assert.equal(h.updates.at(-1).payload.status, 'idle');
  assert.equal(h.updates.some(u => u.payload.status === 'matched'), false);
  assert.equal(h.errors.length, 0);
  assert.deepEqual(h.calls.filter(c => c.path === '/queue').map(c => c.method), ['POST', 'GET', 'DELETE']);
  h.client.destroy();
});

test('leaving during room creation waits for its code and closes the room without reviving the cancelled UI', async () => {
  const creation = deferred();
  const h = harness(call => {
    if (call.path === '/profile') return authReply();
    if (call.method === 'POST') return creation.promise;
    return reply({ ok: true, status: 'closed', room: { code: 'ABC123' }, match: null });
  });
  await h.client.ensureProfile();
  const pending = h.client.createRoom(DECK, SPECIAL);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await flush();
  const leaving = h.client.leaveRoom();
  await flush();
  assert.equal(h.calls.some(c => c.method === 'DELETE'), false);
  creation.resolve(reply({ ok: true, status: 'waiting', room: { code: 'ABC123' }, match: null }));
  await rejected;
  await leaving;
  assert.equal(h.calls.at(-1).path, '/rooms/ABC123');
  assert.equal(h.calls.at(-1).method, 'DELETE');
  assert.equal(h.updates.some(u => u.phase === 'room' && u.payload.status === 'waiting'), false);
  assert.equal(h.updates.at(-1).payload.status, 'closed');
  h.client.destroy();
});

test('polling waits for each response, pauses while hidden and rejects results from old visibility sessions', async () => {
  const timers = fakeTimers(), doc = visibleDocument(), pending = [];
  const h = harness(call => {
    if (call.path === '/profile') return authReply();
    const item = deferred(); pending.push(item); return item.promise;
  }, { timers, documentImpl: doc });
  await h.client.ensureProfile();
  h.client.startPolling({ queue: true });
  await flush();
  assert.equal(pending.length, 1);
  assert.equal(timers.pending.size, 0);
  assert.equal(timers.runNext(), false);
  pending[0].resolve(reply({ ok: true, status: 'waiting', queue: { elapsedSeconds: 61, botAfterSeconds: 60 }, match: null }));
  await flush();
  assert.equal(h.updates.at(-1).payload.status, 'waiting', 'the client must not invent a BOT after a local deadline');
  assert.equal(timers.pending.size, 1);
  assert.equal([...timers.pending.values()][0].delay, ONLINE_POLL_INTERVAL);
  timers.runNext();
  await flush();
  assert.equal(pending.length, 2);
  doc.setHidden(true);
  pending[1].resolve(reply({ ok: true, status: 'matched', match: { id: 'hidden', revision: 1 } }));
  await flush();
  assert.equal(timers.pending.size, 0);
  assert.equal(h.updates.filter(u => u.phase === 'queue').length, 1);
  doc.setHidden(false);
  await flush();
  assert.equal(pending.length, 3);
  h.client.stopPolling();
  pending[2].resolve(reply({ ok: true, status: 'matched', match: { id: 'stopped', revision: 1 } }));
  await flush();
  assert.equal(h.updates.filter(u => u.phase === 'queue').length, 1);
  assert.equal(h.client.getStatus().polling, false);
  assert.equal(h.errors.length, 0);
  h.client.destroy();
});

test('simultaneous match reads share transport and an older revision cannot replace a newer action result', async () => {
  const old = deferred();
  const h = harness(call => {
    if (call.path === '/profile') return authReply();
    if (call.method === 'GET') return old.promise;
    return reply({ ok: true, match: { id: 'match-1', revision: 5, state: {} } });
  });
  await h.client.ensureProfile();
  const first = h.client.getMatch('match-1');
  const second = h.client.getMatch('match-1');
  assert.equal(first, second);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await flush();
  await h.client.sendAction('match-1', { revision: 4, kind: 'endTurn', actionId: 'action-1' });
  old.resolve(reply({ ok: true, match: { id: 'match-1', revision: 4, state: {} } }));
  await rejected;
  assert.equal(h.calls.filter(c => c.method === 'GET').length, 1);
  assert.deepEqual(h.updates.filter(u => u.phase === 'match').map(u => u.payload.match.revision), [5]);
  assert.equal(h.errors.length, 0);
  h.client.destroy();
});

test('HTTP action conflicts preserve server details and action IDs for caller-managed refresh', async () => {
  const current = { id: 'match-1', revision: 9, state: {} };
  const h = harness(call => {
    if (call.path === '/profile') return authReply();
    if (call.method === 'POST') return reply({ ok: false, code: 'REVISION_CONFLICT', error: '最新の対戦を読み直してください。', match: current }, 409);
    return reply({ ok: true, match: current });
  });
  await h.client.ensureProfile();
  await assert.rejects(h.client.sendAction('match-1', { revision: 8, kind: 'endTurn', actionId: 'retry-safe' }), error => {
    assert.ok(error instanceof OnlineClientError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'REVISION_CONFLICT');
    assert.equal(error.payload.match.revision, 9);
    assert.equal(error.actionId, 'retry-safe');
    return true;
  });
  assert.equal(h.errors.length, 1);
  assert.equal(h.calls.filter(c => c.path === '/matches/match-1').length, 0, 'the UI chooses when to refresh a conflict');
  assert.equal(h.calls.at(-1).parsedBody.actionId, 'retry-safe');
  assert.equal((await h.client.getMatch('match-1')).match.revision, 9);
  h.client.destroy();
});

test('network failures report once and a later poll can recover without recreating the profile', async () => {
  const timers = fakeTimers();
  let attempts = 0;
  const h = harness(call => {
    if (call.path === '/profile') return authReply();
    if (++attempts === 1) throw new TypeError('offline');
    return reply({ ok: true, status: 'waiting', match: null });
  }, { timers });
  await h.client.ensureProfile();
  h.client.startPolling({ queue: true });
  await flush();
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].code, 'NETWORK_ERROR');
  assert.equal(h.client.getStatus().lastError.phase, 'queue');
  timers.runNext();
  await flush();
  assert.equal(h.client.getStatus().lastError, null);
  assert.equal(h.calls.filter(c => c.path === '/profile').length, 1);
  assert.equal(h.updates.at(-1).payload.status, 'waiting');
  h.client.destroy();
  assert.equal(timers.pending.size, 0);
  await assert.rejects(h.client.getQueue(), { name: 'AbortError' });
});

test('refreshProfile recovers server room activity after a successful creation loses its response', async () => {
  let created = false;
  const h = harness(call => {
    if (call.path === '/profile' && call.method === 'POST') return authReply();
    if (call.path === '/rooms' && call.method === 'POST') {
      created = true;
      throw new TypeError('response lost after commit');
    }
    if (call.path === '/profile') return reply({ ok: true, profile: { ...PROFILE }, activity: created ? { kind: 'room', roomCode: 'ABC234' } : null });
    if (call.path === '/rooms/ABC234') return reply({ ok: true, status: 'waiting', room: { code: 'ABC234' }, match: null });
    throw new Error('Unexpected request '+call.path);
  });
  await h.client.ensureProfile();
  await assert.rejects(h.client.createRoom(DECK, SPECIAL), { code: 'NETWORK_ERROR' });
  assert.equal(h.updates.some(event => event.phase === 'room'), false);
  const refreshed = await h.client.refreshProfile();
  assert.deepEqual(refreshed.activity, { kind: 'room', roomCode: 'ABC234' });
  assert.equal(h.calls.at(-1).method, 'GET');
  assert.equal(h.calls.at(-1).path, '/profile');
  assert.equal(h.calls.at(-1).headers.Authorization, 'Bearer private-token');
  assert.equal((await h.client.getRoom(refreshed.activity.roomCode)).status, 'waiting');
  assert.equal(h.calls.filter(call => call.path === '/profile' && call.method === 'POST').length, 1);
  assert.equal(h.updates.at(-1).payload.room.code, 'ABC234');
  h.client.destroy();
});

test('refreshProfile registers on first use but makes revocation explicit for an existing ready session', async () => {
  let registrations = 0, checks = 0;
  const h = harness(call => {
    if (call.method === 'GET') { checks += 1; return reply({ ok: false, code: 'UNAUTHORIZED', error: '認証期限切れ' }, 401); }
    registrations += 1;
    return reply({ ok: true, token: `token-${registrations}`, profile: { ...PROFILE }, activity: null });
  });
  await h.client.refreshProfile();
  assert.equal(registrations, 1);
  assert.equal(checks, 0);
  const first = h.client.refreshProfile();
  const second = h.client.refreshProfile();
  assert.equal(first, second);
  await assert.rejects(first, { status: 401 });
  assert.equal(checks, 1);
  assert.equal(registrations, 1);
  assert.equal(h.calls.at(-1).headers.Authorization, 'Bearer token-1');
  assert.equal(h.errors.length, 1);
  assert.equal(h.client.getStatus().authenticated, false);
  assert.equal(h.client.getStatus().authInvalidated, true);
  h.client.destroy();
});

test('cloud calls keep a pinned bearer, preserve CAS details and do not race with arena polling changes', async () => {
  const save = { revision: 3, data: { playerName: '同期した王', treasure: 100 }, updatedAt: 1234 };
  const reading = deferred();
  const h = harness(call => {
    if (call.path === '/profile') return authReply();
    if (call.path === '/cloud-save' && call.method === 'GET') return reading.promise;
    if (call.path === '/cloud-save') return reply({ ok: false, code: 'save_conflict', error: '別の端末で更新されています。', save, token: 'unexpected-secret', nested: { access_token: 'nested-secret' } }, 409);
    return reply({ ok: true, status: 'waiting', queue: {}, match: null });
  });
  await h.client.ensureProfile();
  const pending = h.client.getCloudSave();
  await flush();
  h.client.startPolling({ queue: true });
  reading.resolve(reply({ ok: true, save, profile: { ...PROFILE, nickname: '同期した王' } }));
  assert.equal((await pending).save.revision, 3);
  assert.equal(h.client.profile.nickname, '同期した王');
  await assert.rejects(h.client.saveCloudSave({ revision: 2, mutationId: 'save-once', data: { treasure: 140, token: 'never-save', nested: { authorization: 'never-save-either' } } }), error => {
    assert.equal(error.status, 409); assert.equal(error.code, 'save_conflict'); assert.equal(error.payload.save.revision, 3); assert.equal(error.mutationId, 'save-once');
    assert.equal(JSON.stringify(error.payload).includes('secret'), false); return true;
  });
  const savedCall = h.calls.find(call => call.path === '/cloud-save' && call.method === 'POST');
  assert.deepEqual(savedCall.parsedBody, { revision: 2, mutationId: 'save-once', data: { treasure: 140, nested: {} } });
  assert.equal(savedCall.headers.Authorization, 'Bearer private-token');
  h.client.destroy();
});

test('claiming a device link uses a new token for the same player and publishes no credential or link code', async () => {
  const storage = memoryStorage();
  const h = harness(call => {
    if (call.path === '/profile') return authReply();
    if (call.path === '/account/link-code') return reply({ ok: true, link: { code: 'single-use-link-code', expiresAt: 600000 } });
    if (call.path === '/account/link-claim') return reply({ ok: true, token: 'independent-device-token', profile: { ...PROFILE }, sessionId: 'device-2', save: { revision: 2, data: { treasure: 200 } } });
    if (call.path === '/account/sessions') return reply({ ok: true, sessions: [{ id: 'device-2', label: 'タブレット', isCurrent: true }] });
    return reply({ ok: true, save: { revision: 2, data: { treasure: 200 } } });
  }, { storage });
  await h.client.ensureProfile();
  assert.equal((await h.client.createDeviceLink()).link.code, 'single-use-link-code');
  const claimed = await h.client.claimDeviceLink('single-use-link-code', 'タブレット');
  assert.equal(claimed.profile.id, PROFILE.id);
  assert.equal(claimed.token, undefined);
  assert.equal(claimed.sessionId, 'device-2');
  assert.equal(h.calls.find(call => call.path === '/account/link-claim').headers.Authorization, undefined);
  assert.deepEqual(h.calls.find(call => call.path === '/account/link-claim').parsedBody, { code: 'single-use-link-code', deviceName: 'タブレット' });
  await h.client.getCloudSave();
  assert.equal(h.calls.at(-1).headers.Authorization, 'Bearer independent-device-token');
  assert.equal(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)).token, 'independent-device-token');
  assert.equal(JSON.stringify(h.updates).includes('independent-device-token'), false);
  assert.equal(JSON.stringify(h.updates).includes('single-use-link-code'), false);
  assert.equal(JSON.stringify(h.client.getStatus()).includes('independent-device-token'), false);
  assert.equal((await h.client.getSessions()).sessions[0].isCurrent, true);
  h.client.destroy();
});

test('identity switching aborts old cloud responses and a failed claim leaves the previous account intact', async () => {
  const old = deferred();
  let claimFails = true;
  const h = harness(call => {
    if (call.path === '/profile') return authReply();
    if (call.path === '/cloud-save') return old.promise;
    if (claimFails) return reply({ ok: false, code: 'invalid_link_code', error: 'コードを確認してください。' }, 400);
    return reply({ ok: true, token: 'new-account-token', profile: { ...PROFILE, id: 'linked-player' }, save: null });
  });
  await h.client.ensureProfile();
  await assert.rejects(h.client.claimDeviceLink('wrong'), { code: 'invalid_link_code' });
  assert.equal(h.client.profile.id, PROFILE.id);
  assert.equal(h.client.getStatus().authenticated, true);
  const pending = h.client.getCloudSave();
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await flush();
  claimFails = false;
  await h.client.claimDeviceLink('right');
  old.resolve(reply({ ok: true, save: { revision: 90, data: { oldAccount: true } } }));
  await rejected;
  assert.equal(h.client.profile.id, 'linked-player');
  assert.equal(h.updates.some(update => update.payload.save?.data.oldAccount), false);
  h.client.destroy();
});

test('revoking the current session survives reload and prevents a silent guest replacement', async () => {
  const storage = memoryStorage();
  const h = harness(call => call.path === '/profile' ? authReply() : reply({ ok: true, revokedId: 'device-1', currentRevoked: true }), { storage });
  await h.client.ensureProfile();
  assert.equal((await h.client.revokeSession('device-1')).currentRevoked, true);
  await assert.rejects(h.client.getCloudSave(), { code: 'SESSION_REVOKED' });
  assert.equal(h.client.getStatus().authenticated, false);
  assert.equal(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)).token, null);
  h.client.destroy();
  const reloaded = harness(() => { throw new Error('must not register another player'); }, { storage });
  await assert.rejects(reloaded.client.ensureProfile(), { code: 'SESSION_REVOKED' });
  assert.equal(reloaded.calls.length, 0);
  reloaded.client.destroy();
});

test('public status stays anonymous while operator, inbox and event mutations use their documented authenticated endpoints', async () => {
  let loseMessage = true;
  const h = harness(call => {
    if (call.path === '/public-status') return reply({ ok: true, notice: 'お知らせ', maintenance: false });
    if (call.path === '/profile') return authReply();
    if (call.path === '/operator/messages' && loseMessage) { loseMessage = false; throw new TypeError('response lost'); }
    if (call.path.endsWith('/claim')) return reply({ ok: true, save: { revision: 8, data: { treasure: 300 } }, claim: { id: 'gift-1' } });
    return reply({ ok: true, operator: { settings: { notice: '', maintenance: false } }, messages: [], gifts: [], events: [] });
  });
  await h.client.getPublicStatus();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].headers.Authorization, undefined);
  await h.client.activateOperator('entered-by-user');
  await h.client.getOperator();
  await h.client.updateOperatorSettings({ notice: '開催中', maintenance: true });
  await h.client.getInbox();
  await h.client.markInboxRead('message / 1');
  await h.client.getEvents();
  await h.client.claimGift('gift-1', 7);
  await h.client.claimEvent('event-1', 8);
  let mutationId;
  await assert.rejects(h.client.sendOperatorMessage({ title: '連絡', body: '本文', target: 'all' }), error => { mutationId = error.mutationId; return typeof mutationId === 'string'; });
  await h.client.sendOperatorMessage({ title: '連絡', body: '本文', target: 'all', mutationId });
  await h.client.sendOperatorGift({ title: '贈り物', body: '本文', target: 'all', treasure: 100, cards: [], mutationId: 'gift-operation' });
  await h.client.saveOperatorEvent({ title: '催し', body: '本文', status: 'draft', mutationId: 'event-operation' });
  const messages = h.calls.filter(call => call.path === '/operator/messages');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].parsedBody.mutationId, messages[1].parsedBody.mutationId);
  assert.deepEqual(h.calls.find(call => call.path === '/inbox/gift-1/claim').parsedBody, { revision: 7 });
  assert.deepEqual(h.calls.find(call => call.path === '/events/event-1/claim').parsedBody, { revision: 8 });
  assert.ok(h.calls.some(call => call.path === '/inbox/message%20%2F%201/read'));
  assert.ok(h.calls.filter(call => call.path !== '/public-status' && !(call.path === '/profile' && call.method === 'POST')).every(call => call.headers.Authorization === 'Bearer private-token'));
  assert.equal(JSON.stringify(h.updates).includes('entered-by-user'), false);
  assert.equal(JSON.stringify(h.updates).includes('private-token'), false);
  h.client.destroy();
});

test('presence publishes only this device online/login flags and supports a keepalive offline request', async () => {
  const h = harness(call => call.path === '/profile' ? authReply() : reply({ ok: true }));
  await h.client.updatePresence({ online: true, login: true, playerId: 'not-authoritative', lastSeenAt: 999 });
  await h.client.updatePresence({ online: false }, { keepalive: true });
  const calls = h.calls.filter(call => call.path === '/presence');
  assert.deepEqual(calls[0].parsedBody, { online: true, login: true });
  assert.deepEqual(calls[1].parsedBody, { online: false });
  assert.equal(calls[1].keepalive, true);
  assert.ok(calls.every(call => call.headers.Authorization === 'Bearer private-token'));
  assert.equal(h.updates.at(-1).phase, 'presence');
  assert.equal(JSON.stringify(h.updates).includes('private-token'), false);
  h.client.destroy();
});
