import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { loadDictionary } from '../dist/chromium/dictionary.js';
import { createPangramSolver, validatePuzzle } from '../dist/chromium/pangram.js';
import packagedDictionary from '../dist/chromium/dictionary-data.js';

const alphabet = 'abcdefghijklmnopqrstuvwxyz';
const reference = { center: 'C', outer: ['O', 'A', 'T', 'I', 'N', 'G'] };
const golden = [
  'coating', 'cogitating', 'cogitation', 'contacting', 'contagion', 'containing', 'cottaging',
];
const source = await readFile(new URL('../data/words.txt', import.meta.url));
const words = source.toString('utf8').slice(0, -1).split('\n');
const dictionary = await loadDictionary();
assert.equal(dictionary.status, 'ready');
const solve = dictionary.solve;

function asPuzzle(letters) {
  return { center: letters[0], outer: [...letters.slice(1)] };
}

function checkSolved(result, expected, message) {
  assert.equal(result.status, 'solved', message);
  assert.equal(result.count, expected.length, message);
  assert.deepEqual(result.pangrams.map(({ word, length }) => [word, length]),
    expected.map(word => [word, word.length]), message);
}

test('dictionary bytes, count, sort order, length and normalization match the approved source', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '8db581a29b4ec371d5e2ea1b1a4006444728356808022c7d3d55d6b4806aa241');
  assert.equal(source.length, 743158);
  assert.equal(packagedDictionary, source.toString('utf8'));
  assert.equal(source.at(-1), 10);
  assert.equal(words.length, 77533);
  const lengths = new Set(words.map(word => word.length));
  assert.equal(Math.min(...lengths), 4);
  assert.equal(Math.max(...lengths), 23);
  assert.equal(new Set(words).size, words.length);
  assert.ok(words.every((word, i) => !/[^a-z]/.test(word) && (i === 0 || words[i - 1] < word)));
  assert.equal(words.filter(word => new Set(word).size === 7).length, 17296);
});

test('puzzle validation is case-insensitive and independent of outer order', () => {
  const expected = validatePuzzle(reference);
  assert.equal(expected.status, 'ready');
  for (const letters of ['coating', 'COATING', 'cOaTiNg', 'cgniato']) {
    assert.deepEqual(validatePuzzle(asPuzzle(letters)), expected);
  }
});

test('blank cells represent incomplete puzzles, including a blank center', () => {
  for (const input of [
    { ...reference, center: '' },
    { ...reference, outer: ['', 'A', 'T', 'I', 'N', 'G'] },
    { center: '', outer: ['', '', '', '', '', ''] },
    { center: 'C', outer: ['O', '', '', '', '', ''] },
  ]) {
    assert.deepEqual(solve(input), { status: 'incomplete' });
  }
});

test('duplicate center and outer letters fail case-insensitively, even in partial puzzles', () => {
  for (const outer of [
    ['c', 'A', 'T', 'I', 'N', 'G'],
    ['O', 'o', 'T', 'I', 'N', 'G'],
    ['O', 'o', '', '', '', ''],
  ]) {
    assert.deepEqual(solve({ ...reference, outer }), { status: 'invalid', reason: 'duplicate' });
  }
});

test('unsupported characters and non-string cells are invalid before normalization', () => {
  for (const value of ['2', '.', ' ', '\n', 'C\n', 'É', 'K', 'ſ', 'Ｃ', 'С', '🐝',
    'CO', ' C', null, undefined, NaN, true, {}, ['C']]) {
    assert.deepEqual(solve({ ...reference, center: value }), { status: 'invalid', reason: 'letter' });
    assert.deepEqual(solve({ ...reference, outer: ['O', 'A', value, 'I', 'N', 'G'] }),
      { status: 'invalid', reason: 'letter' });
  }
});

