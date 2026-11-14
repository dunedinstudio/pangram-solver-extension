import { loadDictionary } from './dictionary.js';
import { bindHoneycomb } from './honeycomb.js';
import { renderResults } from './results.js';
import { validatePuzzle } from './pangram.js';
import type { PangramSolver, PuzzleInput } from './pangram.js';

type DictionaryState = 'loading' | 'unavailable' | PangramSolver;

const cells = Array.from(document.querySelectorAll<HTMLInputElement>('.honeycomb input'));
const progress = document.querySelector('#letter-count')!;
const feedback = document.querySelector<HTMLElement>('#input-error')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
const results = {
  panel: document.querySelector<HTMLElement>('#result-panel')!,
  count: document.querySelector<HTMLElement>('#result-count')!,
  status: document.querySelector<HTMLElement>('#result-status')!,
  announcement: document.querySelector<HTMLElement>('#result-announcement')!,
  list: document.querySelector<HTMLUListElement>('#result-list')!,
};

let puzzle: PuzzleInput = emptyPuzzle();
let dictionary: DictionaryState = 'loading';
let invalidCell: HTMLInputElement | undefined;

function emptyPuzzle(): PuzzleInput {
  return { center: '', outer: Array<string>(6).fill('') };
}

function render(): void {
  const entered = [puzzle.center, ...puzzle.outer].filter(Boolean).length;
  progress.textContent = `${entered} of 7 letters`;

  const validation = validatePuzzle(puzzle);
  if (invalidCell || validation.status === 'invalid') {
    renderResults(results, { status: 'invalid' });
  } else if (typeof dictionary === 'string') {
    renderResults(results, { status: dictionary });
  } else {
    renderResults(results, dictionary(puzzle));
  }
}

function clearFeedback(): void {
  invalidCell?.removeAttribute('aria-invalid');
  invalidCell?.removeAttribute('aria-errormessage');
  invalidCell = undefined;
  feedback.textContent = '';
}

bindHoneycomb(cells, (position, raw) => {
  const next = [puzzle.center, ...puzzle.outer];
  const previous = next[position]!;
  next[position] = raw;
  const updated = { center: next[0]!, outer: next.slice(1) };
  const validation = validatePuzzle(updated);

  clearFeedback();
  if (validation.status === 'invalid') {
    invalidCell = cells[position]!;
    invalidCell.setAttribute('aria-invalid', 'true');
    invalidCell.setAttribute('aria-errormessage', feedback.id);
    feedback.textContent = validation.reason === 'duplicate'
      ? `${raw.toUpperCase()} is already in the honeycomb. Choose a different letter.`
      : 'Enter one English letter (A–Z) per cell.';
    render();
    return { value: previous, advance: false };
  }

  const value = raw.toUpperCase();
  next[position] = value;
  puzzle = { center: next[0]!, outer: next.slice(1) };
  render();
  return { value, advance: !previous && Boolean(value) };
});

reset.addEventListener('click', () => {
  puzzle = emptyPuzzle();
  for (const cell of cells) cell.value = '';
  clearFeedback();
  render();
  cells[0]?.focus();
});

render();
const loaded = await loadDictionary();
dictionary = loaded.status === 'ready' ? loaded.solve : 'unavailable';
render();
