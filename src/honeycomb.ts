type EditCell = (position: number, raw: string) => { value: string; advance: boolean };

// The array follows the DOM order: center, then clockwise from the top.
const positions = [[0, 0], [0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]] as const;
const directions: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowRight: [1, 0],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
};

function arrowTarget(position: number, dx: number, dy: number): number {
  const origin = positions[position]!;
  let target = position;
  let best = Infinity;
  positions.forEach(([x, y], candidate) => {
    const horizontal = x - origin[0];
    const vertical = y - origin[1];
    if (horizontal * dx + vertical * dy <= 0) return;

    const score = Math.abs(horizontal * dy - vertical * dx) * 3
      + Math.hypot(horizontal, vertical);
    if (score < best) {
      target = candidate;
      best = score;
    }
  });
  return target;
}

export function bindHoneycomb(cells: readonly HTMLInputElement[], edit: EditCell): void {
  cells.forEach((cell, position) => {
    cell.autocomplete = 'off';
    cell.spellcheck = false;

    const commit = (raw: string): void => {
      const { value, advance } = edit(position, raw);
      cell.value = value;
      const next = advance ? cells[position + 1] : undefined;
      if (next) next.focus();
      else if (document.activeElement === cell) cell.select();
    };

    cell.addEventListener('focus', () => cell.select());
    cell.addEventListener('click', () => cell.select());
    cell.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;

      const direction = Object.hasOwn(directions, event.key) ? directions[event.key] : undefined;
      if (direction) {
        event.preventDefault();
        cells[arrowTarget(position, ...direction)]?.focus();
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        if (!cell.value && event.key === 'Backspace' && position > 0
          && !cell.hasAttribute('aria-invalid')) {
          cells[position - 1]?.focus();
        } else {
          commit('');
        }
      }
    });
    cell.addEventListener('beforeinput', event => {
      if (!event.cancelable || event.isComposing || event.inputType !== 'insertText'
        || event.data === null) return;
      event.preventDefault();
      commit(event.data);
    });
    cell.addEventListener('input', event => {
      if (!(event instanceof InputEvent) || !event.isComposing) commit(cell.value);
    });
    cell.addEventListener('compositionend', () => commit(cell.value));
    cell.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text/plain');
      if (text === undefined) return;
      event.preventDefault();
      if (text) commit(text);
    });
  });
}
