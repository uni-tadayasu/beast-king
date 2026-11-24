import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSync, CLOUD_SYNC_STORAGE_KEY } from '../cloud-sync.js';

const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 50; i += 1) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const storage = () => { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
const networkError = () => Object.assign(new Error('オフラインです。'), { code: 'NETWORK_ERROR', status: 0 });
const timers = () => {
  let serial = 0, clock = 0;
  const pending = new Map();
  return {
    pending,
    setTimeout(callback, delay) { const id = ++serial; pending.set(id, { callback, at: clock + delay }); return id; },
    clearTimeout(id) { pending.delete(id); },
    async next() { const first = [...pending.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (!first) return false; pending.delete(first[0]); clock = first[1].at; first[1].callback(); await settle(); return true; },
  };
};
function documentState() {
  const doc = new EventTarget(); doc.hidden = false; doc.visibilityState = 'visible';
  doc.hide = value => { doc.hidden = value; doc.visibilityState = value ? 'hidden' : 'visible'; doc.dispatchEvent(new Event('visibilitychange')); };
  return doc;
}
function cloudServer() {
  const saves = new Map(), mutations = new Map(), reads = [], writes = [], linkCalls = [];
  let dropResponses = 0, offlineWrites = false, readHook = null;
  const replace = (id, data) => { const save = { revision: (saves.get(id)?.revision || 0) + 1, data: copy(data), updatedAt: writes.length + 100 }; saves.set(id, save); return copy(save); };
  const client = initialId => {
    let id = initialId;
    return {
      get profile() { return { id, nickname: id }; },
      getStatus: () => ({ authInvalidated: false }),
      ensureProfile: async () => ({ ok: true, profile: { id, nickname: id } }),
      async getCloudSave() { const readingId = id; reads.push(readingId); const override = readHook?.(readingId); if (override) return override; return { ok: true, save: copy(saves.get(readingId) || null) }; },
      async saveCloudSave(values) {
        const savingId = id; writes.push({ playerId: savingId, ...copy(values) });
        if (offlineWrites) throw networkError();
        const key = `${savingId}:${values.mutationId}`, previous = mutations.get(key);
        if (previous) {
          if (previous.request !== JSON.stringify(values)) throw Object.assign(new Error('処理IDが再利用されました。'), { status: 409, code: 'mutation_id_reused' });
          return { ok: true, save: copy(saves.get(savingId)), replayed: true, appliedRevision: previous.save.revision };
        }
        const current = saves.get(savingId) || null;
        if (values.revision !== (current?.revision || 0)) throw Object.assign(new Error('別の端末で更新されています。'), { status: 409, code: 'save_conflict', payload: { ok: false, save: copy(current) } });
        const save = replace(savingId, values.data);
        mutations.set(key, { request: JSON.stringify(values), save });
        if (dropResponses > 0) { dropResponses -= 1; throw networkError(); }
        return { ok: true, save, appliedRevision: save.revision };
      },
      async createDeviceLink() { linkCalls.push(id); return { ok: true, link: { code: `link-${id}`, expiresAt: 600000 } }; },
      async claimDeviceLink(code, deviceName) { id = code.replace(/^link-/, ''); return { ok: true, token: 'new-private-device-token', profile: { id, nickname: id }, sessionId: deviceName || 'device', save: copy(saves.get(id) || null) }; },
    };
  };
  return { saves, reads, writes, linkCalls, client, replace, setDropResponses: value => { dropResponses = value; }, setOffline: value => { offlineWrites = value; }, setReadHook: value => { readHook = value; } };
}
let mutationSerial = 0;
function device(server, id, initial, options = {}) {
  let local = copy(initial);
  const memory = options.storage || storage(), clock = options.timers || timers(), documentImpl = options.documentImpl || documentState(), windowImpl = options.windowImpl || new EventTarget();
  const states = [], applications = [], client = options.client || server.client(id);
  const sync = createCloudSync({
    client, storage: memory, timers: clock, documentImpl, windowImpl,
    mutationId: () => `mutation-${++mutationSerial}`, now: () => 12345,
    getLocalData: () => copy(local),
    applyRemoteData: (data, context) => { local = copy(data); applications.push({ data: copy(data), context: copy(context) }); },
    onState: state => states.push(state),
    ...options,
  });
  return { sync, client, storage: memory, timers: clock, document: documentImpl, window: windowImpl, states, applications, get local() { return copy(local); }, edit(data, mark = true) { local = copy(data); if (mark) sync.markDirty(); } };
}

test('two devices share a save, detect CAS conflicts, and resolve only through an explicit choice', async () => {
  const server = cloudServer();
  const a = device(server, 'same-player', { treasure: 100 });
  const b = device(server, 'same-player', { treasure: 999 });
  await a.sync.start();
  assert.equal(server.saves.get('same-player').revision, 1);
  await b.sync.start();
  assert.deepEqual(b.local, { treasure: 100 });
  assert.equal(server.writes.length, 1, 'the second device must load the existing cloud, not publish its fresh local default');
  a.edit({ treasure: 160 }); b.edit({ treasure: 120 });
  await a.sync.flush();
  await assert.rejects(b.sync.flush(), { code: 'save_conflict' });
  assert.equal(b.sync.getState().phase, 'conflict');
  assert.deepEqual(b.local, { treasure: 120 });
  assert.deepEqual(server.saves.get('same-player').data, { treasure: 160 });
  await b.sync.keepLocal();
  assert.equal(server.saves.get('same-player').revision, 3);
  assert.deepEqual(server.saves.get('same-player').data, { treasure: 120 });
  await a.sync.refresh();
  assert.deepEqual(a.local, { treasure: 120 });
  assert.equal(a.sync.getState().dirty, false);
  a.sync.destroy(); b.sync.destroy();
});

test('persisting unchanged content or reverting a draft does not create writes or false conflicts', async () => {
  for (const revert of [false, true]) {
    const server = cloudServer(); server.replace('player', { treasure: 100, draft: null });
    const d = device(server, 'player', { treasure: 100, draft: null }); await d.sync.start();
    if (revert) d.edit({ treasure: 100, draft: { name: '編集中' } });
    d.edit({ treasure: 100, draft: null });
    assert.equal(d.sync.getState().dirty, false);
    await d.sync.flush();
    assert.equal(server.writes.length, 0, 'a no-op persist must not advance the cloud revision');
    server.replace('player', { treasure: 200, draft: null });
    await d.sync.refresh();
    assert.equal(d.sync.getState().phase, 'synced');
    assert.deepEqual(d.local, { treasure: 200, draft: null });
    d.sync.destroy();
  }
});

test('two devices making the identical edit acknowledge one value without a conflict or extra write', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const a = device(server, 'player', { treasure: 100 }), b = device(server, 'player', { treasure: 100 });
  await a.sync.start(); await b.sync.start();
  a.edit({ treasure: 150 }); b.edit({ treasure: 150 });
  await a.sync.flush(); await b.sync.flush();
  assert.equal(server.saves.get('player').revision, 2);
  assert.equal(server.writes.length, 2, 'one accepted write and one CAS check, with no overwrite retry');
  assert.equal(b.sync.getState().phase, 'synced');
  assert.equal(b.sync.getState().revision, 2);
  assert.equal(b.sync.getState().dirty, false);
  assert.equal(b.states.some(state => state.phase === 'conflict'), false);
  a.sync.destroy(); b.sync.destroy();
});

test('a newer revision containing the unchanged baseline can safely accept local edits', async () => {
  for (const operation of ['refresh', 'flush']) {
    const server = cloudServer(); server.replace('player', { treasure: 100, cards: ['B0001'] });
    const d = device(server, 'player', { treasure: 100, cards: ['B0001'] }); await d.sync.start();
    d.edit({ treasure: 150, cards: ['B0001'] });
    server.replace('player', { cards: ['B0001'], treasure: 100 });
    await d.sync[operation]();
    assert.equal(d.sync.getState().phase, 'synced');
    assert.deepEqual(server.saves.get('player').data, { treasure: 150, cards: ['B0001'] });
    assert.equal(server.saves.get('player').revision, 3);
    assert.equal(d.states.some(state => state.phase === 'conflict'), false);
    d.sync.destroy();
  }
});

test('stale persisted dirty metadata is cleared only when the actual local content equals its baseline', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const memory = storage(), a = device(server, 'player', { treasure: 100 }, { storage: memory });
  await a.sync.start(); a.sync.destroy();
  const key = `${CLOUD_SYNC_STORAGE_KEY}:player`, meta = JSON.parse(memory.getItem(key));
  meta.dirty = true; meta.pendingData = { treasure: 100 }; memory.setItem(key, JSON.stringify(meta));
  server.replace('player', { treasure: 200 });
  const b = device(server, 'player', { treasure: 100 }, { storage: memory }); await b.sync.start();
  assert.equal(b.sync.getState().phase, 'synced');
  assert.deepEqual(b.local, { treasure: 200 });
  assert.equal(server.writes.length, 0);
  b.sync.destroy();
});

