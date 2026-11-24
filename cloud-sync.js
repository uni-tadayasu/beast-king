/** Browser save synchronization. Authentication remains inside online.js. */
export const CLOUD_SYNC_STORAGE_KEY = 'beast-king-cloud-sync-v1';
export const CLOUD_SYNC_DEBOUNCE = 1000;
export const CLOUD_SYNC_PULL_INTERVAL = 15000;

const credentialKeys = new Set(['token', 'accesstoken', 'refreshtoken', 'tokenhash', 'authorization', 'bearer', 'credentials', 'activationcode', 'operatorcode', 'secret']);
const jsonCopy = value => JSON.parse(JSON.stringify(value, (key, item) => credentialKeys.has(key.replace(/[_-]/g, '').toLowerCase()) ? undefined : item));
const fingerprint = value => {
  const ordered = item => Array.isArray(item) ? item.map(ordered) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])])) : item;
  return JSON.stringify(ordered(value));
};
const cancelled = () => Object.assign(new Error('同期処理は取り消されました。'), { name: 'AbortError', code: 'CANCELLED' });
const newId = () => globalThis.crypto?.randomUUID?.() || `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export class CloudSyncError extends Error {
  constructor(message, code = 'SYNC_ERROR') { super(message); this.name = 'CloudSyncError'; this.code = code; }
}

/**
 * getLocalData returns the game-only save. applyRemoteData may return a promise.
 * onState receives metadata only: never a token, device-link code or save body.
 * Mark edits after the app has persisted them locally. Before start is supported.
 * Explicit flush rejects while unsynced, so gifts/link-code creation can await it.
 */
export function createCloudSync({
  client, getLocalData, applyRemoteData, canApplyRemote = () => true, onState,
  storage, documentImpl = globalThis.document ?? null, windowImpl = globalThis.window ?? null,
  timers = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) },
  debounceMs = CLOUD_SYNC_DEBOUNCE, pullIntervalMs = CLOUD_SYNC_PULL_INTERVAL,
  retryDelays = [5000, 15000, 30000], now = () => Date.now(), mutationId = newId,
} = {}) {
  if (!client || typeof client.getCloudSave !== 'function' || typeof client.saveCloudSave !== 'function') throw new TypeError('クラウド保存に対応した client が必要です。');
  if (typeof getLocalData !== 'function' || typeof applyRemoteData !== 'function') throw new TypeError('getLocalData と applyRemoteData が必要です。');
  let savedStorage = storage;
  if (storage === undefined) { try { savedStorage = globalThis.localStorage ?? null; } catch { savedStorage = null; } }
  const bindingKey = `${CLOUD_SYNC_STORAGE_KEY}:local-owner`;
  const unboundKey = `${CLOUD_SYNC_STORAGE_KEY}:pending`;
  const readStored = key => { try { return JSON.parse(savedStorage?.getItem(key) || 'null'); } catch { return null; } };
  const writeStored = (key, value) => { try { savedStorage?.setItem(key, JSON.stringify(value)); } catch { /* Primary game data still lives in the app's local save. */ } };
  const readBinding = () => { const value = readStored(bindingKey); return typeof value?.playerId === 'string' ? value.playerId : null; };
  const metaKey = id => `${CLOUD_SYNC_STORAGE_KEY}:${id}`;
  const visible = () => !documentImpl || (!documentImpl.hidden && documentImpl.visibilityState !== 'hidden');
  let destroyed = false, started = false, initialized = false, paused = false, applying = false, switching = false;
  let playerId = null, revision = null, baseline = null, dirty = false, localSnapshot = null, pendingWrite = null;
  let needsIdentityApply = false, remoteCandidate = null, editVersion = 0, epoch = 0, busyCount = 0;
  let phase = 'idle', lastSyncedAt = null, errorState = null, conflictReason = null, retryCount = 0;
  let debounceTimer = null, pullTimer = null, retryTimer = null;
  let operationTail = Promise.resolve(), startPromise = null, refreshPromise = null, flushPromise = null, linkPromise = null;

  const getState = () => ({
    phase, busy: busyCount > 0 || switching, dirty, revision, playerId, lastSyncedAt,
    error: errorState ? { ...errorState } : null,
    conflict: conflictReason ? { reason: conflictReason, remoteRevision: remoteCandidate?.revision ?? null } : null,
  });
  const notify = () => { if (destroyed) return; try { onState?.(getState()); } catch { /* Rendering must not break synchronization. */ } };
  const clearTimer = key => { if (key !== null) timers.clearTimeout(key); };
  const clearTimers = () => { clearTimer(debounceTimer); clearTimer(pullTimer); clearTimer(retryTimer); debounceTimer = pullTimer = retryTimer = null; };
  const snapshot = () => {
    const data = jsonCopy(getLocalData());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CloudSyncError('保存データを読み取れませんでした。', 'INVALID_LOCAL_SAVE');
    return data;
  };
  const persistMeta = () => {
    if (!playerId) {
      if (dirty && localSnapshot) writeStored(unboundKey, { playerId: client.profile?.id || null, dirty: true, data: localSnapshot });
      return;
    }
    writeStored(metaKey(playerId), { version: 1, revision, baseline, dirty, pendingData: dirty ? localSnapshot : null, pendingWrite, lastSyncedAt, needsIdentityApply });
  };
  const assertEpoch = value => { if (destroyed || value !== epoch || paused) throw cancelled(); };
  const assertOwner = value => {
    assertEpoch(value);
    if (client.getStatus?.().authInvalidated) throw Object.assign(new CloudSyncError('この端末の連携が解除されています。端末連携で接続し直してください。', 'SESSION_REVOKED'), { status: 401 });
    if (playerId && client.profile?.id !== playerId) {
      needsIdentityApply = true;
      throw new CloudSyncError('連携先が変わりました。クラウド保存を読み直してください。', 'IDENTITY_CHANGED');
    }
  };
  const permittedToApply = () => { try { return canApplyRemote() !== false; } catch { return false; } };
  const validSave = value => {
    if (value === null) return null;
    if (!value || !Number.isInteger(value.revision) || value.revision < 1 || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) throw new CloudSyncError('クラウド保存を読み取れませんでした。', 'INVALID_CLOUD_SAVE');
    return { revision: value.revision, data: jsonCopy(value.data), updatedAt: value.updatedAt ?? null };
  };
  function setConflict(save, reason = 'revision') {
    remoteCandidate = save ? validSave(save) : null;
    conflictReason = reason;
    phase = 'conflict';
    errorState = null;
    clearTimer(debounceTimer); clearTimer(retryTimer);
    debounceTimer = retryTimer = null;
    persistMeta();
    notify();
  }
  function schedulePull() {
    clearTimer(pullTimer); pullTimer = null;
    if (!started || destroyed || paused || switching || !visible() || phase === 'auth-required' || (phase === 'offline' && retryCount >= retryDelays.length)) return;
    pullTimer = timers.setTimeout(() => { pullTimer = null; void refresh().catch(() => {}); }, Math.max(1000, pullIntervalMs));
  }
  function scheduleRetry() {
    if (retryTimer !== null || destroyed || paused || !visible() || retryCount >= retryDelays.length) return;
    const delay = Math.max(1000, retryDelays[retryCount++]);
    retryTimer = timers.setTimeout(() => { retryTimer = null; void refresh().catch(() => {}); }, delay);
  }
  function handleError(error) {
    if (error?.name === 'AbortError' || destroyed) return;
    if (error?.status === 409 && (error.payload?.save !== undefined || error.code === 'save_conflict')) {
      setConflict(error.payload?.save ?? null, error.code === 'cloud_save_required' ? 'cloud-save-required' : 'revision');
      return;
    }
    errorState = { code: error?.code || 'SYNC_ERROR', message: error?.message || '同期できませんでした。' };
    if (error?.status === 401 || error?.code === 'SESSION_REVOKED' || error?.code === 'AUTH_REQUIRED') {
      phase = 'auth-required'; clearTimers();
    } else if (error?.code === 'IDENTITY_CHANGED') {
      phase = 'conflict'; conflictReason = 'identity-changed'; remoteCandidate = null; clearTimers();
    } else if (error?.code === 'NETWORK_ERROR' || error?.status === 0 || error?.status >= 500 || error instanceof TypeError) {
      phase = 'offline'; scheduleRetry();
    } else if (phase !== 'conflict' && phase !== 'paused') phase = 'error';
    persistMeta();
    notify();
  }
  function enqueue(operation) {
    const operationEpoch = epoch;
    const task = operationTail.catch(() => {}).then(async () => {
      assertEpoch(operationEpoch);
      busyCount += 1; notify();
      try { return await operation(operationEpoch); }
      catch (error) { if (operationEpoch === epoch) handleError(error); throw error; }
      finally { busyCount = Math.max(0, busyCount - 1); notify(); if (operationEpoch === epoch) schedulePull(); }
    });
    operationTail = task.catch(() => {});
    return task;
  }
  function observeLocal() {
    const current = snapshot();
    const currentFingerprint = fingerprint(current);
    if (baseline !== null && currentFingerprint !== baseline) dirty = true;
    if (dirty) localSnapshot = current;
    return current;
  }
  async function applySave(save, reason, operationEpoch) {
    assertOwner(operationEpoch);
    if (!permittedToApply()) { setConflict(save, 'active-battle'); return false; }
    applying = true;
    try { await applyRemoteData(jsonCopy(save.data), { reason, playerId, revision: save.revision }); }
    finally { applying = false; }
    assertOwner(operationEpoch);
    revision = save.revision;
    const applied = snapshot();
    baseline = fingerprint(applied);
    const starterMigration = typeof applied.freeStarterId === 'string' && !save.data.freeStarterId;
    dirty = starterMigration; localSnapshot = starterMigration ? applied : null; pendingWrite = null; needsIdentityApply = false;
    remoteCandidate = null; conflictReason = null; errorState = null; retryCount = 0;
    phase = 'synced'; lastSyncedAt = now();
    writeStored(bindingKey, { playerId });
    writeStored(unboundKey, null);
    if (starterMigration) { phase = 'dirty'; scheduleSave(); }
    persistMeta(); notify();
    return true;
  }
  async function writePending(operationEpoch) {
    assertOwner(operationEpoch);
    if (needsIdentityApply) throw new CloudSyncError('連携先の保存データを先に読み込んでください。', 'IDENTITY_CHANGED');
    if (conflictReason) throw new CloudSyncError('保存が競合しています。使うデータを選んでください。', 'SAVE_CONFLICT');
    observeLocal();
    if (!dirty && !pendingWrite) { phase = 'synced'; errorState = null; notify(); return; }
    // Bound the work per flush. New edits can schedule another turn, never a hot loop.
    for (let attempt = 0; attempt < 3 && (dirty || pendingWrite); attempt += 1) {
      assertOwner(operationEpoch);
      if (!pendingWrite) {
        localSnapshot = snapshot();
        pendingWrite = { revision: revision ?? 0, data: localSnapshot, mutationId: mutationId(), fingerprint: fingerprint(localSnapshot) };
      }
      const sending = jsonCopy(pendingWrite);
      persistMeta();
      phase = 'saving'; errorState = null; notify();
      const response = await client.saveCloudSave({ revision: sending.revision, data: sending.data, mutationId: sending.mutationId });
      assertOwner(operationEpoch);
      const save = validSave(response.save);
      if (!save) throw new CloudSyncError('保存完了の応答がありません。', 'INVALID_CLOUD_SAVE');
      // A replay acknowledges this mutation but returns the CURRENT save, which
      // may already include another device's changes or an atomic gift claim.
      const appliedRevision = response.appliedRevision ?? sending.revision + 1;
      if (!Number.isSafeInteger(appliedRevision) || appliedRevision !== sending.revision + 1 || save.revision < appliedRevision) throw new CloudSyncError('保存完了の番号を確認できませんでした。', 'INVALID_CLOUD_SAVE');
      if (revision !== null && appliedRevision < revision) throw new CloudSyncError('保存の応答が古いため、再読み込みが必要です。', 'STALE_CLOUD_SAVE');
      revision = appliedRevision;
      baseline = sending.fingerprint;
      pendingWrite = null;
      const local = snapshot();
      dirty = fingerprint(local) !== baseline;
      localSnapshot = dirty ? local : null;
      lastSyncedAt = now(); retryCount = 0; errorState = null;
      phase = dirty ? 'dirty' : 'synced';
      writeStored(bindingKey, { playerId }); writeStored(unboundKey, null);
      persistMeta(); notify();
      if (save.revision > appliedRevision) {
        if (dirty) {
          setConflict(save, 'revision');
          throw new CloudSyncError('保存後にクラウドが更新されています。使うデータを選んでください。', 'SAVE_CONFLICT');
        }
        if (!await applySave(save, 'remote', operationEpoch)) throw new CloudSyncError('新しいクラウド保存は対戦終了後に読み込めます。', 'SAVE_CONFLICT');
        return true;
      }
    }
    if (dirty) {
      scheduleSave();
      throw new CloudSyncError('新しい変更を保存しています。少し待って、もう一度お試しください。', 'LOCAL_CHANGES_PENDING');
    }
  }
  async function readAndReconcile(operationEpoch, reason = 'remote') {
    assertOwner(operationEpoch);
    // A lost response may already have committed. Retry the exact mutation first.
    if (pendingWrite && !conflictReason && !needsIdentityApply && await writePending(operationEpoch) === true) return getState();
    const beforeRead = editVersion;
    const response = await client.getCloudSave();
    assertOwner(operationEpoch);
    const save = validSave(response.save);
    observeLocal();
    if (!save) {
      if (needsIdentityApply) { setConflict(null, 'linked-save-missing'); return getState(); }
      if (revision !== null && revision > 0) { setConflict(null, 'cloud-save-missing'); return getState(); }
      revision = 0; dirty = true; localSnapshot = snapshot();
      await writePending(operationEpoch);
      return getState();
    }
    if (needsIdentityApply) {
      await applySave(save, reason === 'initial' ? 'link' : reason, operationEpoch);
      return getState();
    }
    if (revision !== null && save.revision < revision) throw new CloudSyncError('古い保存データを受信しました。', 'STALE_CLOUD_SAVE');
    const changed = revision === null || save.revision !== revision;
    if (changed && (dirty || beforeRead !== editVersion)) {
      setConflict(save, 'revision');
      return getState();
    }
    if (changed || (reason === 'initial' && !dirty) || (conflictReason === 'active-battle' && !dirty)) {
      await applySave(save, reason, operationEpoch);
      return getState();
    }
    if (conflictReason && conflictReason !== 'active-battle') {
      remoteCandidate = save; notify(); return getState();
    }
    remoteCandidate = null; conflictReason = null; errorState = null; retryCount = 0;
    if (dirty) await writePending(operationEpoch);
    else { phase = 'synced'; lastSyncedAt = now(); persistMeta(); notify(); }
    return getState();
  }
  async function initialize(operationEpoch) {
    phase = 'loading'; errorState = null; notify();
    const response = await client.ensureProfile();
    assertEpoch(operationEpoch);
    const id = response?.profile?.id || client.profile?.id;
    if (typeof id !== 'string' || !id) throw new CloudSyncError('保存先のプロフィールを確認できません。', 'PROFILE_REQUIRED');
    if (initialized && id === playerId) return readAndReconcile(operationEpoch);
    const beforeStartDirty = dirty, beforeStartSnapshot = localSnapshot;
    playerId = id;
    const meta = readStored(metaKey(id));
    const pending = readStored(unboundKey);
    const owner = readBinding();
    revision = Number.isInteger(meta?.revision) && meta.revision >= 0 ? meta.revision : null;
    baseline = typeof meta?.baseline === 'string' ? meta.baseline : null;
    needsIdentityApply = Boolean((owner && owner !== id) || meta?.needsIdentityApply);
    dirty = !needsIdentityApply && Boolean(meta?.dirty || beforeStartDirty || (pending?.dirty && (!pending.playerId || pending.playerId === id)));
    localSnapshot = dirty ? beforeStartSnapshot || snapshot() : null;
    pendingWrite = !needsIdentityApply && meta?.pendingWrite && typeof meta.pendingWrite.mutationId === 'string' && Number.isInteger(meta.pendingWrite.revision) && meta.pendingWrite.data ? jsonCopy(meta.pendingWrite) : null;
    if (pendingWrite && typeof pendingWrite.fingerprint !== 'string') pendingWrite.fingerprint = fingerprint(pendingWrite.data);
    lastSyncedAt = Number.isFinite(meta?.lastSyncedAt) ? meta.lastSyncedAt : null;
    conflictReason = null; remoteCandidate = null;
    initialized = true;
    observeLocal();
    // A durable pending snapshot can restore an edit that outlived its app write.
    if (meta?.dirty && meta.pendingData && baseline !== null && fingerprint(snapshot()) === baseline && fingerprint(meta.pendingData) !== baseline && !needsIdentityApply) {
      applying = true;
      try { await applyRemoteData(jsonCopy(meta.pendingData), { reason: 'pending-local', playerId, revision }); }
      finally { applying = false; }
      assertOwner(operationEpoch);
      dirty = true; localSnapshot = snapshot();
    }
    persistMeta();
    return readAndReconcile(operationEpoch, 'initial');
  }
  function start() {
    if (destroyed) return Promise.reject(cancelled());
    if (startPromise) return startPromise;
    paused = false; started = true;
    const task = enqueue(initialize);
    startPromise = task;
    task.finally(() => { if (startPromise === task) startPromise = null; }).catch(() => {});
    return task;
  }
  function scheduleSave() {
    clearTimer(debounceTimer); debounceTimer = null;
    if (!started || !initialized || destroyed || paused || switching || !visible() || conflictReason || needsIdentityApply || phase === 'auth-required') return;
    debounceTimer = timers.setTimeout(() => { debounceTimer = null; void flush().catch(() => {}); }, Math.max(0, debounceMs));
  }
  function markDirty() {
    if (destroyed || applying) return getState();
    localSnapshot = snapshot();
    dirty = true; editVersion += 1;
    if (!switching && !conflictReason && !paused && phase !== 'auth-required') phase = 'dirty';
    persistMeta(); notify();
    retryCount = 0;
    scheduleSave();
    return getState();
  }
  function flush() {
    if (destroyed || paused) return Promise.reject(new CloudSyncError('同期を一時停止しています。', 'SYNC_PAUSED'));
    if (flushPromise) return flushPromise;
    clearTimer(debounceTimer); debounceTimer = null;
    const task = enqueue(async operationEpoch => {
      if (!initialized) await initialize(operationEpoch);
      assertOwner(operationEpoch);
      if (conflictReason) throw new CloudSyncError('保存が競合しています。使うデータを選んでください。', 'SAVE_CONFLICT');
      await writePending(operationEpoch);
      return getState();
    });
    flushPromise = task;
    task.finally(() => { if (flushPromise === task) flushPromise = null; }).catch(() => {});
    return task;
  }
  function refresh() {
    if (destroyed || paused) return Promise.reject(new CloudSyncError('同期を一時停止しています。', 'SYNC_PAUSED'));
    if (refreshPromise) return refreshPromise;
    const task = enqueue(async operationEpoch => initialized ? readAndReconcile(operationEpoch) : initialize(operationEpoch));
    refreshPromise = task;
    task.finally(() => { if (refreshPromise === task) refreshPromise = null; }).catch(() => {});
    return task;
  }
  function reloadCloud() {
    return enqueue(async operationEpoch => {
      if (!initialized) await initialize(operationEpoch);
      assertOwner(operationEpoch);
      const before = editVersion;
      const response = await client.getCloudSave();
      assertOwner(operationEpoch);
      const save = validSave(response.save);
      if (!save) { setConflict(null, 'cloud-save-missing'); throw new CloudSyncError('読み込めるクラウド保存がありません。', 'CLOUD_SAVE_MISSING'); }
      if (editVersion !== before) { setConflict(save, 'local-changed'); throw new CloudSyncError('読み込み中に手元のデータが変わりました。もう一度選んでください。', 'LOCAL_CHANGED'); }
      if (!await applySave(save, 'reload', operationEpoch)) throw new CloudSyncError('対戦を終えてからクラウド保存を読み込んでください。', 'ACTIVE_BATTLE');
      return getState();
    });
  }
  function keepLocal() {
    return enqueue(async operationEpoch => {
      if (!initialized) await initialize(operationEpoch);
      assertOwner(operationEpoch);
      const response = await client.getCloudSave();
      assertOwner(operationEpoch);
      const save = validSave(response.save);
      revision = save?.revision ?? 0;
      baseline = save ? fingerprint(save.data) : null;
      pendingWrite = null; remoteCandidate = null; conflictReason = null; needsIdentityApply = false;
      dirty = true; localSnapshot = snapshot();
      persistMeta();
      await writePending(operationEpoch);
      return getState();
    });
  }
  function acceptServerSave(value) {
    return enqueue(async operationEpoch => {
      if (!initialized) throw new CloudSyncError('先にクラウド保存を開始してください。', 'SYNC_NOT_READY');
      assertOwner(operationEpoch);
      const save = validSave(value);
      if (!save) throw new CloudSyncError('受取後の保存データがありません。', 'INVALID_CLOUD_SAVE');
      if (revision !== null && save.revision <= revision) return getState();
      observeLocal();
      if (dirty || pendingWrite) { setConflict(save, 'local-changed'); return getState(); }
      await applySave(save, 'server-save', operationEpoch);
      return getState();
    });
  }
  function pause() {
    if (destroyed) return getState();
    paused = true; epoch += 1; clearTimers(); phase = 'paused'; persistMeta(); notify();
    return getState();
  }
  function resume() { if (destroyed) return Promise.reject(cancelled()); paused = false; started = true; return start(); }
  async function createDeviceLink() { await flush(); return client.createDeviceLink(); }
  function claimDeviceLink(code, deviceName) {
    if (destroyed) return Promise.reject(cancelled());
    if (linkPromise) return linkPromise;
    pause(); paused = false; switching = true; phase = 'loading'; errorState = null; notify();
    const operationEpoch = epoch;
    const task = (async () => {
      try {
        const payload = await client.claimDeviceLink(code, deviceName);
        assertEpoch(operationEpoch);
        const id = payload.profile?.id || client.profile?.id;
        if (typeof id !== 'string' || !id) throw new CloudSyncError('連携先のプロフィールを確認できません。', 'PROFILE_REQUIRED');
        playerId = id; initialized = true; started = true;
        revision = null; baseline = null; dirty = false; localSnapshot = null; pendingWrite = null;
        needsIdentityApply = true; remoteCandidate = null; conflictReason = null;
        persistMeta();
        const response = await client.getCloudSave();
        assertOwner(operationEpoch);
        const save = validSave(response.save);
        if (!save) { setConflict(null, 'linked-save-missing'); throw new CloudSyncError('連携先の保存データがまだありません。元の端末で同期してください。', 'LINKED_SAVE_MISSING'); }
        await applySave(save, 'link', operationEpoch);
        return { ...jsonCopy(payload), save, state: getState() };
      } catch (error) { if (operationEpoch === epoch) handleError(error); throw error; }
      finally { switching = false; notify(); if (operationEpoch === epoch) schedulePull(); }
    })();
    linkPromise = task;
    task.finally(() => { if (linkPromise === task) linkPromise = null; }).catch(() => {});
    return task;
  }
  function wake() {
    if (destroyed || !started || paused || switching || !visible()) return;
    retryCount = 0; clearTimer(retryTimer); retryTimer = null;
    void refresh().catch(() => {});
  }
  function visibilityChanged() { if (!visible()) clearTimers(); else wake(); }
  documentImpl?.addEventListener?.('visibilitychange', visibilityChanged);
  windowImpl?.addEventListener?.('focus', wake);
  windowImpl?.addEventListener?.('online', wake);
  function destroy() {
    if (destroyed) return;
    destroyed = true; epoch += 1; clearTimers();
    documentImpl?.removeEventListener?.('visibilitychange', visibilityChanged);
    windowImpl?.removeEventListener?.('focus', wake);
    windowImpl?.removeEventListener?.('online', wake);
    persistMeta();
  }
  return Object.freeze({ start, markDirty, flush, refresh, reloadCloud, keepLocal, acceptServerSave, pause, resume, createDeviceLink, claimDeviceLink, getState, destroy });
}
