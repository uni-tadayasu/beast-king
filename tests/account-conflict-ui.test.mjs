import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountUi} from '../account-ui.js';

const settle = async () => { for (let n = 0; n < 60; n++) await Promise.resolve(); };

function fixture({conflictCode = null, upgrade = false} = {}) {
  let modal = null, html = '', state = {phase: 'synced', revision: 4, dirty: false, conflict: null};
  let serverDeck = {id: 'operator-kirahara-v1', name: 'プレミアムデッキ', ids: Array(32).fill('B0512'), specialIds: Array(4).fill('F0128'), upgradeRequired: upgrade};
  const calls = {flush: 0, grants: 0, equips: 0, remoteChoices: 0, localChoices: 0, toasts: []};
  const conflict = () => { state = {...state, phase: 'conflict', dirty: true, conflict: {reason: 'revision', remoteRevision: 5}}; };
  const resolved = () => { state = {...state, phase: 'synced', revision: 5, dirty: false, conflict: null}; };
  const client = {
    profile: {id: 'operator-fixture', nickname: 'プレイヤー'}, getStatus: () => ({}),
    getOperatorDeck: async () => ({deck: structuredClone(serverDeck)}),
    getSessions: async () => ({sessions: []}),
    claimOperatorRegalia: async () => {
      calls.grants++; serverDeck = {...serverDeck, upgradeRequired: false};
      return {deck: structuredClone(serverDeck), save: {revision: 5, data: {treasure: 100}}};
    },
  };
  const cloud = {
    getState: () => state,
    flush: async () => {
      calls.flush++;
      if (conflictCode && calls.flush === 1) {
        conflict(); throw Object.assign(new Error('保存が競合しています。使うデータを選んでください。'), {code: conflictCode});
      }
      return state;
    },
    acceptServerSave: async () => { conflict(); return state; },
    reloadCloud: async () => { calls.remoteChoices++; resolved(); return state; },
    keepLocal: async () => { calls.localChoices++; resolved(); return state; },
  };
  const documentImpl = {activeElement: null, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null};
  const ui = createAccountUi({
    client, cloud, documentImpl, ensureReady: async () => state, isBattleActive: () => false,
    getModal: () => modal, setModal: value => { modal = value; }, showModal: value => { html = value; },
    closeModal: () => { modal = null; html = ''; }, render() {},
    toast: message => calls.toasts.push(message), onEquipOperatorDeck: async () => { calls.equips++; },
  });
  const act = async action => { assert.equal(ui.handleAction(action, {dataset: {}}), true); await settle(); };
  return {ui, calls, act, get html() { return html; }, get modal() { return modal; }};
}

test('premium equip conflicts open actual local/cloud choices and resolving never silently equips', async () => {
  for (const conflictCode of ['SAVE_CONFLICT', 'save_conflict']) {
    const f = fixture({conflictCode}); await f.ui.refreshOperatorDeck();
    await f.act('operator-deck-use');
    assert.equal(f.modal.kind, 'account');
    assert.match(f.html, /data-action="cloud-conflict-remote"/);
    assert.match(f.html, /data-action="cloud-conflict-local"/);
    assert.equal(f.calls.equips, 0); assert.equal(f.calls.grants, 0);
    assert.equal(f.calls.toasts.length, 0, 'actionable dialog replaces the dead-end error toast');
    await f.act('cloud-conflict-remote');
    assert.equal(f.calls.remoteChoices, 1);
    assert.equal(f.calls.equips, 0); assert.equal(f.calls.grants, 0);
    await f.act('operator-deck-use');
    assert.equal(f.calls.equips, 1, 'only a new explicit equip action continues');
    assert.equal(f.modal, null);
    f.ui.onModalClosed();
  }
});

test('an upgrade whose returned save conflicts stops before equip and never repeats its grant after resolution', async () => {
  const f = fixture({upgrade: true}); await f.ui.refreshOperatorDeck();
  await f.act('operator-deck-use');
  assert.equal(f.calls.grants, 1); assert.equal(f.calls.equips, 0);
  assert.equal(f.modal.kind, 'account');
  assert.match(f.html, /どちらの保存内容を使いますか/);
  await f.act('cloud-conflict-local');
  assert.equal(f.modal.kind, 'cloud-overwrite');
  assert.equal(f.calls.localChoices, 0, 'keeping local data still requires its existing confirmation');
  await f.act('cloud-conflict-local-confirm');
  assert.equal(f.calls.localChoices, 1); assert.equal(f.calls.grants, 1); assert.equal(f.calls.equips, 0);
  await f.act('operator-deck-use');
  assert.equal(f.calls.grants, 1); assert.equal(f.calls.equips, 1);
  f.ui.onModalClosed();
});