test('an existing conflict can recover when both sides match, while differing content remains protected', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const d = device(server, 'player', { treasure: 100 }); await d.sync.start();
  d.edit({ treasure: 150 }); server.replace('player', { treasure: 200 });
  await d.sync.refresh();
  await assert.rejects(d.sync.flush(), { code: 'SAVE_CONFLICT' });
  assert.deepEqual(d.local, { treasure: 150 });
  assert.equal(server.writes.length, 0);
  server.replace('player', { treasure: 150 });
  await d.sync.flush();
  assert.equal(d.sync.getState().phase, 'synced');
  assert.equal(d.sync.getState().revision, 3);
  assert.equal(server.writes.length, 0, 'matching contents acknowledge the new revision without overwriting either side');
  d.sync.destroy();
});

test('starter migration still persists new save metadata after content-based dirty tracking', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  let local = { treasure: 0 };
  const d = device(server, 'player', local, {
    getLocalData: () => local,
    applyRemoteData: data => { local = { ...data, freeStarterId: 'star-crown' }; },
  });
  await d.sync.start();
  assert.equal(d.sync.getState().dirty, true);
  await d.sync.flush();
  assert.deepEqual(server.saves.get('player').data, { treasure: 100, freeStarterId: 'star-crown' });
  assert.equal(server.saves.get('player').revision, 2);
  assert.equal(d.sync.getState().dirty, false);
  d.sync.destroy();
});

