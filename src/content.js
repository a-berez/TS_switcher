// Remove one-shot query markers and expose the current page theme on demand.
// Actual preferred routing + bypass is done in background via DNR/session rules.

(function () {
    'use strict';

    var DIRECT_PARAM = 'ts_switcher_direct';

    try {
        var url = new URL(window.location.href);
        if (url.searchParams.get(DIRECT_PARAM) === '1') {
            url.searchParams.delete(DIRECT_PARAM);
            window.history.replaceState(window.history.state, document.title, url.toString());
        }
    } catch {
        // ignore
    }
}());


// No observers or connections are retained without an open extension UI connection.
(function () {
    'use strict';
    const host = window.location.hostname;
    if (window.top !== window || (!Sites.isTsHost(host) && host !== 'rating.chgk.gg')) return;
    const api = typeof browser !== 'undefined' ? browser : chrome;
    api.runtime.onConnect.addListener(function (port) {
        if (port.name !== Theme.PORT) return;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        let last = '', closed = false;
        function send() {
            if (closed) return;
            const state = Theme.readPage(host, document.documentElement, media.matches);
            const key = JSON.stringify(state);
            if (key === last) return;
            last = key;
            try { port.postMessage({type: 'theme', ...state}); } catch { cleanup(); }
        }
        const observer = new MutationObserver(send);
        function cleanup() {
            closed = true;
            observer.disconnect();
            media.removeEventListener('change', send);
        }
        port.onDisconnect.addListener(cleanup);
        if (Sites.isTsHost(host)) observer.observe(document.documentElement, {
            attributes: true, attributeFilter: ['data-site-theme', 'data-bs-theme', 'data-theme-pref', 'data-contrast']
        });
        media.addEventListener('change', send);
        send();
    });
})();
