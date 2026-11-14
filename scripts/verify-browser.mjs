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
const evidence = resolve(root, 'private/phase4-final-correction', [name, preview ? 'preview' : 'native', scale].join('-'));
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
  const receive = event => {
    if (event.sessionId !== sessionId) return;
    const reply = JSON.parse(event.message);
    const task = pending.get(reply.id);
    if (!task) return;
    if (reply.error) task.reject(new Error(reply.error.message));
    else task.resolve(reply.result);
  };
  cdp.on('Target.receivedMessageFromTarget', receive);
  const detached = event => {
    if (event.sessionId !== sessionId) return;
    cdp.off('Target.receivedMessageFromTarget', receive);
    cdp.off('Target.detachedFromTarget', detached);
    for (const task of pending.values()) task.reject(new Error('Popup target detached.'));
  };
  cdp.on('Target.detachedFromTarget', detached);
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

async function launch() {
  const browser = await chromium.launchPersistentContext(resolve(run, 'profile'), {
    executablePath: process.env.PANGRAM_BROWSER || executables[name],
    headless: false,
    viewport: null,
    timeout: 15000,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--disable-background-networking',
      '--no-first-run', '--window-size=1100,820', `--force-device-scale-factor=${scale}`],
  });
  return browser;
}

try {
  context = await launch();
  let cdp, host, tab;
  const hostTitle = 'Pangram Solver QA host';
  const targets = async () => (await cdp.send('Target.getTargets', { filter: [{}] })).targetInfos;
  async function connect() {
    cdp = await context.browser().newBrowserCDPSession();
    host = context.pages()[0] ?? await context.newPage();
    await host.setContent(`<title>${hostTitle}</title><main>Local game tab</main>`);
    tab = await waitFor(async () => (await targets()).find(target => target.type === 'tab'
      && (target.title === hostTitle || target.url === 'about:blank')), 'host browser tab');
  }
  await connect();
  await context.setOffline(true);
  report.version = await cdp.send('Browser.getVersion');

  async function open(path) {
    const { extensions } = await cdp.send('Extensions.getExtensions');
    const installed = extensions.find(extension => extension.path === path && extension.enabled);
    const { id } = installed ?? await cdp.send('Extensions.loadUnpacked', { path });
    const url = `chrome-extension://${id}/popup.html`;
    let page;
    if (preview) {
      page = await context.newPage();
      await page.goto(url);
      const session = await context.newCDPSession(page);
      return { id, send: (method, params) => session.send(method, params), close: () => page.close() };
    }
    await host.bringToFront();
    await cdp.send('Target.activateTarget', { targetId: tab.targetId });
    await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
    const target = await waitFor(async () => (await targets()).find(item => item.url === url
      && item.type === 'page'), 'native extension popup target');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
    return {
      id,
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
    const code = key === ' ' ? 'Space'
      : printable ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : `Digit${key}`) : key;
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

  const storageKey = 'pangramSolver.activePuzzle';
  const storageRead = `chrome.storage.local.get(${JSON.stringify(storageKey)}).then(data => data[${JSON.stringify(storageKey)}])`;
  const data = () => evaluate(storageRead);
  const masking = words => words.map(word => word.slice(0, 2) + '•'.repeat(word.length - 2));

  async function expectMode(selected) {
    const buttons = await evaluate(`[...document.querySelectorAll('.mode-switch button')].map(button => {
      const bounds = button.getBoundingClientRect();
      return { label: button.textContent, left: bounds.left, right: bounds.right, top: bounds.top,
        pressed: button.getAttribute('aria-pressed'), background: getComputedStyle(button).backgroundColor };
    })`);
    assert.deepEqual(buttons.map(button => button.label), ['Full Answers', 'Hints Only']);
    const [left, right] = buttons;
    assert.ok(left.left < right.left && left.right <= right.left + 0.5
      && Math.abs(left.top - right.top) < 0.5, JSON.stringify(buttons));
    assert.deepEqual(buttons.map(button => button.pressed), ['full', 'hints'].map(mode => String(mode === selected)));
    assert.deepEqual(buttons.map(button => button.background), ['full', 'hints'].map(mode =>
      mode === selected ? 'rgb(244, 217, 135)' : 'rgba(0, 0, 0, 0)'));
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

  await check('fresh Hints Only selection, accessible names, center focus and compact geometry', async () => {
    await waitFor(() => evaluate("document.querySelector('#result-status')?.textContent.startsWith('Enter all')"), 'dictionary ready');
    assert.equal(await read('#letter-count'), '0 of 7 letters');
    assert.deepEqual(await cells(), Array(7).fill(''));
    assert.equal(await focus(), 0);
    await expectMode('hints');
    assert.equal(await data(), undefined);
    const ax = await popup.send('Accessibility.getFullAXTree');
    const textboxes = ax.nodes.filter(node => node.role?.value === 'textbox' && !node.ignored);
    assert.deepEqual(textboxes.map(node => node.name.value), [
      'Required center letter', 'Outer letter, top', 'Outer letter, upper right',
      'Outer letter, lower right', 'Outer letter, bottom', 'Outer letter, lower left', 'Outer letter, upper left',
    ]);
    assert.equal(textboxes[0].properties.find(prop => prop.name === 'required')?.value.value, true);
    for (const [name, expected] of [['Full Answers', 'false'], ['Hints Only', 'true']]) {
      const button = ax.nodes.find(node => !node.ignored && node.name?.value === name
        && ['button', 'toggleButton'].includes(node.role?.value));
      assert.equal(String(button?.properties?.find(prop => prop.name === 'pressed')?.value.value), expected);
    }
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
    assert.deepEqual(await names(), masking(golden));
    assert.equal(await read('#result-count'), '7 found');
    assert.match(await read('#result-announcement'), /^7 pangrams found\./);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.word-length')].map(e => e.textContent)"),
      golden.map(word => `${word.length} letters`));
    assert.equal(await focus(), 6);
    await expectMode('hints');
    await shot('14-golden-first-hints');
    await evaluate("document.querySelector('#reset').focus()");
    await key('Tab');
    assert.equal(await evaluate('document.activeElement.id'), 'full-mode');
    await key('Tab');
    assert.equal(await evaluate('document.activeElement.id'), 'hint-mode');
    await key('Tab', 8);
    assert.equal(await evaluate('document.activeElement.id'), 'full-mode');
    await key('Enter');
    await expectMode('full');
    assert.deepEqual(await names(), golden);
    await shot('03-golden');
    await focusCell(6);
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
    await expectMode('full');
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
    if (!preview) {
      const id = popup.targetId;
      await waitFor(async () => !(await targets()).some(item => item.targetId === id), 'CTA closes native popup');
    }
    await page.close();
    await context.setOffline(true);
  });

  const ready = async () => {
    await waitFor(() => evaluate("document.querySelector('.letters')?.getAttribute('aria-busy') === 'false'"), 'restored popup');
  };

  async function reopen(path = unpacked) {
    const start = performance.now();
    for (let attempt = 0; ; attempt += 1) {
      try {
        popup = await open(path);
        await offline(true);
        await ready();
        break;
      } catch (error) {
        // Edge can dismiss an action target during first-run UI changes.
        if (attempt >= 2 || !/detached|No session with given id|No target with given id/i.test(String(error))) throw error;
      }
    }
    return performance.now() - start;
  }

  async function returnToGame() {
    if (preview) {
      await popup.close();
      return;
    }
    const previous = popup.targetId;
    await host.bringToFront();
    await cdp.send('Target.activateTarget', { targetId: tab.targetId });
    // In the native popup Esc returns focus to the host without waiting for a save callback.
    if ((await targets()).some(item => item.targetId === previous)) {
      await popup.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }).catch(() => {});
    }
    if ((await targets()).some(item => item.targetId === previous)) await popup.close();
    assert.ok(!(await targets()).some(item => item.targetId === previous));
  }

  async function immediateKeyAndClose(letter) {
    await key(letter);
    await returnToGame();
  }

  const readRequest = () => evaluate("chrome.runtime.sendMessage({type:'pangram:read'})");
  const rawSave = (record, baseRevision) => evaluate(`chrome.runtime.sendMessage(${JSON.stringify({
    type: 'pangram:save', baseRevision, record,
  })})`);
  const rawStorage = value => evaluate(`chrome.storage.local.set({[${JSON.stringify(storageKey)}]: ${JSON.stringify(value)}})`);
  const saved = predicate => waitFor(async () => {
    const record = await data();
    return record && predicate(record) ? record : null;
  }, 'committed storage record');

  await check('one through six letters survive immediate close and reopen', async () => {
    // The CTA closed the action popup. The earlier keyboard Reset should already be durable.
    await reopen();
    assert.deepEqual(await cells(), Array(7).fill(''));
    await expectMode('full');
    assert.equal((await data()).mode, 'full');
    for (const [index, letter] of [...'COATIN'].entries()) {
      await focusCell(index);
      await immediateKeyAndClose(letter);
      await reopen();
      assert.equal(await read('#letter-count'), `${index + 1} of 7 letters`);
      assert.deepEqual(await cells(), [...'COATIN'.slice(0, index + 1), ...Array(6 - index).fill('')]);
    }
    await shot('08-restored-partial');
    const partial = await data();
    await context.close();
    context = await launch();
    await connect();
    await reopen();
    assert.deepEqual(await cells(), [...'COATIN', '']);
    await expectMode('full');
    assert.deepEqual(await data(), partial);
    await focusCell(6);
    await key('g');
    await saved(value => value.cells.join('') === 'COATING');
    assert.deepEqual(await names(), golden);
  });

  await check('hint masking, DOM and accessibility privacy, mode persistence and individual reveals', async () => {
    await evaluate("document.querySelector('#hint-mode').focus()");
    await key('Enter');
    await expectMode('hints');
    assert.deepEqual(await names(), masking(golden));
    assert.equal(await read('#reveal-progress'), '0 of 7 revealed');
    assert.equal(await read('#result-count'), '7 found');
    const markup = await evaluate("document.querySelector('#result-panel').outerHTML.toLowerCase()");
    for (const word of golden) assert.ok(!markup.includes(word), 'Concealed answer in DOM');
    const ax = await popup.send('Accessibility.getFullAXTree');
    const accessible = ax.nodes.map(item => item.name?.value ?? '').join(' ').toLowerCase();
    for (const word of golden) assert.ok(!accessible.includes(word), 'Concealed answer in accessibility names');
    assert.match(accessible, /reveal 7-letter pangram beginning with co/);
    await shot('09-hints-concealed');
    await evaluate("document.querySelector('.reveal').focus()");
    await key('Enter');
    assert.deepEqual(await names(), ['coating', ...masking(golden.slice(1))]);
    assert.equal(await read('#reveal-progress'), '1 of 7 revealed');
    assert.equal(await evaluate("document.activeElement.tagName"), 'LI');
    await returnToGame();
    report.reopenMs = await reopen();
    await waitFor(async () => (await names()).length === 7, 'regenerated hints');
    await expectMode('hints');
    assert.deepEqual(await cells(), [...'COATING']);
    assert.deepEqual(await names(), ['coating', ...masking(golden.slice(1))]);
    assert.equal(await read('#reveal-progress'), '1 of 7 revealed');
    await shot('10-restored-reveal');
    await click('#full-mode');
    assert.deepEqual(await names(), golden);
    const fullRecord = await saved(value => value.mode === 'full');
    await returnToGame();
    await reopen();
    await expectMode('full');
    await waitFor(async () => (await names()).length === 7, 'restored full results');
    assert.deepEqual(await names(), golden);
    assert.deepEqual(await data(), fullRecord);
    await click('#hint-mode');
    assert.equal(await read('#reveal-progress'), '1 of 7 revealed');
    await evaluate("for (const button of [...document.querySelectorAll('.reveal:not([hidden])')].slice(0, 2)) button.click()");
    await returnToGame();
    await reopen();
    const record = await saved(value => value.revealedWords.length === 3);
    assert.deepEqual(record.revealedWords, golden.slice(0, 3));
    report.recordBytes = Buffer.byteLength(JSON.stringify(record));
  });

  await check('browser and worker restart restore the puzzle, mode and exact reveal set', async () => {
    const hinted = await data();
    await context.close();
    context = await launch();
    await connect();
    await reopen();
    await waitFor(async () => (await names()).length === 7, 'restarted dictionary');
    assert.deepEqual(await cells(), [...'COATING']);
    await expectMode('hints');
    assert.deepEqual(await names(), [...golden.slice(0, 3), ...masking(golden.slice(3))]);
    assert.deepEqual(await data(), hinted);

    const id = popup.id;
    await returnToGame();
    const worker = (await targets()).find(item => item.type === 'service_worker' && item.url.endsWith(id + '/background.js'));
    assert.ok(worker, 'Extension worker target must exist.');
    // Close by target ID without attaching a debugger to the worker.
    await cdp.send('Target.closeTarget', { targetId: worker.targetId });
    await waitFor(async () => !(await targets()).some(item => item.targetId === worker.targetId), 'worker termination');
    await reopen();
    await waitFor(async () => (await names()).length === 7, 'regenerated hints after worker termination');
    assert.equal(await read('#reveal-progress'), '3 of 7 revealed');
    await waitFor(async () => (await targets()).some(item => item.type === 'service_worker'
      && item.url.endsWith(id + '/background.js')), 'worker target after restart');
  });

  await check('long hints retain scroll and focus on a near-bottom keyboard reveal', async () => {
    await fill('AEINRST');
    assert.equal(await read('#result-count'), '42 found');
    assert.equal(await read('#reveal-progress'), '0 of 42 revealed');
    const expected = (await readFile(resolve(root, 'data/words.txt'), 'utf8')).trimEnd().split('\n')
      .filter(word => [...new Set(word)].sort().join('') === 'aeinrst');
    assert.deepEqual(await names(), masking(expected));
    await evaluate("[...document.querySelectorAll('.reveal')].at(-2).focus()");
    const before = await evaluate("document.querySelector('#result-panel').scrollTop");
    assert.ok(before > 0);
    await key(' ');
    assert.equal(await read('#reveal-progress'), '1 of 42 revealed');
    assert.equal((await names()).at(-2), expected.at(-2));
    assert.equal(await evaluate("document.querySelector('#result-panel').scrollTop"), before);
    assert.equal(await evaluate("document.activeElement.querySelector('.word').textContent"), expected.at(-2));
    assert.ok(await evaluate("document.querySelector('footer').getBoundingClientRect().bottom <= innerHeight"));
    await shot('11-hints-long-list');
  });

  await check('persistent Reset, late messages and reset-then-type', async () => {
    const prior = await saved(value => value.revealedWords.length === 1);
    await click('#reset');
    await returnToGame();
    await reopen();
    const reset = await saved(value => !value.cells.some(Boolean));
    assert.equal(reset.mode, 'hints');
    assert.deepEqual(reset.revealedWords, []);
    const stale = await rawSave(prior, null);
    assert.ok(['superseded', 'conflict'].includes(stale.status));
    assert.equal((await data()).revision, reset.revision);

    await evaluate(`(() => {
      document.querySelector('#reset').click();
      document.activeElement.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText', data: 'Q', bubbles: true, cancelable: true,
      }));
    })()`);
    await saved(value => value.cells[0] === 'Q');
    await click('#reset');
    await saved(value => !value.cells.some(Boolean));
    await context.close();
    context = await launch();
    await connect();
    await reopen();
    assert.deepEqual(await cells(), Array(7).fill(''));
    await expectMode('hints');
    assert.equal(await read('#reveal-progress'), '');
    await shot('12-persistent-reset');
  });

  await check('corrupt and future records, stale popup conflict, and storage latency', async () => {
    await rawStorage({ schemaVersion: 888, marker: 'keep' });
    await returnToGame();
    await reopen();
    assert.match(await read('#storage-notice'), /newer version/);
    await fill('COATING');
    await waitFor(async () => (await names()).length === 7, 'in-memory solving');
    assert.deepEqual(await data(), { schemaVersion: 888, marker: 'keep' });

    const withoutMode = {
      schemaVersion: 1, revision: '00000000-0000-4000-8000-000000000007:1',
      cells: Array(7).fill(''), revealedWords: [],
    };
    for (const value of [withoutMode, { ...withoutMode, mode: 'invalid' }]) {
      await rawStorage(value);
      await returnToGame();
      await reopen();
      await expectMode('hints');
      assert.deepEqual(await data(), value);
    }

    await rawStorage({ schemaVersion: 1, cells: ['?'] });
    await returnToGame();
    await reopen();
    assert.match(await read('#storage-notice'), /damaged/);
    await key('c');
    const current = await saved(value => value.cells[0] === 'C');
    assert.equal(await read('#storage-notice'), '');
    const second = await context.newPage();
    await second.goto(`chrome-extension://${popup.id}/popup.html`);
    await second.waitForFunction(() => document.querySelector('.letters').getAttribute('aria-busy') === 'false');
    // Opening a normal extension tab dismisses a native popup. Two tabs exercise the same controller and worker.
    const third = await context.newPage();
    await third.goto(`chrome-extension://${popup.id}/popup.html`);
    await third.waitForFunction(() => document.querySelector('.letters').getAttribute('aria-busy') === 'false');
    await second.locator('.top input').fill('O');
    await second.waitForFunction(async key => (await chrome.storage.local.get(key))[key].cells[1] === 'O', storageKey);
    await third.locator('.top input').fill('B');
    await third.waitForFunction(() => document.querySelector('#storage-notice').textContent.includes('Another popup'));
    await third.waitForFunction(() => document.querySelector('.letters').getAttribute('aria-busy') === 'false');
    assert.equal(await third.locator('.top input').inputValue(), 'O');
    await second.close();
    await third.close();
    await reopen();
    assert.deepEqual(await cells(), ['C','O','','','','','']);
    assert.notEqual((await data()).revision, current.revision);
    const start = performance.now();
    assert.equal((await readRequest()).status, 'ready');
    report.readRoundTripMs = performance.now() - start;
    const prior = await data();
    const measure = { ...prior, revision: '00000000-0000-4000-8000-000000000004:1' };
    const commitStart = performance.now();
    assert.equal((await rawSave(measure, prior.revision)).status, 'saved');
    report.commitRoundTripMs = performance.now() - commitStart;
    assert.equal((await rawSave(measure, prior.revision)).status, 'saved');
    assert.equal(await evaluate("chrome.runtime.sendMessage({type:'pangram:save',broken:true}).then(v=>v.status)"), 'invalid');
  });

  await check('outdated reveal IDs are pruned against the current dictionary', async () => {
    const record = await data();
    await rawStorage({ ...record, cells: [...'COATING'], mode: 'hints', revealedWords: ['coating', 'ggnitaoc'] });
    await returnToGame();
    await reopen();
    await saved(value => value.revealedWords.length === 1);
    assert.deepEqual(await names(), ['coating', ...masking(golden.slice(1))]);
    assert.equal(await read('#reveal-progress'), '1 of 7 revealed');
  });

  await check('browser storage read rejection and reset write rejection keep solving usable', async () => {
    await returnToGame();
    const failing = resolve(run, 'failing-storage');
    await cp(unpacked, failing, { recursive: true });
    const file = resolve(failing, 'background.js');
    const worker = await readFile(file, 'utf8');
    // Faults live in this disposable unpacked fixture only.
    assert.ok(worker.includes('createPersistence(extension.storage.local)'));
    const fixture = worker.replace('const persist = createPersistence(extension.storage.local);', `
      let firstRead = true;
      const persist = createPersistence({
        async get(key) {
          if (firstRead) {
            firstRead = false;
            throw new Error('QA read failure');
          }
          return extension.storage.local.get(key);
        },
        async set(items) {
          if (!Object.values(items)[0].cells.some(Boolean)) throw new Error('QA reset write failure');
          return extension.storage.local.set(items);
        },
      });
    `);
    await writeFile(file, fixture);
    await reopen(failing);
    assert.match(await read('#storage-notice'), /could not be loaded/);
    for (const letter of 'COATING') await key(letter);
    await waitFor(async () => (await names()).length === 7, 'read failure still solves');
    assert.deepEqual(await names(), masking(golden));
    assert.equal(await data(), undefined);

    await returnToGame();
    await reopen(failing);
    for (const letter of 'COATING') await key(letter);
    await saved(value => value.cells.join('') === 'COATING');
    await click('#reset');
    await waitFor(async () => (await read('#storage-notice')).startsWith('Reset could not be saved'), 'failed Reset shown');
    assert.deepEqual(await cells(), Array(7).fill(''));
    assert.equal((await data()).cells.join(''), 'COATING');
    await shot('13-storage-failure');
  });

  await check('missing dictionary is handled in a second unpacked extension', async () => {
    await popup.close().catch(() => {}); // Native popup normally closes when the CTA opens its tab.
    const broken = resolve(run, 'missing-dictionary');
    await cp(unpacked, broken, { recursive: true, filter: path => !path.endsWith('dictionary-data.js') });
    await reopen(broken);
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
    await reopen(delayed);
    await waitFor(() => evaluate("document.querySelector('#result-status')?.textContent.includes('Preparing')"), 'loading state');
    await ready();
    await waitFor(() => evaluate("typeof globalThis.qaReleaseDictionary === 'function'"), 'dictionary test gate');
    for (const letter of 'COATING') await key(letter);
    assert.equal(await read('#letter-count'), '7 of 7 letters');
    assert.deepEqual(await names(), []);
    await evaluate('globalThis.qaReleaseDictionary()');
    await waitFor(async () => (await names()).length === 7, 'automatic solve after dictionary readiness');
    assert.deepEqual(await names(), masking(golden));
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
