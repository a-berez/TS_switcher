// Content script used only to remove one-shot query markers.
// Actual preferred routing + bypass is done in background via DNR/session rules.

(function () {
    'use strict';

    var DIRECT_PARAM = 'ts_switcher_direct';

    try {
        var url = new URL(window.location.href);
        if (url.searchParams.get(DIRECT_PARAM) === '1') {
            url.searchParams.delete(DIRECT_PARAM);
            window.history.replaceState({}, document.title, url.toString());
        }
    } catch {
        // ignore
    }
}());
