// Content script for rating sites

(function() {
    'use strict';
    
    const hostname = window.location.hostname;
    const supportedSites = [
        'rating.chgk.info',
        'rating.pecheny.me',
        'rating.pecheny.kz',
        'rating.chgk.gg'
    ];
    
    if (!supportedSites.includes(hostname)) {
        return;
    }
    
    console.log('TS_switcher active on', hostname);
})();
