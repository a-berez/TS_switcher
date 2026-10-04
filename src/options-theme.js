/* Options follows a supported tab in its own window, using the shared theme controller. */
'use strict';
const OptionsTheme = (() => {
    const api = typeof browser !== 'undefined' ? browser : chrome;
    let settings = {}, sourceId = null, version = 0, stopped = false;
    function supported(tab) {
        try { return Sites.isSupportedHost(new URL(tab.url).hostname); } catch { return false; }
    }
    function fallback() {
        sourceId = null;
        PopupTheme.update({id: null, url: 'https://' + Sites.TS_HOSTS[0] + '/'}, settings);
    }
    async function refresh() {
        const request = ++version;
        try {
            const ownTab = api.tabs.getCurrent ? await api.tabs.getCurrent() : null;
            const windowId = ownTab && ownTab.windowId;
            const tabs = await api.tabs.query(windowId == null ? {currentWindow: true} : {windowId});
            if (request !== version || stopped) return;
            const candidates = tabs.filter(supported);
            const source = candidates.find(tab => tab.active) ||
                candidates.find(tab => tab.id === sourceId) ||
                candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0) || a.id - b.id)[0];
            if (source) {
                sourceId = source.id;
                PopupTheme.update(source, settings);
            } else fallback();
        } catch {
            if (request === version && !stopped) fallback();
        }
    }
    function update(nextSettings) { settings = nextSettings; return refresh(); }
    function activated() { refresh(); }
    function updated(tabId, change) {
        if (tabId === sourceId) PopupTheme.invalidate(tabId, change);
        if (change.url || change.status) refresh();
    }
    function removed() { refresh(); }
    if (api.tabs.onActivated) api.tabs.onActivated.addListener(activated);
    if (api.tabs.onUpdated) api.tabs.onUpdated.addListener(updated);
    if (api.tabs.onRemoved) api.tabs.onRemoved.addListener(removed);
    if (api.tabs.onAttached) api.tabs.onAttached.addListener(activated);
    window.addEventListener('pagehide', () => {
        stopped = true;
        version++;
        if (api.tabs.onActivated) api.tabs.onActivated.removeListener(activated);
        if (api.tabs.onUpdated) api.tabs.onUpdated.removeListener(updated);
        if (api.tabs.onRemoved) api.tabs.onRemoved.removeListener(removed);
        if (api.tabs.onAttached) api.tabs.onAttached.removeListener(activated);
        PopupTheme.clear();
    });
    return {update};
})();
