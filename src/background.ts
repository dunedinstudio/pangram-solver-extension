import { extension } from './browser.js';
import { createPersistence } from './persistence.js';

if (extension) {
  const persist = createPersistence(extension.storage.local);
  const popupUrl = extension.runtime.getURL('popup.html');
  const extensionId = extension.runtime.id;
  extension.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== extensionId || sender.url !== popupUrl) return undefined;
    void persist(message).then(respond);
    return true;
  });
}
