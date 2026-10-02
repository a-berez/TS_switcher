/* global self, Sites */
'use strict';

const Settings = (function () {
    const STORAGE_KEY = 'tsSwitcherSettings';
    const FALLBACK_SESSION_KEY = 'loadFallbacks';
    const FALLBACK_TTL_MS = 5 * 60 * 1000;
    const WRITE_MESSAGE = 'TS_SWITCHER_SETTINGS_WRITE';
    let backgroundWriter = false;
    let writes = Promise.resolve();

    // A queue in each UI context cannot prevent cross-context storage races.
    // All read-modify-write operations are owned by the background instead.
    function initializeBackground() {
        if (backgroundWriter) return;
        backgroundWriter = true;
        getApi().runtime.onMessage.addListener(function (message, sender, sendResponse) {
            if (!message || message.type !== WRITE_MESSAGE) return;
            enqueueWrite(message.operation, message.payload).then(function (value) {
                sendResponse({ ok: true, value: value });
            }, function (error) {
                sendResponse({ ok: false, error: error.message });
            });
            return true;
        });
    }

    function enqueueWrite(operation, payload) {
        const result = writes.then(function () {
            if (operation === 'save') return saveLocal(payload);
            if (operation === 'setFallback') return setFallbackLocal(payload.tabId, payload.data);
            if (operation === 'clearFallback') return clearFallbackLocal(payload.tabId, payload.expectedTs);
            throw new Error('Unknown settings operation');
        });
        writes = result.catch(function () {});
        return result;
    }

    async function write(operation, payload) {
        if (backgroundWriter) return enqueueWrite(operation, payload);
        const response = await getApi().runtime.sendMessage({ type: WRITE_MESSAGE, operation, payload });
        if (!response || !response.ok) throw new Error(response && response.error || 'Settings could not be saved');
        return response.value;
    }

    function defaultHostMap(value) {
        const map = {};
        Sites.ALL_HOSTS.forEach(function (host) {
            map[host] = value;
        });
        return map;
    }

    function getDefaults() {
        return {
            preferredTsHost: 'off',
            tsColorScheme: 'auto',
            tsTheme: 'auto',
            tsContrast: 'auto',
            ratingColorScheme: 'auto',
            fallbackOnError: true,
            visibleSwitchHosts: defaultHostMap(true),
            visibleCopyHosts: defaultHostMap(true)
        };
    }

    function mergeDefaults(stored) {
        const defaults = getDefaults();
        if (!stored || typeof stored !== 'object') {
            return defaults;
        }
        const merged = Object.assign({}, defaults, stored);
        merged.visibleSwitchHosts = Object.assign({}, defaults.visibleSwitchHosts, stored.visibleSwitchHosts || {});
        merged.visibleCopyHosts = Object.assign({}, defaults.visibleCopyHosts, stored.visibleCopyHosts || {});
        if (merged.preferredTsHost !== 'off' && !Sites.isTsHost(merged.preferredTsHost)) {
            merged.preferredTsHost = 'off';
        }
        if (merged.preferredTsHost !== 'off' && merged.visibleSwitchHosts[merged.preferredTsHost] === false) {
            merged.preferredTsHost = 'off';
        }
        const themeValues = {
            tsColorScheme: ['auto', 'light', 'dark'],
            tsTheme: ['auto', 'classic', 'oldschool', 'catppuccin'],
            tsContrast: ['auto', 'normal', 'more'],
            ratingColorScheme: ['auto', 'light', 'dark']
        };
        Object.entries(themeValues).forEach(function ([key, values]) {
            if (!values.includes(merged[key])) merged[key] = 'auto';
        });
        return merged;
    }

    function getApi() {
        if (typeof browser !== 'undefined') return browser;
        return chrome;
    }

    async function load() {
        const api = getApi();
        const result = await api.storage.local.get(STORAGE_KEY);
        return mergeDefaults(result[STORAGE_KEY]);
    }

    async function saveLocal(partial) {
        const current = await load();
        const next = Object.assign({}, current, partial);
        if (partial && partial.visibleSwitchHosts) {
            next.visibleSwitchHosts = Object.assign({}, current.visibleSwitchHosts, partial.visibleSwitchHosts);
        }
        if (partial && partial.visibleCopyHosts) {
            next.visibleCopyHosts = Object.assign({}, current.visibleCopyHosts, partial.visibleCopyHosts);
        }
        const api = getApi();
        const normalized = mergeDefaults(next);
        await api.storage.local.set({ [STORAGE_KEY]: normalized });
        return normalized;
    }

    function save(partial) {
        return write('save', partial);
    }

    async function setPreferredTsHost(host) {
        return save({ preferredTsHost: host });
    }

    async function getFallbackForTab(tabId) {
        const api = getApi();
        const storage = api.storage.session || api.storage.local;
        const result = await storage.get(FALLBACK_SESSION_KEY);
        const fallbacks = result[FALLBACK_SESSION_KEY] || {};
        const entry = fallbacks[String(tabId)];
        if (!entry) return null;
        if (Date.now() - entry.ts > FALLBACK_TTL_MS) {
            await write('clearFallback', { tabId, expectedTs: entry.ts });
            return null;
        }
        return entry;
    }

    async function setFallbackLocal(tabId, data) {
        const api = getApi();
        const storage = api.storage.session || api.storage.local;
        const result = await storage.get(FALLBACK_SESSION_KEY);
        const fallbacks = result[FALLBACK_SESSION_KEY] || {};
        fallbacks[String(tabId)] = Object.assign({}, data, { ts: Date.now() });
        await storage.set({ [FALLBACK_SESSION_KEY]: fallbacks });
    }

    async function clearFallbackLocal(tabId, expectedTs) {
        const api = getApi();
        const storage = api.storage.session || api.storage.local;
        const result = await storage.get(FALLBACK_SESSION_KEY);
        const fallbacks = result[FALLBACK_SESSION_KEY] || {};
        if (!fallbacks[String(tabId)]) return;
        if (expectedTs != null && fallbacks[String(tabId)].ts !== expectedTs) return;
        delete fallbacks[String(tabId)];
        await storage.set({ [FALLBACK_SESSION_KEY]: fallbacks });
    }

    function setFallbackForTab(tabId, data) {
        return write('setFallback', { tabId, data });
    }

    function clearFallbackForTab(tabId) {
        return write('clearFallback', { tabId });
    }

    return {
        initializeBackground,
        STORAGE_KEY,
        FALLBACK_SESSION_KEY,
        FALLBACK_TTL_MS,
        getDefaults,
        load,
        save,
        setPreferredTsHost,
        getFallbackForTab,
        setFallbackForTab,
        clearFallbackForTab
    };
}());

if (typeof self !== 'undefined') {
    self.Settings = Settings;
}
if (typeof window !== 'undefined') {
    window.Settings = Settings;
}