test('reloadCloud explicitly adopts a conflict but a new edit during its read is preserved', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const d = device(server, 'player', { treasure: 100 }); await d.sync.start();
  d.edit({ treasure: 110 }); server.replace('player', { treasure: 500 });
  await d.sync.refresh();
  assert.equal(d.sync.getState().phase, 'conflict');
  const pending = deferred(); server.setReadHook(() => pending.promise);
  const loading = d.sync.reloadCloud();
  const rejected = assert.rejects(loading, { code: 'LOCAL_CHANGED' });
  await settle(); d.edit({ treasure: 130 });
  pending.resolve({ ok: true, save: copy(server.saves.get('player')) });
  await rejected;
  assert.deepEqual(d.local, { treasure: 130 });
  server.setReadHook(null); await d.sync.reloadCloud();
  assert.deepEqual(d.local, { treasure: 500 });
  assert.equal(d.sync.getState().phase, 'synced');
  d.sync.destroy();
});

test('a lost save response survives reload and reuses its mutation before saving newer offline edits', async () => {
  const server = cloudServer(), sharedStorage = storage();
  const a = device(server, 'player', { treasure: 100 }, { storage: sharedStorage }); await a.sync.start();
  a.edit({ treasure: 200 }); server.setDropResponses(1);
  await assert.rejects(a.sync.flush(), { code: 'NETWORK_ERROR' });
  const lost = server.writes.at(-1);
  assert.equal(server.saves.get('player').revision, 2);
  a.edit({ treasure: 300 }); a.sync.destroy();
  const b = device(server, 'player', { treasure: 300 }, { storage: sharedStorage });
  await b.sync.start();
  const retries = server.writes.filter(write => write.mutationId === lost.mutationId);
  assert.equal(retries.length, 2);
  assert.deepEqual(retries[0], retries[1]);
  assert.equal(server.saves.get('player').revision, 3, 'the lost acknowledgement must not produce another copy of its write');
  assert.deepEqual(server.saves.get('player').data, { treasure: 300 });
  assert.deepEqual(b.local, { treasure: 300 });
  assert.equal(b.sync.getState().dirty, false);
  b.sync.destroy();
});

test('a replay with a newer current save preserves intervening gift credits and conflicts with unsaved newer local edits', async () => {
  for (const changedAfterLoss of [false, true]) {
    const server = cloudServer(); server.replace('player', { treasure: 100 });
    const d = device(server, 'player', { treasure: 100 }); await d.sync.start();
    d.edit({ treasure: 200 }); server.setDropResponses(1);
    await assert.rejects(d.sync.flush(), { code: 'NETWORK_ERROR' });
    const ownMutation = server.writes.at(-1).mutationId;
    const giftSave = server.replace('player', { treasure: 700 });
    assert.equal(giftSave.revision, 3);
    if (changedAfterLoss) d.edit({ treasure: 250 });
    if (changedAfterLoss) {
      await assert.rejects(d.sync.flush(), { code: 'SAVE_CONFLICT' });
      assert.equal(d.sync.getState().phase, 'conflict');
      assert.equal(d.sync.getState().revision, 2, 'the acknowledged write does not own the newer current revision');
      assert.equal(d.sync.getState().conflict.remoteRevision, 3);
      assert.deepEqual(d.local, { treasure: 250 });
      assert.equal(server.writes.length, 2, 'a new local write must not overwrite the gift after replay');
    } else {
      await d.sync.flush();
      assert.deepEqual(d.local, { treasure: 700 });
      assert.equal(d.sync.getState().revision, 3);
      assert.equal(d.sync.getState().phase, 'synced');
      d.edit({ treasure: d.local.treasure - 100 }); await d.sync.flush();
      assert.deepEqual(server.saves.get('player').data, { treasure: 600 });
    }
    assert.equal(server.writes.filter(write => write.mutationId === ownMutation).length, 2);
    if (changedAfterLoss) assert.deepEqual(server.saves.get('player').data, { treasure: 700 });
    d.sync.destroy();
  }
});

