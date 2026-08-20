/* global self, Sites */
'use strict';

const Settings = (function () {
    const STORAGE_KEY = 'tsSwitcherSettings';
    const FALLBACK_SESSION_KEY = 'loadFallbacks';
    const FALLBACK_TTL_MS = 5 * 60 * 1000;

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

    async function save(partial) {
        const current = await load();
        const next = mergeDefaults(Object.assign({}, current, partial));
        if (partial && partial.visibleSwitchHosts) {
            next.visibleSwitchHosts = Object.assign({}, current.visibleSwitchHosts, partial.visibleSwitchHosts);
        }
        if (partial && partial.visibleCopyHosts) {
            next.visibleCopyHosts = Object.assign({}, current.visibleCopyHosts, partial.visibleCopyHosts);
        }
        const api = getApi();
        await api.storage.local.set({ [STORAGE_KEY]: next });
        return next;
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
            await clearFallbackForTab(tabId);
            return null;
        }
        return entry;
    }

    async function setFallbackForTab(tabId, data) {
        const api = getApi();
        const storage = api.storage.session || api.storage.local;
        const result = await storage.get(FALLBACK_SESSION_KEY);
        const fallbacks = result[FALLBACK_SESSION_KEY] || {};
        fallbacks[String(tabId)] = Object.assign({}, data, { ts: Date.now() });
        await storage.set({ [FALLBACK_SESSION_KEY]: fallbacks });
    }

    async function clearFallbackForTab(tabId) {
        const api = getApi();
        const storage = api.storage.session || api.storage.local;
        const result = await storage.get(FALLBACK_SESSION_KEY);
        const fallbacks = result[FALLBACK_SESSION_KEY] || {};
        delete fallbacks[String(tabId)];
        await storage.set({ [FALLBACK_SESSION_KEY]: fallbacks });
    }

    return {
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
