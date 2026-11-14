import { spawnSync } from 'node:child_process';
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
