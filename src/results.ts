import type { Pangram, SolveResult } from './pangram.js';
import type { Mode, PuzzleState } from './state.js';

type ResultState = Exclude<SolveResult, { status: 'invalid' }> | {
  readonly status: 'invalid' | 'loading' | 'unavailable' | 'restoring';
};

interface ResultsView {
  readonly panel: HTMLElement;
  readonly count: HTMLElement;
  readonly status: HTMLElement;
  readonly announcement: HTMLElement;
  readonly progress: HTMLElement;
  readonly list: HTMLUListElement;
}

interface Row {
  readonly item: Pangram;
  readonly node: HTMLLIElement;
  readonly word: HTMLSpanElement;
  readonly reveal: HTMLButtonElement | undefined;
}

const messages = {
  restoring: 'Restoring your puzzle…',
  loading: 'Preparing the offline dictionary…',
  incomplete: 'Enter all 7 letters to see your pangrams.',
  invalid: 'Correct the highlighted input to see pangrams.',
  unavailable: 'The offline dictionary is unavailable. Try reopening the extension.',
};

let displayed: readonly Pangram[] | undefined;
let displayedMode: Mode | undefined;
let rows: Row[] = [];

function createRow(item: Pangram, mode: Mode, onReveal: (word: string) => void): Row {
  const node = document.createElement('li');
  const word = document.createElement('span');
  const length = document.createElement('span');
  word.className = 'word';
  length.className = 'word-length';
  length.textContent = `${item.length} letters`;
  node.append(word, length);

  let reveal: HTMLButtonElement | undefined;
  if (mode === 'hints') {
    reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'reveal';
    reveal.setAttribute('aria-label', `Reveal ${item.length}-letter pangram beginning with ${item.word.slice(0, 2).toUpperCase()}`);
    reveal.addEventListener('click', () => onReveal(item.word));
    node.append(reveal);
  }
  return { item, node, word, reveal };
}

export function renderResults(
  view: ResultsView, result: ResultState, state: PuzzleState, onReveal: (word: string) => void,
): void {
  const solved = result.status === 'solved';
  const pangrams = solved && result.count ? result.pangrams : undefined;
  view.count.hidden = !solved;
  view.count.textContent = solved ? `${result.count} found` : '';
  view.status.hidden = Boolean(pangrams);
  view.list.hidden = !pangrams;

  const message = solved ? 'No pangrams found. Try a different set of letters.' : messages[result.status];
  if (!pangrams) view.status.textContent = message;

  if (displayed !== pangrams || displayedMode !== state.mode) {
    if (view.list.contains(document.activeElement)) view.panel.focus({ preventScroll: true });
    rows = pangrams?.map(item => createRow(item, state.mode, onReveal)) ?? [];
    view.list.replaceChildren(...rows.map(row => row.node));
    if (displayed !== pangrams) view.panel.scrollTop = 0;
    displayed = pangrams;
    displayedMode = state.mode;
  }

  let revealed = 0;
  let justRevealed = '';
  const hintMode = state.mode === 'hints';
  const known = new Set(state.revealedWords);
  for (const row of rows) {
    const concealed = hintMode && !known.has(row.item.word);
    const label = concealed ? row.item.word.slice(0, 2) + '•'.repeat(row.item.length - 2) : row.item.word;
    if (row.word.textContent !== label) row.word.textContent = label;
    if (concealed) {
      row.word.setAttribute('aria-label', `${row.item.length}-letter pangram beginning with ${row.item.word.slice(0, 2).toUpperCase()}`);
    } else {
      row.word.removeAttribute('aria-label');
    }
    if (!concealed && row.reveal) {
      if (!row.reveal.hidden && document.activeElement === row.reveal) {
        row.node.tabIndex = -1;
        row.node.focus({ preventScroll: true });
        justRevealed = row.item.word;
      }
      revealed += 1;
    }
    if (row.reveal) row.reveal.hidden = !concealed;
  }

  const progress = hintMode && pangrams ? `${revealed} of ${pangrams.length} revealed` : '';
  view.progress.textContent = progress;
  const announcement = pangrams
    ? `${pangrams.length} pangram${pangrams.length === 1 ? '' : 's'} found.${hintMode ? ` Hints Only. ${progress}.` : ' Full Answers.'}`
    : result.status === 'invalid' ? '' : message;
  const spoken = justRevealed ? `Revealed ${justRevealed}. ${announcement}` : announcement;
  if (view.announcement.textContent !== spoken) view.announcement.textContent = spoken;
}
