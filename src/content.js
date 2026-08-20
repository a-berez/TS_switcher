// Content script for rating sites

(function () {
    'use strict';

    var supportedSites = [
        'rating.chgk.info',
        'rating.pecheny.me',
        'rating.pecheny.kz',
        'rating.pecheny.ru',
        'rating.chgk.gg',
        'rating.chgk.fun',
        'chgk.quest'
    ];

    if (supportedSites.indexOf(window.location.hostname) < 0) {
        return;
    }

    console.log('TS_switcher active on', window.location.hostname);
}());
