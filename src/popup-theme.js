/* global Theme, Sites */
'use strict';
const PopupTheme = (() => {
    const themeApi = typeof browser !== 'undefined' ? browser : chrome;
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    let tab = null, settings = {}, page = null, port = null, generation = 0;
    let loading = false;
    function apply() {
        const resolved = Theme.resolve(tab ? new URL(tab.url).hostname : '', settings, page,
            {dark: dark.matches});
        const root = document.documentElement;
        root.dataset.themeGroup = resolved.group;
        root.dataset.siteTheme = resolved.family;
        root.dataset.bsTheme = resolved.scheme;
        root.dataset.contrast = resolved.contrast;
        // Rating pages do not provide TS preferences; use the TS settings and
        // their normal fallback independently from the surrounding rating UI.
        const copyTs = resolved.group === 'ts' ? resolved :
            Theme.resolve(Sites.TS_HOSTS[0], settings, null, {dark: dark.matches});
        root.dataset.copyTsTheme = copyTs.family;
        root.dataset.copyTsScheme = copyTs.scheme;
        root.dataset.copyTsContrast = copyTs.contrast;
    }
    function disconnect() {
        generation++;
        if (port) { const previous = port; port = null; previous.disconnect(); }
        page = null;
    }
    function connect() {
        if (!tab || tab.id == null || loading || port) return;
        const host = new URL(tab.url).hostname;
        if (!Sites.isTsHost(host) && host !== 'rating.chgk.gg') return;
        const ownGeneration = generation;
        let connection;
        try {
            connection = themeApi.tabs.connect(tab.id, {name: Theme.PORT, frameId: 0});
            port = connection;
            connection.onMessage.addListener(message => {
                if (generation !== ownGeneration || port !== connection || !message || message.type !== 'theme') return;
                page = {family: message.family, scheme: message.scheme, contrast: message.contrast};
                apply();
            });
            connection.onDisconnect.addListener(() => {
                // Reading lastError also consumes the normal "no content script" error.
                void themeApi.runtime.lastError;
                if (generation !== ownGeneration || port !== connection) return;
                port = null;
                page = null;
                apply();
            });
        } catch {
            port = null;
            page = null;
            apply();
        }
    }
    function update(nextTab, nextSettings) {
        settings = nextSettings;
        const changed = !tab || tab.id !== nextTab.id || tab.url !== nextTab.url;
        if (changed) {
            disconnect();
            tab = {id: nextTab.id, url: nextTab.url};
        }
        loading = nextTab.status === 'loading';
        apply();
        connect();
    }
    function invalidate(tabId, change) {
        if (!tab || tabId !== tab.id) return;
        if (change.status === 'loading' || change.url) {
            disconnect();
            loading = true;
            apply();
        }
    }
    function clear() { disconnect(); tab = null; apply(); }
    dark.addEventListener('change', apply);
    window.addEventListener('pagehide', clear);
    apply();
    return {update, invalidate, clear};
})();
