import { validatePuzzle } from './pangram.js';
import type { PuzzleInput } from './pangram.js';

export const STORAGE_KEY = 'pangramSolver.activePuzzle';
export type Mode = 'full' | 'hints';

export interface PuzzleState {
  readonly cells: readonly string[];
  readonly mode: Mode;
  readonly revealedWords: readonly string[];
}

export interface SavedPuzzle extends PuzzleState {
  readonly schemaVersion: 1;
  readonly revision: string;
}

export function emptyPuzzle(mode: Mode = 'full'): PuzzleState {
  return { cells: Array<string>(7).fill(''), mode, revealedWords: [] };
}

export function asPuzzle(cells: readonly string[]): PuzzleInput {
  return { center: cells[0]!, outer: cells.slice(1) };
}

export function puzzleIdentity(cells: readonly string[]): string | undefined {
  const puzzle = asPuzzle(cells);
  return validatePuzzle(puzzle).status === 'ready'
    ? puzzle.center + [...puzzle.outer].sort().join('')
    : undefined;
}

export function withCells(state: PuzzleState, cells: readonly string[]): PuzzleState {
  const identity = puzzleIdentity(cells);
  return {
    ...state,
    cells,
    revealedWords: identity && identity === puzzleIdentity(state.cells) ? state.revealedWords : [],
  };
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isRevision(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 50
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}:[1-9][0-9]{0,12}$/.test(value)
    && !/\s/.test(value);
}

export function readRecord(value: unknown):
  | { kind: 'missing' | 'corrupt' | 'future' }
  | { kind: 'record'; record: SavedPuzzle } {
  if (value === undefined) return { kind: 'missing' };
  if (isObject(value) && typeof value.schemaVersion === 'number'
    && Number.isInteger(value.schemaVersion) && value.schemaVersion > 1) return { kind: 'future' };
  if (!isObject(value) || Object.keys(value).length !== 5 || value.schemaVersion !== 1
    || !isRevision(value.revision) || (value.mode !== 'full' && value.mode !== 'hints')
    || !Array.isArray(value.cells) || value.cells.length !== 7
    || !Array.from(value.cells).every(cell => cell === '' ||
      (typeof cell === 'string' && cell.length === 1 && /[A-Z]/.test(cell)))
    || !Array.isArray(value.revealedWords) || value.revealedWords.length > 256) {
    return { kind: 'corrupt' };
  }
  const cells = value.cells as string[];
  const validation = validatePuzzle(asPuzzle(cells));
  const reveals = Array.from(value.revealedWords) as unknown[];
  const letters = cells.join('').toLowerCase();
  if (validation.status === 'invalid' || new Set(reveals).size !== reveals.length
    || (reveals.length > 0 && validation.status !== 'ready')
    || !reveals.every(word => typeof word === 'string' && word.length >= 7 && word.length <= 64
      && !/[^a-z]/.test(word) && new Set(word).size === 7
      && [...new Set(word)].every(letter => letters.includes(letter)))) {
    return { kind: 'corrupt' };
  }
  return {
    kind: 'record',
    record: { schemaVersion: 1, revision: value.revision, cells, mode: value.mode,
      revealedWords: reveals as string[] },
  };
}
