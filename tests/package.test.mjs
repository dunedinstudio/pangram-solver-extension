import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const output = new URL('../dist/chromium/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));

test('build emits the complete development popup, engine and dictionary files', async () => {
  assert.deepEqual((await readdir(output)).sort(), [
    'background.js', 'browser.js', 'data', 'dictionary-data.js', 'dictionary.js', 'honeycomb.js',
    'icons', 'licenses', 'manifest.json', 'pangram.js', 'persistence.js', 'popup.css',
    'popup.html', 'popup.js', 'results.js', 'state.js',
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
  assert.doesNotMatch(html, /\bon\w+\s*=/i);
  assert.deepEqual(html.match(/https?:\/\/[^"\s]+/g), ['https://spellingbeeanswers.app/']);
});

test('footer has one external link and a separate plain-text attribution', async () => {
  const html = await readFile(new URL('popup.html', output), 'utf8');
  assert.match(html, /<p>Need more Spelling Bee solving tools\? <a href="https:\/\/spellingbeeanswers\.app\/" target="_blank" rel="noopener noreferrer">Visit our FREE solver!<\/a><\/p>/);
  assert.match(html, /<p class="attribution">Powered By spellingbeeanswers\.app<\/p>/);
  assert.equal(html.match(/<a\b/g)?.length, 1);
  assert.match(html, /Enter 7 letters to find pangrams instantly\./);
  assert.equal(html.match(/<input\b/g)?.length, 7);
  assert.match(html, /aria-label="Required center letter" aria-required="true"/);
});

test('mode markup puts Full Answers on the left and selects Hints Only before restore', async () => {
  const html = await readFile(new URL('popup.html', output), 'utf8');
  assert.match(html, /<button id="full-mode" type="button" aria-pressed="false">Full Answers<\/button>\s+<button id="hint-mode" type="button" aria-pressed="true">Hints Only<\/button>/);
});

test('manifest requests only local storage and preserves the local-only script policy', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Pangram Solver');
  assert.equal(manifest.version, version);
  assert.equal(manifest.action.default_title, manifest.name);
  assert.deepEqual(Object.keys(manifest).sort(), [
    'action', 'background', 'content_security_policy', 'description', 'icons', 'manifest_version',
    'name', 'permissions', 'version',
  ]);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.background, { service_worker: 'background.js', type: 'module' });
  assert.deepEqual(manifest.content_security_policy.extension_pages.split('; '), [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "object-src 'none'",
    "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
  ]);
});

test('approved mascot and correctly sized distinct PNG icons are packaged', async () => {
  assert.deepEqual((await readdir(new URL('icons/', output))).sort(),
    ['icon-128.png', 'icon-16.png', 'icon-32.png', 'icon-48.png', 'mascot.png']);
  assert.deepEqual(Object.keys(manifest.action.default_icon), ['16', '32']);
  assert.deepEqual(Object.keys(manifest.icons), ['16', '32', '48', '128']);
  for (const [size, file] of Object.entries(manifest.icons)) {
    const icon = await readFile(new URL(file, output));
    assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(icon.readUInt32BE(16), Number(size));
    assert.equal(icon.readUInt32BE(20), Number(size));
    if (size in manifest.action.default_icon) assert.equal(manifest.action.default_icon[size], file);
  }
  const mascot = await readFile(new URL('icons/mascot.png', output));
  assert.equal(createHash('sha256').update(mascot).digest('hex'),
    '5f2e4ecad55278b4e3eef160e58899c582c5dacd98e9eb3f9e4174242f438a2e');
  assert.notDeepEqual(mascot, await readFile(new URL(manifest.icons[128], output)));
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