test('offline retries are bounded, retain pending local data, and resume after an online signal', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const d = device(server, 'player', { treasure: 100 }); await d.sync.start();
  server.setOffline(true); d.edit({ treasure: 200 });
  await assert.rejects(d.sync.flush(), { code: 'NETWORK_ERROR' });
  for (let i = 0; i < 12 && d.timers.pending.size; i += 1) await d.timers.next();
  assert.equal(d.timers.pending.size, 0, 'exhausted retries must wait for user input or reconnection');
  assert.ok(server.writes.length <= 4);
  assert.equal(d.sync.getState().phase, 'offline');
  const meta = JSON.parse(d.storage.getItem(`${CLOUD_SYNC_STORAGE_KEY}:player`));
  assert.equal(meta.dirty, true); assert.equal(meta.pendingData.treasure, 200);
  server.setOffline(false); d.window.dispatchEvent(new Event('online')); await settle();
  assert.equal(d.sync.getState().phase, 'synced');
  assert.equal(server.saves.get('player').data.treasure, 200);
  d.sync.destroy();
});

test('linking pins the new identity before applying its save and discards late old-account responses', async () => {
  const server = cloudServer(); server.replace('old-player', { treasure: 10 }); server.replace('linked-player', { treasure: 500 });
  const d = device(server, 'old-player', { treasure: 10 }); await d.sync.start();
  d.edit({ treasure: 20 });
  const oldRead = deferred(); server.setReadHook(id => id === 'old-player' ? oldRead.promise : null);
  const oldRefresh = d.sync.refresh(); const cancelled = assert.rejects(oldRefresh, { name: 'AbortError' }); await settle();
  const linked = await d.sync.claimDeviceLink('link-linked-player', 'タブレット');
  assert.equal(d.client.profile.id, 'linked-player');
  assert.equal(d.sync.getState().playerId, 'linked-player');
  assert.deepEqual(d.local, { treasure: 500 });
  assert.equal(linked.token, undefined);
  oldRead.resolve({ ok: true, save: { revision: 80, data: { treasure: 9999 } } }); await cancelled;
  assert.deepEqual(d.local, { treasure: 500 });
  assert.equal(server.writes.length, 0, 'claiming never pushes old target-device data into the linked player');
  assert.equal(d.applications.at(-1).context.reason, 'link');
  assert.equal(JSON.stringify(d.states).includes('new-private-device-token'), false);
  assert.equal(JSON.stringify([...d.storage.values]).includes('new-private-device-token'), false);
  d.sync.destroy();
});

test('a linked account without a cloud save never receives the old target-device data automatically', async () => {
  const server = cloudServer(); server.replace('old-player', { treasure: 10 });
  const d = device(server, 'old-player', { treasure: 10 }); await d.sync.start();
  await assert.rejects(d.sync.claimDeviceLink('link-new-player', 'スマホ'), { code: 'LINKED_SAVE_MISSING' });
  assert.equal(d.sync.getState().phase, 'conflict');
  await assert.rejects(d.sync.flush(), { code: 'SAVE_CONFLICT' });
  assert.equal(server.writes.length, 0);
  d.sync.destroy();
  const reloaded = device(server, 'new-player', { treasure: 10 }, { storage: d.storage });
  await reloaded.sync.start();
  assert.equal(reloaded.sync.getState().phase, 'conflict');
  assert.equal(server.writes.length, 0);
  reloaded.sync.destroy();
});

test('active local battles can save locally played changes but defer replacing the game from another device', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  let canApply = true;
  const d = device(server, 'player', { treasure: 100 }, { canApplyRemote: () => canApply }); await d.sync.start();
  canApply = false; d.edit({ treasure: 110 }); await d.sync.flush();
  assert.equal(server.saves.get('player').data.treasure, 110);
  server.replace('player', { treasure: 700 }); await d.sync.refresh();
  assert.equal(d.sync.getState().conflict.reason, 'active-battle');
  assert.deepEqual(d.local, { treasure: 110 });
  canApply = true; await d.sync.refresh();
  assert.deepEqual(d.local, { treasure: 700 });
  assert.equal(d.sync.getState().phase, 'synced');
  d.sync.destroy();
});

