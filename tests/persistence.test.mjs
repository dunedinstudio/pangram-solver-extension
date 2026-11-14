import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPersistence } from '../dist/chromium/persistence.js';
import { readRecord, emptyPuzzle, withCells, STORAGE_KEY } from '../dist/chromium/state.js';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const golden = [...'COATING'];
const read = { type: 'pangram:read' };
const record = (writer, sequence, cells = golden, mode = 'hints', revealedWords = []) =>
  ({ schemaVersion: 1, revision: `${writer}:${sequence}`, cells, mode, revealedWords });
const save = (next, baseRevision = null) => ({ type: 'pangram:save', baseRevision, record: next });

function memory(initial) {
  let value = initial;
  const writes = [];
  return {
    get value() { return value; },
    writes,
    async get(key) { assert.equal(key, STORAGE_KEY); return { [key]: value }; },
    async set(items) {
      assert.deepEqual(Object.keys(items), [STORAGE_KEY]);
      value = structuredClone(items[STORAGE_KEY]);
      writes.push(value);
    },
  };
}

test('an empty puzzle defaults to hints and Reset can retain either selected mode', () => {
  const cells = Array(7).fill('');
  assert.deepEqual(emptyPuzzle(), { cells, mode: 'hints', revealedWords: [] });
  for (const mode of ['full', 'hints']) {
    assert.deepEqual(emptyPuzzle(mode), { cells, mode, revealedWords: [] });
  }
});

test('fresh, damaged and future schemas respond safely', async () => {
  const fresh = createPersistence(memory());
  assert.deepEqual(await fresh(read), { status: 'ready', record: null, recovered: false });
  const damaged = memory({ ...record(a, 1), cells: [...'CCATING'] });
  const recover = createPersistence(damaged);
  assert.deepEqual(await recover(read), { status: 'ready', record: null, recovered: true });
  assert.deepEqual(await recover(save(record(a, 1))), { status: 'saved' });

  const unknown = { schemaVersion: 999, arbitrary: ['preserve'] };
  const protectedStorage = memory(unknown);
  const future = createPersistence(protectedStorage);
  assert.deepEqual(await future(read), { status: 'future' });
  assert.deepEqual(await future(save(record(a, 1))), { status: 'future' });
  assert.deepEqual(protectedStorage.value, unknown);
});

test('reject malformed records and messages without writing', async () => {
  const storage = memory();
  const handle = createPersistence(storage);
  for (const invalid of [
    { cells: golden.slice(0, 6) }, { cells: Array(7) }, { cells: [...'COATINK'] },
    { cells: [...'coating'] }, { cells: [...'CCATING'] }, { mode: 'other' },
    { revision: 'malformed' }, { revealedWords: ['coating', 'coating'] },
    { revealedWords: ['cogitator'] }, { revealedWords: ['coating'], cells: emptyPuzzle().cells },
    { revealedWords: Array(257).fill('coating') }, { extra: true },
  ]) {
    assert.equal(readRecord({ ...record(a, 1), ...invalid }).kind, 'corrupt');
    assert.deepEqual(await handle(save({ ...record(a, 1), ...invalid })), { status: 'invalid' });
  }
  for (const invalid of [null, 42, [], { type: 'pangram:read', extra: true }, save(record(a, 1), 'bad')]) {
    assert.deepEqual(await handle(invalid), { status: 'invalid' });
  }
  assert.deepEqual(storage.writes, []);
});

test('reveals survive reordering but clear on a new center, changed letters or an incomplete puzzle', () => {
  const state = record(a, 1, golden, 'hints', ['coating']);
  for (const cells of [golden, [...'CGNITAO']]) {
    assert.deepEqual(withCells(state, cells).revealedWords, ['coating']);
  }
  for (const cells of [[...'OCATING'], [...'COATINX'], ['C', 'O', '', 'T', 'I', 'N', 'G']]) {
    assert.deepEqual(withCells(state, cells).revealedWords, []);
  }
});

test('queued reads wait for in-flight writes and a cleared revision survives worker restart', async () => {
  const storage = memory();
  let start;
  let release;
  const started = new Promise(resolve => { start = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const handle = createPersistence({
    get: storage.get,
    async set(items) {
      if (storage.writes.length === 0) { start(); await gate; }
      await storage.set(items);
    },
  });
  const initial = handle(save(record(a, 1, golden, 'hints', ['coating'])));
  await started;
  const reset = record(a, 2, emptyPuzzle().cells);
  const cleared = handle(save(reset));
  const reopened = handle(read);
  assert.equal(storage.value, undefined);
  release();
  assert.deepEqual(await initial, { status: 'saved' });
  assert.deepEqual(await cleared, { status: 'saved' });
  assert.deepEqual(await reopened, { status: 'ready', record: reset, recovered: false });

  const restarted = createPersistence(storage);
  assert.deepEqual(await restarted(save(record(a, 1))), { status: 'superseded' });
  assert.deepEqual(await restarted(save(reset)), { status: 'saved' });
  assert.deepEqual(await restarted(save(record(b, 1), a + ':1')), { status: 'conflict' });
  assert.equal(storage.writes.length, 2);
});

test('out-of-order rapid snapshots protect latest input and block the displaced popup', async () => {
  const storage = memory();
  const handle = createPersistence(storage);
  const reset = record(a, 2, emptyPuzzle().cells);
  const fresh = record(a, 3, ['Q', '', '', '', '', '', '']);
  assert.deepEqual(await handle(save(fresh)), { status: 'saved' });
  assert.deepEqual(await handle(save(reset)), { status: 'superseded' });
  const newPopup = record(b, 1, golden, 'full', ['coating']);
  assert.deepEqual(await handle(save(newPopup, fresh.revision)), { status: 'saved' });
  assert.deepEqual(await handle(save(record(a, 4))), { status: 'conflict' });
  assert.deepEqual(storage.value, newPopup);
});

test('a failed read or write leaves the queue usable and a later complete snapshot can commit', async () => {
  const storage = memory();
  let reads = 0;
  let sets = 0;
  const handle = createPersistence({
    async get(key) {
      if (++reads === 1) throw new Error('read failure');
      return storage.get(key);
    },
    async set(items) {
      if (++sets === 1) throw new Error('write failure');
      return storage.set(items);
    },
  });
  assert.deepEqual(await handle(read), { status: 'unavailable' });
  assert.deepEqual(await handle(save(record(a, 1))), { status: 'unavailable' });
  assert.deepEqual(await handle(save(record(a, 2, golden, 'hints', ['coating', 'cogitating']))), { status: 'saved' });
  assert.deepEqual(storage.value.revealedWords, ['coating', 'cogitating']);
});

test('a new popup can save valid partial input while retaining the restored mode', async () => {
  const initial = record(a, 4, ['C', 'O', '', '', '', '', ''], 'hints');
  const storage = memory(initial);
  const handle = createPersistence(storage);
  assert.deepEqual(await handle(read), { status: 'ready', record: initial, recovered: false });
  const next = record(b, 1, ['C', 'O', 'A', '', '', '', ''], 'hints');
  assert.deepEqual(await handle(save(next, initial.revision)), { status: 'saved' });
  assert.deepEqual(storage.value, next);
});
