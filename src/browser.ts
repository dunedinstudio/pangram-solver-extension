import type { LocalPuzzleStorage, PuzzleMessage, PuzzleReply } from './persistence.js';

type Respond = (reply: PuzzleReply) => void;
type Sender = { readonly id?: string; readonly url?: string };
interface ExtensionApi {
  readonly runtime: {
    readonly id: string;
    readonly lastError?: { readonly message?: string };
    getURL(path: string): string;
    sendMessage(message: PuzzleMessage, respond: (reply?: PuzzleReply) => void): void;
    readonly onMessage: {
      addListener(listener: (message: unknown, sender: Sender, respond: Respond) => true | undefined): void;
    };
  };
  readonly storage: { readonly local: LocalPuzzleStorage };
}

export const extension = (globalThis as { chrome?: ExtensionApi }).chrome;

export function requestPuzzle(message: PuzzleMessage): Promise<PuzzleReply> {
  return new Promise<PuzzleReply>(resolve => {
    if (!extension?.runtime?.sendMessage) {
      resolve({ status: 'unavailable' });
      return;
    }
    extension.runtime.sendMessage(message, reply => {
      resolve(extension.runtime.lastError || !reply ? { status: 'unavailable' } : reply);
    });
  }).catch(() => ({ status: 'unavailable' }));
}
