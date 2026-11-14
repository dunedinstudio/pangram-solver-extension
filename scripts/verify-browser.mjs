import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PANGRAM_PLAYWRIGHT || 'playwright-core');
const name = process.argv[2];
const executables = {
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
};
assert.ok(Object.hasOwn(executables, name), 'Choose chrome or edge.');
const preview = process.argv.includes('--preview');
const scale = process.argv.includes('--scaled') ? 1.25 : 1;
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = resolve(root, 'private/phase3', [name, preview ? 'preview' : 'native', scale].join('-'));
const unpacked = resolve(root, 'dist/chromium');
await mkdir(evidence, { recursive: true });

const run = await mkdtemp(resolve(evidence, 'session-'));
const report = { browser: name, mode: preview ? 'extension tab preview' : 'native action', scale, checks: [], screenshots: [] };
let context;

async function waitFor(get, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await get();
    if (result) return result;
    await delay(75);
  }
  throw new Error(`Timed out: ${label}`);
}

function attach(cdp, sessionId) {
  const pending = new Map();
  let nextId = 0;
  cdp.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const reply = JSON.parse(event.message);
    const task = pending.get(reply.id);
    if (!task) return;
    if (reply.error) task.reject(new Error(reply.error.message));
    else task.resolve(reply.result);
  });
  return async (method, params = {}) => {
    const id = ++nextId;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        timer = setTimeout(() => reject(new Error(`Timed out: ${method}`)), 10000);
        cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
      });
    } finally {
      clearTimeout(timer);
      pending.delete(id);
    }
  };
}

async function check(label, action) {
  try {
    await action();
    report.checks.push({ label, status: 'PASS' });
    console.log(`PASS ${name}: ${label}`);
  } catch (error) {
    report.checks.push({ label, status: 'FAIL', error: String(error) });
    throw error;
  }
}

