import { spawnSync } from 'node:child_process';
import { arch, cpus, release, totalmem, type } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { loadDictionary } from '../dist/chromium/dictionary.js';

const puzzles = [
  { label: 'reference', letters: 'COATING', expected: 7 },
  { label: 'highest-count', letters: 'AEINRST', expected: 42 },
  { label: 'single-result', letters: 'ABDGINO', expected: 1 },
  { label: 'consonant-heavy zero', letters: 'QXZJKVB', expected: 0 },
];

function benchSolve(solve, { letters, expected }) {
  const input = { center: letters[0], outer: [...letters.slice(1)] };
  return () => {
    const result = solve(input);
    if (result.status !== 'solved' || result.count !== expected) {
      throw new Error(`Unexpected benchmark result for ${letters}.`);
    }
    return result.count;
  };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

async function coldSample() {
  globalThis.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const preparationStart = performance.now();
  const dictionary = await loadDictionary();
  const preparationMs = performance.now() - preparationStart;
  if (dictionary.status !== 'ready') throw new Error('Dictionary unavailable.');
  const first = benchSolve(dictionary.solve, puzzles[0]);
  const firstStart = performance.now();
  first();
  const firstSolveMs = performance.now() - firstStart;
  globalThis.gc();
  const retainedHeapMiB = (process.memoryUsage().heapUsed - heapBefore) / 2 ** 20;
  console.log(JSON.stringify({ preparationMs, firstSolveMs, retainedHeapMiB }));
}

async function benchmark() {
  const coldRuns = 25;
  const cold = [];
  const script = fileURLToPath(import.meta.url);
  for (let run = 0; run < coldRuns; run += 1) {
    const result = spawnSync(process.execPath, ['--expose-gc', script, '--cold-sample'], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'Cold sample failed.');
    cold.push(JSON.parse(result.stdout));
  }

  const dictionary = await loadDictionary();
  if (dictionary.status !== 'ready') throw new Error('Dictionary unavailable.');
  const warmup = 5000;
  const batches = 200;
  const solvesPerBatch = 100;
  const repeated = puzzles.map(puzzle => {
    const solve = benchSolve(dictionary.solve, puzzle);
    for (let i = 0; i < warmup; i += 1) solve();

    const averageMicroseconds = [];
    for (let batch = 0; batch < batches; batch += 1) {
      const start = performance.now();
      for (let i = 0; i < solvesPerBatch; i += 1) solve();
      averageMicroseconds.push((performance.now() - start) * 1000 / solvesPerBatch);
    }
    return { puzzle: puzzle.label, letters: puzzle.letters, count: puzzle.expected,
      batchMeanMicroseconds: stats(averageMicroseconds) };
  });

  const cpu = cpus();
  console.log(JSON.stringify({
    environment: { os: `${type()} ${release()}`, arch: arch(), node: process.version,
      pnpm: process.env.npm_config_user_agent?.split(' ')[0], cpu: cpu[0]?.model,
      logicalProcessors: cpu.length, systemRamGiB: totalmem() / 2 ** 30 },
    cold: { sampleCount: coldRuns, puzzle: puzzles[0].letters,
      preparationMs: stats(cold.map(result => result.preparationMs)),
      firstSolveMs: stats(cold.map(result => result.firstSolveMs)),
      retainedHeapMiB: stats(cold.map(result => result.retainedHeapMiB)) },
    warm: { warmupPerPuzzle: warmup, batchesPerPuzzle: batches, solvesPerBatch, repeated },
  }, null, 2));
}

if (process.argv[2] === '--cold-sample') {
  await coldSample();
} else {
  await benchmark();
}
