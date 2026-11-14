import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const output = new URL('../dist/chromium/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));

test('build emits the complete development popup, engine and dictionary files', async () => {
  assert.deepEqual((await readdir(output)).sort(), [
    'data', 'dictionary-data.js', 'dictionary.js', 'licenses', 'manifest.json',
    'pangram.js', 'popup.css', 'popup.html', 'popup.js',
  ]);
  assert.deepEqual(await readdir(new URL('data/', output)), ['provenance.json']);
  assert.deepEqual((await readdir(new URL('licenses/', output))).sort(), [
    'ESDB-Copyright.txt', 'ESDB-Sources.md', 'NOTICE.md',
  ]);
  const html = await readFile(new URL(manifest.action.default_popup, output), 'utf8');
  assert.match(html, /<h1>Pangram Solver<\/h1>/);
  assert.match(html, /<link rel="stylesheet" href="popup\.css">/);
  assert.deepEqual(html.match(/<script\b[^>]*>[^<]*<\/script>/gi), [
    '<script type="module" src="popup.js"></script>',
  ]);
  assert.doesNotMatch(html, /\b(?:on\w+\s*=|https?:\/\/)/i);
});

test('manifest has its own identity, no requested access and a local-only script policy', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Pangram Solver');
  assert.equal(manifest.version, version);
  assert.equal(manifest.action.default_title, manifest.name);
  assert.deepEqual(Object.keys(manifest).sort(), [
    'action', 'content_security_policy', 'description', 'manifest_version', 'name', 'version',
  ]);
  assert.deepEqual(manifest.content_security_policy.extension_pages.split('; '), [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "object-src 'none'",
    "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
  ]);
});

test('the full upstream notices match the dictionary provenance pins', async () => {
  const provenance = new URL('../data/provenance.json', import.meta.url);
  const { upstreamNotices } = JSON.parse(await readFile(provenance, 'utf8'));
  assert.deepEqual(await readFile(new URL('data/provenance.json', output)), await readFile(provenance));
  assert.deepEqual(await readFile(new URL('licenses/NOTICE.md', output)),
    await readFile(new URL('../licenses/NOTICE.md', import.meta.url)));
  assert.deepEqual(Object.keys(upstreamNotices).sort(), ['ESDB-Copyright.txt', 'ESDB-Sources.md']);

  for (const [name, expected] of Object.entries(upstreamNotices)) {
    const notice = await readFile(new URL(`../licenses/${name}`, import.meta.url));
    const digest = createHash('sha256').update(notice).digest('hex');
    assert.equal(digest, expected, name);
    assert.deepEqual(await readFile(new URL(`licenses/${name}`, output)), notice, name);
  }
});
