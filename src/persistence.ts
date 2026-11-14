import { isObject, isRevision, readRecord, STORAGE_KEY } from './state.js';
import type { SavedPuzzle } from './state.js';

export type PuzzleMessage =
  | { readonly type: 'pangram:read' }
  | { readonly type: 'pangram:save'; readonly baseRevision: string | null; readonly record: SavedPuzzle };

export type PuzzleReply =
  | { readonly status: 'ready'; readonly record: SavedPuzzle | null; readonly recovered: boolean }
  | { readonly status: 'saved' | 'superseded' | 'conflict' | 'future' | 'unavailable' | 'invalid' };

export interface LocalPuzzleStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function sequence(revision: string): number {
  return Number(revision.slice(37));
}

/** One queue owns both reads and writes. Every operation rereads the durable record. */
export function createPersistence(storage: LocalPuzzleStorage) {
  let queue = Promise.resolve();

  async function handle(message: unknown): Promise<PuzzleReply> {
    if (!isObject(message)) return { status: 'invalid' };
    const reading = message.type === 'pangram:read';
    const incoming = reading ? undefined : readRecord(message.record);
    if (reading ? Object.keys(message).length !== 1 :
      message.type !== 'pangram:save' || Object.keys(message).length !== 3
      || (message.baseRevision !== null && !isRevision(message.baseRevision))
      || incoming?.kind !== 'record') return { status: 'invalid' };

    const current = readRecord((await storage.get(STORAGE_KEY))[STORAGE_KEY]);
    if (current.kind === 'future') return { status: 'future' };
    const record = current.kind === 'record' ? current.record : null;
    if (reading) return { status: 'ready', record, recovered: current.kind === 'corrupt' };
    if (incoming?.kind !== 'record') return { status: 'invalid' };

    const next = incoming.record;
    if (record?.revision.slice(0, 36) === next.revision.slice(0, 36)) {
      if (record.revision === next.revision) return { status: 'saved' };
      if (sequence(record.revision) > sequence(next.revision)) return { status: 'superseded' };
    } else if ((record?.revision ?? null) !== message.baseRevision) {
      return { status: 'conflict' };
    }

    await storage.set({ [STORAGE_KEY]: next });
    return { status: 'saved' };
  }

  return (message: unknown): Promise<PuzzleReply> => {
    const reply = queue.then(() => handle(message)).catch((): PuzzleReply => ({ status: 'unavailable' }));
    queue = reply.then(() => undefined);
    return reply;
  };
}
