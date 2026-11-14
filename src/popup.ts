import { loadDictionary } from './dictionary.js';

const status = document.getElementById('solver-status');
if (status) {
  const dictionary = await loadDictionary();
  const sample = dictionary.status === 'ready'
    ? dictionary.solve({ center: 'C', outer: ['O', 'A', 'T', 'I', 'N', 'G'] })
    : undefined;

  status.textContent = sample?.status === 'solved'
    ? `Development check for C/O/A/T/I/N/G. ${sample.count} pangrams.`
    : 'Offline dictionary unavailable.';
}