try {
  context = await chromium.launchPersistentContext(resolve(run, 'profile'), {
    executablePath: process.env.PANGRAM_BROWSER || executables[name],
    headless: false,
    viewport: null,
    timeout: 15000,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--disable-background-networking',
      '--no-first-run', '--window-size=1100,820', `--force-device-scale-factor=${scale}`],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  await context.setOffline(true);
  report.version = await cdp.send('Browser.getVersion');
  const host = context.pages()[0] ?? await context.newPage();
  const hostTitle = 'Pangram Solver QA host';
  await host.setContent(`<title>${hostTitle}</title><main>Local extension test</main>`);
  const targets = async () => (await cdp.send('Target.getTargets', { filter: [{}] })).targetInfos;
  const tab = await waitFor(async () => (await targets()).find(target => target.type === 'tab'
    && (target.title === hostTitle || target.url === 'about:blank')), 'host browser tab');

  async function open(path) {
    const { id } = await cdp.send('Extensions.loadUnpacked', { path });
    const url = `chrome-extension://${id}/popup.html`;
    let page;
    if (preview) {
      page = await context.newPage();
      await page.goto(url);
      const session = await context.newCDPSession(page);
      return { send: (method, params) => session.send(method, params), close: () => page.close() };
    }
    await cdp.send('Target.activateTarget', { targetId: tab.targetId });
    await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
    const target = await waitFor(async () => (await targets()).find(item => item.url === url
      && item.type === 'page'), 'native extension popup target');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
    return {
      send: attach(cdp, sessionId),
      targetId: target.targetId,
      async close() {
        await cdp.send('Target.closeTarget', { targetId: target.targetId });
        await waitFor(async () => !(await targets()).some(item => item.targetId === target.targetId), 'popup teardown');
      },
    };
  }

  let popup = await open(unpacked);
  async function offline(value) {
    await popup.send('Network.emulateNetworkConditions', {
      offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
  }
  await offline(true);
  async function evaluate(expression) {
    const reply = await popup.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
    return reply.result.value;
  }

  const query = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const read = selector => evaluate(`${query(selector)}.textContent`);
  const cells = () => evaluate("[...document.querySelectorAll('.cell input')].map(input => input.value)");
  const names = () => evaluate("[...document.querySelectorAll('#result-list .word')].map(el => el.textContent)");
  const focus = () => evaluate("[...document.querySelectorAll('.cell input')].indexOf(document.activeElement)");
  const focusCell = index => evaluate(`document.querySelectorAll('.cell input')[${index}].focus()`);
  const special = { Tab: 9, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, End: 35, Enter: 13 };

  async function key(key, modifiers = 0) {
    const printable = key.length === 1;
    const code = printable ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : `Digit${key}`) : key;
    const keyCode = printable ? key.toUpperCase().charCodeAt(0) : special[key];
    const params = { key, code, modifiers, windowsVirtualKeyCode: keyCode };
    await popup.send('Input.dispatchKeyEvent', { type: printable ? 'keyDown' : 'rawKeyDown',
      ...params, ...(printable ? { text: key, unmodifiedText: key } : {}) });
    if (key === 'Enter') {
      await popup.send('Input.dispatchKeyEvent', { type: 'char', ...params, text: '\r', unmodifiedText: '\r' });
    }
    await popup.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  }

  async function click(selector) {
    const { x, y } = await evaluate(`(() => { const r = ${query(selector)}.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await popup.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  }

  async function shot(file) {
    const name = `${file}.png`;
    const { data } = await popup.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(evidence, name), Buffer.from(data, 'base64'));
    report.screenshots.push(name);
  }

  async function fill(letters) {
    await click('#reset');
    for (const letter of letters) await key(letter);
  }

  await check('correct installed extension and popup context', async () => {
    const { extensions } = await cdp.send('Extensions.getExtensions');
    assert.ok(extensions.some(extension => extension.name === 'Pangram Solver' && extension.enabled));
    assert.equal(await evaluate('chrome.runtime.getManifest().action.default_popup'), 'popup.html');
    if (!preview) {
      await assert.rejects(cdp.send('Browser.getWindowForTarget', { targetId: popup.targetId }));
    }
    assert.ok(await evaluate("location.protocol === 'chrome-extension:'"));
    assert.equal(await evaluate('navigator.onLine'), false);
  });

  await check('empty state, accessible names, center focus and compact geometry', async () => {
    await waitFor(() => evaluate("document.querySelector('#result-status')?.textContent.startsWith('Enter all')"), 'dictionary ready');
    assert.equal(await read('#letter-count'), '0 of 7 letters');
    assert.deepEqual(await cells(), Array(7).fill(''));
    assert.equal(await focus(), 0);
    const ax = await popup.send('Accessibility.getFullAXTree');
    const textboxes = ax.nodes.filter(node => node.role?.value === 'textbox' && !node.ignored);
    assert.deepEqual(textboxes.map(node => node.name.value), [
      'Required center letter', 'Outer letter, top', 'Outer letter, upper right',
      'Outer letter, lower right', 'Outer letter, bottom', 'Outer letter, lower left', 'Outer letter, upper left',
    ]);
    assert.equal(textboxes[0].properties.find(prop => prop.name === 'required')?.value.value, true);
    report.layout = await evaluate(`(() => {
      const root = document.documentElement;
      const footer = document.querySelector('footer').getBoundingClientRect();
      const comb = document.querySelector('.honeycomb').getBoundingClientRect();
      return { width: window.innerWidth, height: window.innerHeight,
        bodyWidth: document.body.clientWidth, contentHeight: root.scrollHeight, scrollWidth: root.scrollWidth,
        footerBottom: footer.bottom, honeycombWidth: comb.width, honeycombHeight: comb.height,
        dpr: devicePixelRatio, cssZoom: visualViewport.scale,
        sections: [...document.querySelector('main').children].map(el => [el.className || el.tagName, el.getBoundingClientRect().height]) };
    })()`);
    assert.ok(report.layout.bodyWidth >= 320 && report.layout.bodyWidth <= 360);
    await shot('01-empty');
    assert.ok(report.layout.scrollWidth <= report.layout.width);
    assert.ok(report.layout.footerBottom <= report.layout.height);
    assert.equal(await evaluate("document.querySelector('.title img').naturalWidth"), 128);
  });

  await check('partial puzzle, case normalization and auto-advance', async () => {
    for (const letter of 'cOa') await key(letter);
    assert.deepEqual(await cells(), ['C', 'O', 'A', '', '', '', '']);
    assert.equal(await focus(), 3);
    assert.equal(await read('#letter-count'), '3 of 7 letters');
    assert.deepEqual(await names(), []);
    assert.match(await read('#result-status'), /Enter all 7 letters/);
    await shot('02-partial');
  });

  const golden = ['coating', 'cogitating', 'cogitation', 'contacting', 'contagion', 'containing', 'cottaging'];
  await check('automatic golden puzzle, exact order, lengths and result announcement', async () => {
    for (const letter of 'tInG') await key(letter);
    assert.deepEqual(await names(), golden);
    assert.equal(await read('#result-count'), '7 found');
    assert.equal(await read('#result-announcement'), '7 pangrams found.');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.word-length')].map(e => e.textContent)"),
      golden.map(word => `${word.length} letters`));
    assert.equal(await focus(), 6);
    await shot('03-golden');
  });

  await check('duplicate and invalid edits preserve the previous letter and clear stale results', async () => {
    await key('c');
    assert.equal((await cells())[6], 'G');
    assert.match(await read('#input-error'), /C is already in the honeycomb/);
    assert.deepEqual(await names(), []);
    assert.equal(await evaluate("document.querySelector('#result-count').hidden"), true);
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-invalid')"), 'true');
    assert.ok(await evaluate("document.querySelector('footer').getBoundingClientRect().bottom <= innerHeight"));
    await shot('04-duplicate');
    await key('3');
    assert.match(await read('#input-error'), /A–Z/);
    assert.equal((await cells())[6], 'G');
    await key('G');
    assert.deepEqual(await names(), golden);
  });

  await check('click editing, Delete, Backspace, Tab, Shift+Tab, arrows and single-letter paste', async () => {
    await click('.upper-right input');
    assert.equal(await focus(), 2);
    await key('Delete');
    assert.equal(await read('#letter-count'), '6 of 7 letters');
    assert.deepEqual(await names(), []);
    await evaluate(`(() => { const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', 'a');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    })()`);
    assert.deepEqual(await names(), golden);
    await focusCell(0);
    await key('ArrowUp');
    assert.equal(await focus(), 1);
    await key('Tab');
    assert.equal(await focus(), 2);
    await key('Tab', 8);
    assert.equal(await focus(), 1);
    await key('ArrowDown');
    assert.equal(await focus(), 0);
    await key('ArrowLeft');
    assert.equal(await focus(), 5);
    await key('ArrowRight');
    assert.equal(await focus(), 3);
    await focusCell(0);
    await key('Backspace');
    assert.equal((await cells())[0], '');
    assert.equal(await read('#letter-count'), '6 of 7 letters');
    assert.deepEqual(await names(), []);
  });

  await check('zero and long result states, keyboard scrolling and footer visibility', async () => {
    await fill('QXZJKVB');
    assert.equal(await read('#result-count'), '0 found');
    assert.match(await read('#result-status'), /No pangrams found/);
    await fill('AEINRST');
    assert.equal(await read('#result-count'), '42 found');
    const dictionary = (await readFile(resolve(root, 'data/words.txt'), 'utf8')).trimEnd().split('\n');
    const expected = dictionary.filter(word => [...new Set(word)].sort().join('') === 'aeinrst');
    assert.deepEqual(await names(), expected);
    await evaluate("document.querySelector('#result-panel').focus()");
    await key('End');
    await waitFor(() => evaluate(`(() => {
      const panel = document.querySelector('#result-panel');
      return panel.scrollTop > 0 && panel.scrollHeight - panel.clientHeight - panel.scrollTop < 2;
    })()`), 'result panel scroll to final row');
    report.longLayout = await evaluate(`(() => {
      const panel = document.querySelector('#result-panel');
      const footer = document.querySelector('footer').getBoundingClientRect();
      return { panelHeight: panel.clientHeight, scrollHeight: panel.scrollHeight, scrollTop: panel.scrollTop,
        horizontalOverflow: panel.scrollWidth - panel.clientWidth, pageScrollY: scrollY,
        footerBottom: footer.bottom, viewportHeight: innerHeight };
    })()`);
    assert.ok(report.longLayout.footerBottom <= report.longLayout.viewportHeight);
    assert.equal(report.longLayout.horizontalOverflow, 0);
    assert.equal(report.longLayout.pageScrollY, 0);
    await shot('05-long-scrolled');
  });

  await check('keyboard Reset clears errors and results and restores center focus', async () => {
    await focusCell(6);
    await key('a');
    assert.ok(await read('#input-error'));
    await evaluate("document.querySelector('#reset').focus()");
    await key('Enter');
    assert.equal(await focus(), 0);
    assert.equal(await read('#letter-count'), '0 of 7 letters');
    assert.equal(await read('#input-error'), '');
    assert.deepEqual(await cells(), Array(7).fill(''));
    assert.deepEqual(await names(), []);
    await shot('06-reset');
  });

  const website = 'https://spellingbeeanswers.app/';
  await check('one safe CTA opens the exact URL, lead-in and attribution are plain text', async () => {
    const footer = await evaluate(`(() => {
      const node = document.querySelector('footer');
      const link = node.querySelector('a');
      return { linkCount: document.links.length, target: link.target, rel: link.rel, href: link.href,
        clickLabel: link.textContent, prefix: link.previousSibling.textContent.trim(),
        attribution: node.querySelector('.attribution').outerHTML,
        color: getComputedStyle(node.querySelector('.attribution')).color };
    })()`);
    assert.deepEqual(footer, {
      linkCount: 1, target: '_blank', rel: 'noopener noreferrer', href: website, clickLabel: 'Visit our FREE solver!',
      prefix: 'Need more Spelling Bee solving tools?', attribution: '<p class="attribution">Powered By spellingbeeanswers.app</p>',
      color: 'rgb(11, 11, 11)',
    });
    // Fulfill the navigation inside the isolated browser. The outgoing URL is still the real click target.
    await offline(false);
    await context.setOffline(false);
    await context.route(website, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Local QA response</title>' }));
    const navigation = context.waitForEvent('page', { timeout: 8000 });
    await click('footer a');
    const page = await navigation;
    await page.waitForURL(website);
    assert.equal(await page.evaluate('window.opener'), null);
    await page.close();
    await context.setOffline(true);
  });

  await check('missing dictionary is handled in a second unpacked extension', async () => {
    await popup.close().catch(() => {}); // Native popup normally closes when the CTA opens its tab.
    const broken = resolve(run, 'missing-dictionary');
    await cp(unpacked, broken, { recursive: true, filter: path => !path.endsWith('dictionary-data.js') });
    popup = await open(broken);
    await waitFor(() => evaluate("document.querySelector('#result-status')?.textContent.includes('dictionary is unavailable')"), 'missing dictionary state');
    for (const letter of 'COATING') await key(letter);
    assert.equal(await read('#letter-count'), '7 of 7 letters');
    assert.match(await read('#result-status'), /dictionary is unavailable/);
    assert.deepEqual(await names(), []);
    assert.equal(await evaluate("document.querySelector('#result-count').hidden"), true);
    await shot('07-dictionary-unavailable');
  });

  await check('loading feedback accepts letters and solves once preparation completes', async () => {
    await popup.close();
    const delayed = resolve(run, 'delayed-dictionary');
    await cp(unpacked, delayed, { recursive: true });
    const module = resolve(delayed, 'dictionary-data.js');
    const data = await readFile(module, 'utf8');
    await writeFile(module, "await new Promise(resolve => { globalThis.qaReleaseDictionary = resolve; });\n" + data);
    popup = await open(delayed);
    await waitFor(() => evaluate("document.querySelector('#result-status')?.textContent.includes('Preparing')"), 'loading state');
    await waitFor(() => evaluate("typeof globalThis.qaReleaseDictionary === 'function'"), 'dictionary test gate');
    for (const letter of 'COATING') await key(letter);
    assert.equal(await read('#letter-count'), '7 of 7 letters');
    assert.deepEqual(await names(), []);
    await evaluate('globalThis.qaReleaseDictionary()');
    await waitFor(async () => (await names()).length === 7, 'automatic solve after dictionary readiness');
    assert.deepEqual(await names(), golden);
  });

  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error);
  throw error;
} finally {
  await context?.close();
  await writeFile(resolve(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await rm(run, { recursive: true, force: true, maxRetries: 3 });
}