test('malformed puzzle shells, missing cells and extra cells are invalid', () => {
  for (const input of [
    null, undefined, 42, false, 'coating', [], {}, { center: 'C', outer: null },
    { center: 'C', outer: 'OATING' }, { center: 'C', outer: ['O'] },
    { ...reference, outer: [...reference.outer, 'S'] },
  ]) {
    assert.deepEqual(solve(input), { status: 'invalid', reason: 'shape' });
  }
  for (const input of [{ outer: reference.outer }, { center: 'C', outer: Array(6) }]) {
    assert.deepEqual(solve(input), { status: 'invalid', reason: 'letter' });
  }
});

test('matching accepts repeated permitted letters and excludes every kind of non-pangram', () => {
  const fixture = [
    'aaaaaaa', 'acating', 'acting', 'cacao', 'coating', 'coatings', 'containing',
    'coooaaatttiiinnnggg', 'notation', 'tonic',
  ].sort();
  const fixtureSolve = createPangramSolver(fixture.join('\n') + '\n');
  checkSolved(fixtureSolve(reference), ['coating', 'containing', 'coooaaatttiiinnnggg']);
  checkSolved(fixtureSolve(asPuzzle('bcdefgh')), []);
});

test('the C/O/A/T/I/N/G golden puzzle returns exactly the seven approved words', () => {
  const permitted = 'coating';
  for (const word of golden) {
    assert.ok(words.includes(word), word);
    assert.ok(word.includes('c') && [...word].every(letter => permitted.includes(letter)), word);
    assert.ok([...permitted].every(letter => word.includes(letter)), word);
  }
  checkSolved(solve(reference), golden);
  assert.ok(words.includes('acting'));
});

test('every mandatory center and rotation of outer positions preserves exact pangrams', () => {
  for (const center of 'coating') {
    const outer = [...'coating'].filter(letter => letter !== center);
    for (let rotation = 0; rotation < outer.length; rotation += 1) {
      const order = [...outer.slice(rotation), ...outer.slice(0, rotation)];
      const puzzle = { center, outer: order };
      checkSolved(solve(puzzle), golden);
      assert.deepEqual(solve(puzzle), solve(puzzle));
    }
  }
});

test('shared result buckets and entries cannot be mutated', () => {
  const result = solve(reference);
  assert.throws(() => result.pangrams.push({ word: 'invalid', length: 7 }), TypeError);
  assert.throws(() => { result.pangrams[0].word = 'invalid'; }, TypeError);
  checkSolved(solve(reference), golden);
});

test('invalid dictionary data fails before exposing a solver', () => {
  for (const data of ['', '\n', 'coating', 'coat\n\n', 'COAT\n', 'coat\r\n', 'coat \n',
    'açaí\n', 'cat\n', 'zinc\ncoat\n', 'coat\ncoat\n']) {
    assert.throws(() => createPangramSolver(data), /Expected/);
  }
});

