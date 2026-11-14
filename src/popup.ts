import { requestPuzzle } from './browser.js';
import { loadDictionary } from './dictionary.js';
import { bindHoneycomb } from './honeycomb.js';
import { renderResults } from './results.js';
import { validatePuzzle } from './pangram.js';
import { asPuzzle, emptyPuzzle, readRecord, withCells } from './state.js';
import type { PangramSolver } from './pangram.js';
import type { Mode, PuzzleState } from './state.js';

type DictionaryState = 'loading' | 'unavailable' | PangramSolver;

const letters = document.querySelector<HTMLElement>('.letters')!;
const cells = Array.from(letters.querySelectorAll<HTMLInputElement>('.honeycomb input'));
const progress = document.querySelector('#letter-count')!;
const feedback = document.querySelector<HTMLElement>('#input-error')!;
const notice = document.querySelector<HTMLElement>('#storage-notice')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
const full = document.querySelector<HTMLButtonElement>('#full-mode')!;
const hints = document.querySelector<HTMLButtonElement>('#hint-mode')!;
const results = {
  panel: document.querySelector<HTMLElement>('#result-panel')!,
  count: document.querySelector<HTMLElement>('#result-count')!,
  status: document.querySelector<HTMLElement>('#result-status')!,
  announcement: document.querySelector<HTMLElement>('#result-announcement')!,
  progress: document.querySelector<HTMLElement>('#reveal-progress')!,
  list: document.querySelector<HTMLUListElement>('#result-list')!,
};

let state = emptyPuzzle();
let dictionary: DictionaryState = 'loading';
let invalidCell: HTMLInputElement | undefined;
let restoring = true;
let writable = false;
let writer = { id: '', baseRevision: null as string | null, sequence: 0 };

function setNotice(message: string): void {
  if (notice.textContent !== message) notice.textContent = message;
}

function render(): void {
  progress.textContent = `${state.cells.filter(Boolean).length} of 7 letters`;
  full.setAttribute('aria-pressed', String(state.mode === 'full'));
  hints.setAttribute('aria-pressed', String(state.mode === 'hints'));

  const result = restoring ? { status: 'restoring' as const }
    : invalidCell ? { status: 'invalid' as const }
    : typeof dictionary === 'string' ? { status: dictionary }
    : dictionary(asPuzzle(state.cells));
  renderResults(results, result, state, reveal);
}

function clearFeedback(): void {
  invalidCell?.removeAttribute('aria-invalid');
  invalidCell?.removeAttribute('aria-errormessage');
  invalidCell = undefined;
  feedback.textContent = '';
}

function reconcileReveals(): boolean {
  if (typeof dictionary === 'string' || !state.revealedWords.length) return false;
  const solution = dictionary(asPuzzle(state.cells));
  const matches = solution.status === 'solved' ? new Set(solution.pangrams.map(item => item.word)) : new Set<string>();
  const revealedWords = state.revealedWords.filter(word => matches.has(word));
  if (revealedWords.length === state.revealedWords.length) return false;
  state = { ...state, revealedWords };
  return true;
}

function showRestoring(value: boolean): void {
  restoring = value;
  // Keep the user's focused control in the tab sequence during conflict recovery.
  // The event handlers ignore actions until the authoritative read has completed.
  letters.setAttribute('aria-busy', String(value));
  for (const control of [...cells, full, hints, reset]) {
    if (value) control.setAttribute('aria-disabled', 'true');
    else control.removeAttribute('aria-disabled');
  }
}

async function restore(afterConflict = false): Promise<void> {
  showRestoring(true);
  writer = { id: crypto.randomUUID(), baseRevision: null, sequence: 0 };
  render();
  const reply = await requestPuzzle({ type: 'pangram:read' });
  writable = reply.status === 'ready';
  if (reply.status === 'ready') {
    const saved = readRecord(reply.record ?? undefined);
    if (saved.kind === 'record') {
      state = saved.record;
      writer.baseRevision = saved.record.revision;
    } else {
      state = emptyPuzzle();
    }
    if (afterConflict) setNotice('Another popup changed this puzzle. Your last changes were not saved. Try again.');
    else if (reply.recovered) setNotice('Saved progress was damaged. You can enter a new puzzle.');
    else setNotice('');
    if (reconcileReveals()) save();
  } else if (reply.status === 'future') {
    setNotice('Saved progress needs a newer version. This session will not be saved.');
  } else {
    setNotice('Saved progress could not be loaded. This session will not be saved.');
  }

  clearFeedback();
  cells.forEach((cell, position) => { cell.value = state.cells[position]!; });
  showRestoring(false);
  render();
  if (!afterConflict) cells[0]?.focus();
}

function save(resetRequested = false): void {
  if (!writable) {
    if (resetRequested) setNotice('Reset could not be saved. A previous puzzle may return when you reopen.');
    return;
  }

  const activeWriter = writer;
  const sequence = ++activeWriter.sequence;
  const record = {
    schemaVersion: 1 as const, revision: `${activeWriter.id}:${sequence}`,
    cells: state.cells, mode: state.mode, revealedWords: state.revealedWords,
  };
  void requestPuzzle({ type: 'pangram:save', baseRevision: activeWriter.baseRevision, record }).then(reply => {
    if (writer !== activeWriter || activeWriter.sequence !== sequence) return;
    if (reply.status === 'saved' || reply.status === 'superseded') {
      setNotice('');
    } else if (reply.status === 'conflict' || reply.status === 'future') {
      void restore(true);
    } else {
      setNotice(resetRequested
        ? 'Reset could not be saved. A previous puzzle may return when you reopen.'
        : 'Progress could not be saved. Your changes may be lost when you reopen.');
    }
  });
}

function selectMode(mode: Mode): void {
  if (restoring || state.mode === mode) return;
  state = { ...state, mode };
  save();
  render();
}

function reveal(word: string): void {
  if (restoring || state.mode !== 'hints' || state.revealedWords.includes(word)) return;
  state = { ...state, revealedWords: [...state.revealedWords, word] };
  save();
  render();
}

bindHoneycomb(cells, (position, raw) => {
  const previous = state.cells[position]!;
  if (restoring) return { value: previous, advance: false };

  const next = [...state.cells];
  next[position] = raw;
  const validation = validatePuzzle(asPuzzle(next));
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
  if (value !== previous) {
    state = withCells(state, next);
    save();
  }
  render();
  return { value, advance: !previous && Boolean(value) };
});

full.addEventListener('click', () => selectMode('full'));
hints.addEventListener('click', () => selectMode('hints'));
reset.addEventListener('click', () => {
  if (restoring) return;
  state = emptyPuzzle(state.mode);
  for (const cell of cells) cell.value = '';
  clearFeedback();
  save(true);
  render();
  cells[0]?.focus();
});

const restoration = restore();
const [loaded] = await Promise.all([loadDictionary(), restoration]);
dictionary = loaded.status === 'ready' ? loaded.solve : 'unavailable';
if (reconcileReveals()) save();
render();