test('an atomic gift save is not applied over edits made while the claim was in flight', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const d = device(server, 'player', { treasure: 100 }); await d.sync.start(); await d.sync.flush();
  const giftSave = server.replace('player', { treasure: 600 });
  d.edit({ treasure: 120 }); await d.sync.acceptServerSave(giftSave);
  assert.equal(d.sync.getState().conflict.reason, 'local-changed');
  assert.deepEqual(d.local, { treasure: 120 });
  await d.sync.reloadCloud();
  assert.deepEqual(d.local, { treasure: 600 });
  const applications = d.applications.length;
  await d.sync.acceptServerSave(giftSave);
  await d.sync.acceptServerSave({ revision: 1, data: { treasure: 100 } });
  assert.equal(d.applications.length, applications);
  d.sync.destroy();
});

test('a stored fingerprint detects offline app edits on reload, and pre-start dirty marks are preserved', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const memory = storage();
  const a = device(server, 'player', { treasure: 100 }, { storage: memory }); await a.sync.start(); a.sync.destroy();
  server.replace('player', { treasure: 500 });
  const b = device(server, 'player', { treasure: 130 }, { storage: memory }); await b.sync.start();
  assert.equal(b.sync.getState().phase, 'conflict');
  assert.deepEqual(b.local, { treasure: 130 }); b.sync.destroy();
  const c = device(server, 'player', { treasure: 170 }); c.sync.markDirty(); await c.sync.start();
  assert.equal(c.sync.getState().phase, 'conflict');
  assert.deepEqual(c.local, { treasure: 170 });
  assert.equal(server.writes.length, 0);
  c.sync.destroy();
});

test('offline edits on reload are saved when the cloud revision has not changed', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const memory = storage();
  const a = device(server, 'player', { treasure: 100 }, { storage: memory }); await a.sync.start(); a.sync.destroy();
  const b = device(server, 'player', { treasure: 180 }, { storage: memory }); await b.sync.start();
  assert.deepEqual(b.local, { treasure: 180 });
  assert.equal(server.saves.get('player').revision, 2);
  assert.deepEqual(server.saves.get('player').data, { treasure: 180 });
  assert.equal(b.sync.getState().phase, 'synced');
  assert.equal(b.applications.length, 0, 'the unchanged cloud must not replace unsynced offline edits');
  b.sync.destroy();
});

test('hidden tabs retain dirty edits, visible pulls do not overlap, and destruction removes timers', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const d = device(server, 'player', { treasure: 100 }); await d.sync.start();
  d.document.hide(true); d.edit({ treasure: 200 });
  assert.equal(d.timers.pending.size, 0); assert.equal(server.writes.length, 0);
  const read = deferred(); server.setReadHook(() => read.promise);
  d.document.hide(false); await settle();
  const reads = server.reads.length;
  const first = d.sync.refresh(), second = d.sync.refresh(); assert.equal(first, second);
  assert.equal(server.reads.length, reads);
  server.setReadHook(null); read.resolve({ ok: true, save: copy(server.saves.get('player')) });
  await first; await settle();
  assert.equal(server.saves.get('player').data.treasure, 200);
  d.sync.destroy(); assert.equal(d.timers.pending.size, 0);
});

test('link creation waits for a successful flush, and credentials never enter cloud bodies, status or persisted sync metadata', async () => {
  const server = cloudServer(); server.replace('player', { treasure: 100 });
  const d = device(server, 'player', { treasure: 100 }); await d.sync.start();
  d.edit({ treasure: 220, token: 'private-bearer', nested: { authorization: 'private-header', safe: 'kept' } });
  const link = await d.sync.createDeviceLink();
  assert.equal(link.link.code, 'link-player');
  assert.deepEqual(server.saves.get('player').data, { treasure: 220, nested: { safe: 'kept' } });
  assert.deepEqual(server.linkCalls, ['player']);
  const publicData = JSON.stringify({ states: d.states, writes: server.writes, metadata: [...d.storage.values] });
  assert.equal(publicData.includes('private-bearer'), false); assert.equal(publicData.includes('private-header'), false);
  server.setOffline(true); d.edit({ treasure: 230 });
  await assert.rejects(d.sync.createDeviceLink(), { code: 'NETWORK_ERROR' });
  assert.equal(server.linkCalls.length, 1);
  d.sync.destroy();
});