test('dictionary initialization is cached and unavailable resources return a typed failure', async () => {
  assert.equal(loadDictionary(), loadDictionary());

  const directory = await mkdtemp(join(tmpdir(), 'pangram-missing-'));
  try {
    const modulePath = join(directory, 'dictionary.mjs');
    const loader = await readFile(new URL('../dist/chromium/dictionary.js', import.meta.url), 'utf8');
    await writeFile(modulePath, loader.replace('./pangram.js', './pangram.mjs'));
    await copyFile(new URL('../dist/chromium/pangram.js', import.meta.url), join(directory, 'pangram.mjs'));
    const missing = await import(pathToFileURL(modulePath).href);
    assert.deepEqual(await missing.loadDictionary(), { status: 'unavailable' });

    await writeFile(join(directory, 'dictionary-data.js'), 'export default "bad data";\n');
    const malformed = await import(pathToFileURL(modulePath).href + '?malformed');
    assert.deepEqual(await malformed.loadDictionary(), { status: 'unavailable' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the development popup calls the bundled engine and renders the reference count', async () => {
  const status = { textContent: '' };
  globalThis.document = { getElementById: id => id === 'solver-status' ? status : null };
  try {
    await import('../dist/chromium/popup.js');
    assert.equal(status.textContent, 'Development check for C/O/A/T/I/N/G. 7 pangrams.');
  } finally {
    delete globalThis.document;
  }
});

// Independent corpus projection uses a sorted character signature and never imports mask helpers.
const oracleBySignature = new Map();
for (const word of words) {
  const letters = new Set(word);
  if (word.length < 4 || letters.size !== 7) continue;
  const signature = [...letters].sort().join('');
  const bucket = oracleBySignature.get(signature) ?? [];
  bucket.push(word);
  oracleBySignature.set(signature, bucket);
}

function* combinations(start, remaining, prefix = '') {
  if (remaining === 0) {
    yield prefix;
    return;
  }
  for (let index = start; index <= alphabet.length - remaining; index += 1) {
    yield* combinations(index + 1, remaining - 1, prefix + alphabet[index]);
  }
}

test('every seven-letter combination agrees with the independent corpus projection', context => {
  let tested = 0;
  let populated = 0;
  let matchedWords = 0;
  let maxCount = 0;
  let maxPuzzle = '';
  for (const letters of combinations(0, 7)) {
    const expected = oracleBySignature.get(letters) ?? [];
    const puzzle = asPuzzle(letters);
    const actual = solve(puzzle);
    assert.equal(actual.status, 'solved', letters);
    assert.equal(actual.count, expected.length, letters);
    for (let index = 0; index < expected.length; index += 1) {
      assert.equal(actual.pangrams[index].word, expected[index], letters);
      assert.equal(actual.pangrams[index].length, expected[index].length, letters);
    }
    tested += 1;
    if (expected.length) populated += 1;
    matchedWords += expected.length;
    if (expected.length > maxCount) {
      maxCount = expected.length;
      maxPuzzle = letters;
    }
  }
  assert.equal(tested, 657800);
  assert.equal(populated, oracleBySignature.size);
  assert.equal(matchedWords, 17296);
  context.diagnostic(JSON.stringify({ tested, populated, zero: tested - populated, matchedWords, maxCount, maxPuzzle }));
});

test('seeded and representative puzzles agree with an independent full-dictionary scan', context => {
  const seed = 0x5eed2026;
  let state = seed;
  function nextRandom() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  }

  const ranked = [...oracleBySignature].sort((a, b) => b[1].length - a[1].length);
  const single = ranked.find(([, bucket]) => bucket.length === 1)[0];
  const puzzles = [reference, asPuzzle('AEIOUXZ'), asPuzzle('QXZJKVB'),
    asPuzzle(ranked[0][0]), asPuzzle(single)];
  const seen = new Set(puzzles.map(({ center, outer }) => [center, ...outer].map(c => c.toLowerCase()).sort().join('')));
  const populatedSets = [...oracleBySignature.keys()];
  for (const fromCorpus of [false, true]) {
    for (let samples = 0; samples < 64;) {
      const choices = [...(fromCorpus
        ? populatedSets[Math.floor(nextRandom() * populatedSets.length)]
        : alphabet)];
      const letters = Array.from({ length: 7 }, () =>
        choices.splice(Math.floor(nextRandom() * choices.length), 1)[0],
      ).join('');
      const key = [...letters].sort().join('');
      if (seen.has(key)) continue;
      seen.add(key);
      puzzles.push(asPuzzle(letters));
      samples += 1;
    }
  }

  for (const puzzle of puzzles) {
    const center = puzzle.center.toLowerCase();
    const permitted = new Set([center, ...puzzle.outer.map(letter => letter.toLowerCase())]);
    const expected = words.filter(word => word.length >= 4 && word.includes(center)
      && [...word].every(letter => permitted.has(letter))
      && [...permitted].every(letter => word.includes(letter)));
    checkSolved(solve(puzzle), expected, [...permitted].join(''));
  }
  context.diagnostic(JSON.stringify({ seed, puzzles: puzzles.length, dictionaryRows: words.length,
    rowsChecked: puzzles.length * words.length }));
});
