export interface PuzzleInput {
  readonly center: string;
  readonly outer: readonly string[];
}

type InvalidReason = 'shape' | 'letter' | 'duplicate';

export type PuzzleValidation =
  | { readonly status: 'ready'; readonly mask: number }
  | { readonly status: 'incomplete' }
  | { readonly status: 'invalid'; readonly reason: InvalidReason };

export interface Pangram {
  readonly word: string;
  readonly length: number;
}

export type SolveResult =
  | Exclude<PuzzleValidation, { status: 'ready' }>
  | { readonly status: 'solved'; readonly count: number; readonly pangrams: readonly Pangram[] };

export type PangramSolver = (input: unknown) => SolveResult;

const MIN_WORD_LENGTH = 4;
const PUZZLE_LETTERS = 7;
const EMPTY_PANGRAMS: readonly Pangram[] = Object.freeze([]);

export function validatePuzzle(input: unknown): PuzzleValidation {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 'invalid', reason: 'shape' };
  }

  const { center, outer } = input as Record<string, unknown>;
  if (!Array.isArray(outer) || outer.length !== PUZZLE_LETTERS - 1) {
    return { status: 'invalid', reason: 'shape' };
  }

  let mask = 0;
  let incomplete = false;
  for (let position = 0; position < PUZZLE_LETTERS; position += 1) {
    const letter: unknown = position === 0 ? center : outer[position - 1];
    if (letter === '') {
      incomplete = true;
      continue;
    }
    if (typeof letter !== 'string' || letter.length !== 1 || !/[A-Za-z]/.test(letter)) {
      return { status: 'invalid', reason: 'letter' };
    }

    const bit = 1 << (letter.toLowerCase().charCodeAt(0) - 97);
    if ((mask & bit) !== 0) return { status: 'invalid', reason: 'duplicate' };
    mask |= bit;
  }

  return incomplete ? { status: 'incomplete' } : { status: 'ready', mask };
}

/** Index the sorted, LF-delimited dictionary once. Malformed data fails as a whole. */
export function createPangramSolver(dictionary: string): PangramSolver {
  const words = dictionary.split('\n');
  if (words.pop() !== '' || words.length === 0) {
    throw new Error('Expected a nonempty dictionary ending in LF.');
  }

  const index = new Map<number, Pangram[]>();
  let previous = '';
  for (const word of words) {
    if (word.length < MIN_WORD_LENGTH || /[^a-z]/.test(word) || word <= previous) {
      throw new Error('Expected unique, ASCII-sorted lowercase dictionary words of at least four letters.');
    }
    previous = word;

    if (word.length < PUZZLE_LETTERS) continue;
    let mask = 0;
    let distinct = 0;
    for (let offset = 0; offset < word.length; offset += 1) {
      const bit = 1 << (word.charCodeAt(offset) - 97);
      if ((mask & bit) === 0) {
        distinct += 1;
        if (distinct > PUZZLE_LETTERS) break;
        mask |= bit;
      }
    }
    if (distinct !== PUZZLE_LETTERS) continue;

    const pangram = Object.freeze({ word, length: word.length });
    const bucket = index.get(mask);
    if (bucket) {
      bucket.push(pangram);
    } else {
      index.set(mask, [pangram]);
    }
  }
  for (const bucket of index.values()) Object.freeze(bucket);

  return input => {
    const puzzle = validatePuzzle(input);
    if (puzzle.status !== 'ready') return puzzle;

    // Exact mask equality requires all seven letters, including the validated center.
    const pangrams = index.get(puzzle.mask) ?? EMPTY_PANGRAMS;
    return { status: 'solved', count: pangrams.length, pangrams };
  };
}
