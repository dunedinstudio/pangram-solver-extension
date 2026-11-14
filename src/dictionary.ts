import { createPangramSolver } from './pangram.js';
import type { PangramSolver } from './pangram.js';

type DictionaryLoad =
  | { readonly status: 'ready'; readonly solve: PangramSolver }
  | { readonly status: 'unavailable' };

let prepared: Promise<DictionaryLoad> | undefined;

/** Load and prepare the packaged dictionary once per extension page. */
export function loadDictionary(): Promise<DictionaryLoad> {
  prepared ??= import('./dictionary-data.js').then(
    ({ default: words }): DictionaryLoad => ({ status: 'ready', solve: createPangramSolver(words) }),
  ).catch((): DictionaryLoad => ({ status: 'unavailable' }));
  return prepared;
}
