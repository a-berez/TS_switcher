// Behavioral regression checks with a mocked WebExtension API; browser checks run separately.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const tick = () => new Promise(resolve => setImmediate(resolve));
function event() {
    const listeners = [];
    return { addListener(fn) { listeners.push(fn); }, fire(...args) { return listeners.map(fn => fn(...args)); } };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function boot(kind, options = {}) {
    const rules = new Map(options.rules || []), dynamic = new Map(), fallbacks = new Map(), errors = [], updates = [];
    const state = options.state || {};
    const settings = { preferredTsHost: options.preferred || 'off', preferredA2Host: options.preferredA2 || 'off', fallbackOnError: true };
    let loadGate = options.gate, dynamicGate, dynamicActive = 0, maxDynamicActive = 0;
    const storage = { async get() { return { ...state }; }, async set(patch) { Object.assign(state, patch); }, async remove(keys) { for (const key of [keys].flat()) delete state[key]; } };
    const api = {
        runtime: { onInstalled: event(), onStartup: event(), onMessage: event() },
        storage: { onChanged: event(), session: storage, local: storage },
        tabs: { TAB_ID_NONE: -1, onActivated: event(), onRemoved: event(), onUpdated: event(), async query() { return options.tabs || []; }, async get(id) { return { id, url: options.currentUrl || 'https://example.org/', pendingUrl: options.pendingUrl }; }, async update(id, data) { updates.push({ id, ...data }); } },
        action: { async setIcon() {} }, webRequest: { onBeforeRequest: event() },
        webNavigation: { onErrorOccurred: event(), onBeforeNavigate: event(), onCommitted: event(), onCompleted: event() },
        declarativeNetRequest: {
            async getDynamicRules() { return [...dynamic.values()]; }, async getSessionRules() { return [...rules.values()]; },
            async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
                dynamicActive++; maxDynamicActive = Math.max(maxDynamicActive, dynamicActive);
                if (dynamicGate) await dynamicGate;
                try { replace(dynamic, removeRuleIds, addRules); } finally { dynamicActive--; }
            },
            async updateSessionRules({ removeRuleIds = [], addRules = [] }) { replace(rules, removeRuleIds, addRules); }
        }
    };
    function replace(map, remove, add) {
        const next = new Map(map);
        for (const id of remove) next.delete(id);
        for (const rule of add) { assert(!next.has(rule.id), 'Duplicate rule ID'); next.set(rule.id, rule); }
        map.clear(); for (const [id, rule] of next) map.set(id, rule);
    }
    const context = vm.createContext({ URL, Map, Set, Promise, console: { log() {}, error(...args) { errors.push(args); } }, chrome: api, browser: kind === 'firefox' ? api : undefined, importScripts() {},
        Settings: { STORAGE_KEY: 'tsSwitcherSettings', initializeBackground() {}, async load() { if (loadGate) await loadGate; return { ...settings }; }, async setFallbackForTab(id, data) { fallbacks.set(id, data); }, async clearFallbackForTab(id) { fallbacks.delete(id); } }
    });
    for (const file of ['sites.js', kind === 'firefox' ? 'background-firefox.js' : 'background.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
    await tick();
    return { api, rules, dynamic, fallbacks, errors, state, settings, updates,
        eval: code => vm.runInContext(code, context), setLoadGate(gate) { loadGate = gate; }, setDynamicGate(gate) { dynamicGate = gate; }, maxDynamicActive: () => maxDynamicActive,
        async request(url, tabId = 7) { return await api.webRequest.onBeforeRequest.fire({ tabId, frameId: 0, url })[0]; }
    };
}
const detail = (url, extra = {}) => ({ tabId: 7, frameId: 0, url, ...extra });
const mirror = 'https://rating.pecheny.me';
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS:', name); }
(async () => {
    await test('Firefox redirects, preserves query/hash, respects auth and exact bypass', async () => {
        const b = await boot('firefox', { preferred: 'rating.pecheny.ru' });
        assert.equal((await b.request(mirror + '/player/42?x=1#team')).redirectUrl, 'https://rating.pecheny.ru/player/42?x=1#team');
        for (const suffix of ['/login', '/login/start?a=1', '/logout', '/player/42?ts_switcher_direct=1']) assert.equal((await b.request(mirror + suffix)).redirectUrl, undefined);
        assert.equal((await b.request(mirror + '/?ts_switcher_direct=10')).redirectUrl, 'https://rating.pecheny.ru/?ts_switcher_direct=10');
    });
    for (const kind of ['chromium', 'firefox']) {
        await test(kind + ': logout HTTP redirect removes grace before final commit', async () => {
            const b = await boot(kind, { preferred: 'rating.pecheny.ru' });
            b.api.webNavigation.onCommitted.fire(detail(mirror + '/login')); await tick();
            b.api.webNavigation.onCommitted.fire(detail(mirror + '/login')); await tick();
            assert(kind === 'chromium' ? b.rules.has(20007) : b.eval('loginGraceTabs.has(7)'));
            await Promise.all(b.api.webNavigation.onBeforeNavigate.fire(detail(mirror + '/logout')));
            if (kind === 'firefox') await b.request(mirror + '/logout');
            await tick();
            assert.equal(kind === 'chromium' ? b.rules.has(20007) : b.eval('loginGraceTabs.has(7)'), false);
            b.api.webNavigation.onCommitted.fire(detail(mirror + '/')); await tick();
            assert.equal(kind === 'chromium' ? b.rules.has(20007) : b.eval('loginGraceTabs.has(7)'), false);
            assert.deepEqual(b.errors, []);
        });
        await test(kind + ': canceled navigation is not a site failure', async () => {
            const b = await boot(kind);
            for (const error of ['net::ERR_ABORTED', 'NS_BINDING_ABORTED']) b.api.webNavigation.onErrorOccurred.fire(detail(mirror + '/player/42', { error }));
            await tick(); assert.equal(b.fallbacks.size, 0);
        });
        await test(kind + ': DNS failure survives error-page complete and clears on success', async () => {
            const b = await boot(kind), d = detail(mirror + '/players/42?a=1#row', { error: 'net::ERR_NAME_NOT_RESOLVED' });
            b.api.webNavigation.onErrorOccurred.fire(d); await tick();
            assert.equal(b.fallbacks.get(7).path, '/players/42?a=1#row');
            b.api.tabs.onUpdated.fire(7, { status: 'complete' }, { id: 7, url: d.url }); await tick(); assert(b.fallbacks.has(7));
            b.api.webNavigation.onCompleted.fire({ ...d, frameId: 1 }); await tick(); assert(b.fallbacks.has(7));
            b.api.webNavigation.onCompleted.fire(d); await tick(); assert.equal(b.fallbacks.size, 0);
        });
        await test(kind + ': close removes fallback and login exception', async () => {
            const b = await boot(kind);
            b.api.webNavigation.onCommitted.fire(detail(mirror + '/login')); b.fallbacks.set(7, {}); await tick();
            b.api.tabs.onRemoved.fire(7); await tick();
            assert.equal(b.rules.size, 0); assert.equal(b.fallbacks.size, 0);
            if (kind === 'firefox') assert.equal(b.eval('loginGraceTabs.has(7)'), false);
        });
        await test(kind + ': bootstrap restores grace on existing login page', async () => {
            const b = await boot(kind, { preferred: 'rating.pecheny.ru', tabs: [{ id: 7, url: mirror + '/login' }] });
            assert(kind === 'chromium' ? b.rules.has(20007) : b.eval('loginGraceTabs.has(7)'));
        });
    }
    await test('Firefox request waits for initial settings and tab state', async () => {
        const gate = deferred(), b = await boot('firefox', { preferred: 'rating.pecheny.ru', gate: gate.promise });
        let completed = false;
        const pending = b.request(mirror + '/player/42').then(result => { completed = true; return result; });
        await tick(); assert.equal(completed, false); gate.resolve();
        assert.equal((await pending).redirectUrl, 'https://rating.pecheny.ru/player/42');
    });
    await test('Firefox changes settings before deciding next request', async () => {
        const b = await boot('firefox'); b.settings.preferredTsHost = 'rating.pecheny.ru';
        b.api.storage.onChanged.fire({ tsSwitcherSettings: {} }, 'local');
        assert.equal((await b.request(mirror + '/')).redirectUrl, 'https://rating.pecheny.ru/');
    });
    await test('Chromium bypass is query-only, exact, case-sensitive and TS-scoped', async () => {
        const b = await boot('chromium'), regex = new RegExp(b.dynamic.get(99).condition.regexFilter);
        for (const query of ['?ts_switcher_direct=1', '?x=2&ts_switcher_direct=1&y=3', '?ts_switcher_direct=1#row']) assert(regex.test(mirror + '/' + query), query);
        for (const query of ['?ts_switcher_direct=10', '?ts_switcher_direct=1x', '?TS_SWITCHER_DIRECT=1', '#row?ts_switcher_direct=1', '?x=1#&ts_switcher_direct=1', '/ts_switcher_direct=1']) assert.equal(regex.test(mirror + '/' + query), false, query);
        assert.equal(regex.test('https://example.org/?ts_switcher_direct=1'), false);
        assert.equal(b.dynamic.get(99).condition.isUrlFilterCaseSensitive, true);
    });
    await test('Chromium auth allow and broad redirect filters match the intended endpoints', async () => {
        const b = await boot('chromium', { preferred: 'rating.pecheny.ru' }), auth = new RegExp(b.dynamic.get(98).condition.regexFilter);
        assert.equal([...b.dynamic.values()].filter(rule => rule.action.type === 'redirect').length, 3);
        for (const suffix of ['/login', '/login/x', '/login?next=1', '/logout#row']) assert(auth.test(mirror + suffix));
        for (const suffix of ['/loginOther', '/logoutOther', '/LOGIN', '/players/42']) assert.equal(auth.test(mirror + suffix), false);
        for (const rule of b.dynamic.values()) assert(!rule.condition.regexFilter.includes('(?!'), 'No RE2 lookahead');
    });
    await test('Chromium dynamic changes are serialized and finish on the newest preference', async () => {
        const b = await boot('chromium'), gate = deferred(); b.setDynamicGate(gate.promise);
        b.settings.preferredTsHost = 'rating.pecheny.me'; b.api.storage.onChanged.fire({ tsSwitcherSettings: {} }, 'local'); await tick();
        b.settings.preferredTsHost = 'rating.pecheny.ru'; b.api.storage.onChanged.fire({ tsSwitcherSettings: {} }, 'local'); await tick();
        assert.equal(b.maxDynamicActive(), 1); gate.resolve(); await tick();
        for (const rule of b.dynamic.values()) if (rule.action.type === 'redirect') assert.equal(rule.action.redirect.transform.host, 'rating.pecheny.ru');
        assert.deepEqual(b.errors, []);
    });
    await test('Chromium delayed load error cannot resurrect fallback after success or tab close', async () => {
        for (const end of ['success', 'close']) {
            const b = await boot('chromium'), gate = deferred(); b.setLoadGate(gate.promise);
            b.api.webNavigation.onErrorOccurred.fire(detail(mirror + '/', { error: 'net::ERR_NAME_NOT_RESOLVED' }));
            if (end === 'success') b.api.webNavigation.onCompleted.fire(detail(mirror + '/')); else b.api.tabs.onRemoved.fire(7);
            gate.resolve(); await tick(); assert.equal(b.fallbacks.size, 0);
        }
    });
    await test('Chromium worker restores previous mirror for info login and clears closed tab state', async () => {
        const state = { 'tsSwitcherLastHost:7': 'rating.pecheny.me', 'tsSwitcherLastHost:8': 'rating.pecheny.kz' };
        const b = await boot('chromium', { state, tabs: [{ id: 7, url: 'https://rating.chgk.info/login' }] });
        await Promise.all(b.api.webNavigation.onBeforeNavigate.fire(detail('https://rating.chgk.info/login')));
        assert.equal(b.updates[0].url, mirror + '/login'); assert.equal(state['tsSwitcherLastHost:8'], undefined);
        b.api.tabs.onRemoved.fire(7); await tick(); assert.equal(state['tsSwitcherLastHost:7'], undefined);
    });
    await test('Chromium rewrites committed HTTP info login bounce to last mirror or preferred', async () => {
        const info = 'https://rating.chgk.info/login?next=%2Fplayers%2F42';
        for (const preferred of ['off', 'rating.pecheny.ru']) {
            const b = await boot('chromium', { preferred, currentUrl: info });
            await Promise.all(b.api.webNavigation.onBeforeNavigate.fire(detail(mirror + '/bounce-login')));
            await Promise.all(b.api.webNavigation.onCommitted.fire(detail(info)));
            assert.equal(b.updates.at(-1).url, info.replace('rating.chgk.info', preferred === 'off' ? 'rating.pecheny.me' : preferred));
        }
    });
    await test('Chromium committed login honors direct bypass and does not replace a newer navigation', async () => {
        const info = 'https://rating.chgk.info/login';
        for (const options of [{ currentUrl: info + '?ts_switcher_direct=1' }, { currentUrl: 'https://example.org/' }, { currentUrl: info, pendingUrl: 'https://example.org/' }]) {
            const b = await boot('chromium', { preferred: 'rating.pecheny.ru', ...options });
            await Promise.all(b.api.webNavigation.onCommitted.fire(detail(options.currentUrl.includes('ts_switcher_direct') ? options.currentUrl : info)));
            assert.equal(b.updates.length, 0);
        }
    });
    await test('Chromium cleans old bypass/closed-tab rules and upgrades live grace', async () => {
        const old = id => ({ id, priority: 20, action: { type: 'allowAllRequests' }, condition: { tabIds: [id - 20000], resourceTypes: ['main_frame'] } });
        const b = await boot('chromium', { tabs: [{ id: 7, url: mirror + '/players/42' }], rules: [[20007, old(20007)], [20008, old(20008)], [10001, old(10001)]] });
        assert.equal(b.rules.size, 1); assert.equal(b.rules.get(20007).action.type, 'allow');
    });
    await test('Firefox A2 preference is independent, preserves routes and honors bypass during TS login grace', async () => {
        const b = await boot('firefox', { preferred: 'rating.pecheny.ru', preferredA2: 'a2.pecheny.kz' });
        b.api.webNavigation.onCommitted.fire(detail(mirror + '/login')); await tick();
        for (const host of ['a2.pecheny.me', 'a2.pecheny.ru']) {
            assert.equal((await b.request('https://' + host + '/releases/561/?x=1#team')).redirectUrl, 'https://a2.pecheny.kz/releases/561/?x=1#team');
            assert.equal((await b.request('https://' + host + '/?ts_switcher_direct=1')).redirectUrl, undefined);
            assert.equal((await b.request('https://' + host + '/?ts_switcher_direct=10')).redirectUrl, 'https://a2.pecheny.kz/?ts_switcher_direct=10');
        }
        assert.equal((await b.request('https://a2.pecheny.kz/')).redirectUrl, undefined);
        b.settings.preferredA2Host = 'off'; b.api.storage.onChanged.fire({ tsSwitcherSettings: {} }, 'local');
        assert.equal((await b.request('https://a2.pecheny.me/')).redirectUrl, undefined);
        b.settings.preferredA2Host = 'a2.pecheny.ru'; b.settings.preferredTsHost = 'off';
        b.api.storage.onChanged.fire({ tsSwitcherSettings: {} }, 'local');
        assert.equal((await b.request('https://a2.pecheny.me/')).redirectUrl, 'https://a2.pecheny.ru/');
        assert.equal((await b.request('https://rating.chgk.gg/')).redirectUrl, undefined);
        assert.deepEqual(b.errors, []);
    });
    await test('Chromium A2 rules coexist with TS and survive TS login grace, including restored old rules', async () => {
        const old = { id: 20007, priority: 20, action: { type: 'allow' }, condition: { tabIds: [7], resourceTypes: ['main_frame'] } };
        const b = await boot('chromium', { preferred: 'rating.pecheny.ru', preferredA2: 'a2.pecheny.kz', tabs: [{ id: 7, url: mirror + '/players/42' }], rules: [[20007, old]] });
        assert.deepEqual(Array.from(b.rules.get(20007).condition.requestDomains), Array.from(b.eval('Sites.TS_HOSTS')));
        b.api.webNavigation.onCommitted.fire(detail(mirror + '/login')); await tick();
        assert.deepEqual(Array.from(b.rules.get(20007).condition.requestDomains), Array.from(b.eval('Sites.TS_HOSTS')));
        assert.equal([...b.dynamic.values()].filter(r => r.action.type === 'redirect').length, 5);
        const a2Rules = [...b.dynamic.values()].filter(r => r.id >= 300);
        assert.equal(a2Rules.length, 2);
        for (const host of ['a2.pecheny.me', 'a2.pecheny.ru']) {
            const url = 'https://' + host + '/releases/561/?x=1#row';
            const rule = a2Rules.find(r => new RegExp(r.condition.regexFilter).test(url));
            assert.equal(rule.action.redirect.transform.host, 'a2.pecheny.kz');
            assert(new RegExp(b.dynamic.get(99).condition.regexFilter).test('https://' + host + '/?ts_switcher_direct=1'));
            assert.equal(new RegExp(b.dynamic.get(98).condition.regexFilter).test('https://' + host + '/login'), false);
        }
        b.settings.preferredTsHost = 'off'; b.api.storage.onChanged.fire({ tsSwitcherSettings: {} }, 'local'); await tick();
        assert.equal([...b.dynamic.values()].filter(r => r.action.type === 'redirect').length, 2);
        b.settings.preferredA2Host = 'off'; b.api.storage.onChanged.fire({ tsSwitcherSettings: {} }, 'local'); await tick();
        assert.equal([...b.dynamic.values()].filter(r => r.action.type === 'redirect').length, 0);
        assert.deepEqual(b.errors, []);
    });
    console.log(count + ' background regression scenarios passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
