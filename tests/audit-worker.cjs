// Real service-worker lifecycle test. No user profile or live website is used.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    channel: process.env.CHROMIUM_PATH ? undefined : 'chromium',
    args: [`--disable-extensions-except=${path.join(root, 'src')}`, `--load-extension=${path.join(root, 'src')}`]
  });
  try {
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(() => ready);
    await context.route('https://**/*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Fixture</h1>' }));
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    const versions = new Map();
    session.on('ServiceWorker.workerVersionUpdated', event => {
      for (const version of event.versions) versions.set(version.versionId, version);
    });
    await session.send('ServiceWorker.enable');
    async function stopWorker() {
      await worker.evaluate(() => sessionStateQueue);
      const running = [...versions.values()].find(v => v.scriptURL === worker.url() && v.runningStatus === 'running');
      assert(running, 'A real running worker must be observed before stopping it');
      await session.send('ServiceWorker.stopWorker', { versionId: running.versionId });
    }
    async function settleAt(url) {
      await page.waitForURL(url);
      worker = context.serviceWorkers().find(w => w.url().endsWith('/background.js'));
      assert(worker, 'Worker restarted');
      await worker.evaluate(() => ready);
    }
    await page.goto('https://rating.pecheny.me/players/42');
    await stopWorker();
    await page.goto('https://rating.chgk.info/login').catch(() => {});
    await settleAt('https://rating.pecheny.me/login');
    console.log('PASS worker restart restores last mirror for info login');

    await worker.evaluate(async () => { await Settings.setPreferredTsHost('rating.pecheny.ru'); await updateRedirectRules(); });
    await page.goto('https://rating.pecheny.me/players/43');
    assert.equal(page.url(), 'https://rating.pecheny.me/players/43');
    await stopWorker();
    await page.goto('https://rating.pecheny.me/players/44');
    await settleAt('https://rating.pecheny.me/players/44');
    console.log('PASS worker restart preserves active login grace');

    await page.goto('https://rating.pecheny.me/logout');
    await worker.evaluate(() => sessionRuleQueue);
    await page.goto('https://rating.pecheny.me/players/45');
    assert.equal(page.url(), 'https://rating.pecheny.ru/players/45');
    console.log('PASS logout after restart resumes preferred redirect');
  } finally {
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
