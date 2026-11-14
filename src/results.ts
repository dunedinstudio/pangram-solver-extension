import type { SolveResult } from './pangram.js';

type ResultState = Exclude<SolveResult, { status: 'invalid' }> | {
  readonly status: 'invalid' | 'loading' | 'unavailable';
};

interface ResultsView {
  readonly panel: HTMLElement;
  readonly count: HTMLElement;
  readonly status: HTMLElement;
  readonly announcement: HTMLElement;
  readonly list: HTMLUListElement;
}

const messages = {
  loading: 'Preparing the offline dictionary…',
  incomplete: 'Enter all 7 letters to see your pangrams.',
  invalid: 'Correct the highlighted input to see pangrams.',
  unavailable: 'The offline dictionary is unavailable. Try reopening the extension.',
};

export function renderResults(view: ResultsView, state: ResultState): void {
  const solved = state.status === 'solved';
  const hasWords = solved && state.count > 0;
  const count = solved ? `${state.count} found` : '';
  view.count.hidden = !solved;
  view.count.textContent = count;
  view.status.hidden = hasWords;
  view.list.hidden = !hasWords;

  const message = solved ? 'No pangrams found. Try a different set of letters.' : messages[state.status];
  if (!hasWords) view.status.textContent = message;
  const announcement = hasWords
    ? `${state.count} pangram${state.count === 1 ? '' : 's'} found.`
    : state.status === 'invalid' ? '' : message;
  if (view.announcement.textContent !== announcement) view.announcement.textContent = announcement;

  const rows = document.createDocumentFragment();
  if (hasWords) {
    for (const pangram of state.pangrams) {
      const row = document.createElement('li');
      const word = document.createElement('span');
      const length = document.createElement('span');
      word.className = 'word';
      word.textContent = pangram.word;
      length.className = 'word-length';
      length.textContent = `${pangram.length} letters`;
      row.append(word, length);
      rows.append(row);
    }
  }
  view.list.replaceChildren(rows);
  view.panel.scrollTop = 0;
}
