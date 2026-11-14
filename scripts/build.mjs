import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createManifest } from '../manifest.mjs';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const output = new URL('chromium/', dist);

// Keep the clean build inside the repository even if dist is a link or junction.
for (const directory of [dist, output]) {
  const path = resolve(fileURLToPath(directory));
  const info = await lstat(path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (info && !info.isDirectory()) {
    throw new Error(`Expected a regular directory at ${path}`);
  }
}

const packageInfo = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const provenance = await readFile(new URL('data/provenance.json', root), 'utf8');
const dictionary = await readFile(new URL('data/words.txt', root));
const { bytes, sha256, upstreamNotices } = JSON.parse(provenance);
function verifyHash(data, expected, file) {
  if (createHash('sha256').update(data).digest('hex') !== expected) {
    throw new Error(`Integrity check failed for ${file}.`);
  }
}

if (dictionary.length !== bytes) throw new Error('Unexpected dictionary byte count.');
verifyHash(dictionary, sha256, 'data/words.txt');
const notices = new Map();
for (const name of ['ESDB-Copyright.txt', 'ESDB-Sources.md', 'NOTICE.md']) {
  const data = await readFile(new URL(`licenses/${name}`, root));
  if (name !== 'NOTICE.md') verifyHash(data, upstreamNotices[name], name);
  notices.set(name, data);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const compiler = fileURLToPath(new URL('node_modules/typescript/bin/tsc', root));
const result = spawnSync(process.execPath, [compiler, '--project', 'tsconfig.json'], {
  cwd: fileURLToPath(root),
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('TypeScript compilation failed.');

for (const file of ['popup.html', 'popup.css']) {
  await copyFile(new URL(`public/${file}`, root), new URL(file, output));
}
const manifest = JSON.stringify(createManifest(packageInfo), null, 2);
await writeFile(new URL('manifest.json', output), `${manifest}\n`, 'utf8');
await writeFile(new URL('dictionary-data.js', output),
  `export default ${JSON.stringify(dictionary.toString('utf8'))};\n`, 'utf8');
await mkdir(new URL('data/', output));
await writeFile(new URL('data/provenance.json', output), provenance, 'utf8');
await mkdir(new URL('licenses/', output));
for (const [name, data] of notices) {
  await writeFile(new URL(`licenses/${name}`, output), data);
}
