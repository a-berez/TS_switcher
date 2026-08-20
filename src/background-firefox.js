// Background script for Firefox (Manifest V2)
// sites.js and settings.js are loaded via manifest background.scripts order

const ICON_PATHS = {
    normal: {
        16: 'icons/icon16.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png'
    },
    normal_rating: {
        16: 'icons/icon16_rating.png',
        48: 'icons/icon48_rating.png',
        128: 'icons/icon128_rating.png'
    },
    disabled: {
        16: 'icons/icon16_disabled.png',
        48: 'icons/icon48_disabled.png',
        128: 'icons/icon128_disabled.png'
    }
};

let cachedPreferred = 'off';
let cachedFallbackOnError = true;

const loginGraceTabs = new Set();
const bypassTabs = new Set();
const bypassTimeouts = new Map();

const TS_URL_PATTERNS = Sites.TS_HOSTS.map(function (h) {
    return '*://' + h + '/*';
});

function isLoginPath(pathname) {
    return pathname === '/login' || pathname.startsWith('/login/');
}

function isLogoutPath(pathname) {
    return pathname === '/logout' || pathname.startsWith('/logout/');
}

function isAuthPath(pathname) {
    return isLoginPath(pathname) || isLogoutPath(pathname);
}

function addBypassForTab(tabId, ttlMs) {
    if (tabId === undefined) return;
    bypassTabs.add(tabId);
    if (bypassTimeouts.has(tabId)) {
        clearTimeout(bypassTimeouts.get(tabId));
    }
    const timeoutId = setTimeout(function () {
        bypassTabs.delete(tabId);
        bypassTimeouts.delete(tabId);
    }, ttlMs);
    bypassTimeouts.set(tabId, timeoutId);
}

async function refreshCachedSettings() {
    const settings = await Settings.load();
    cachedPreferred = settings.preferredTsHost;
    cachedFallbackOnError = settings.fallbackOnError;
}

async function setIcon(tabId, enabled, isRatingSite) {
    return;
}

function isSupportedSite(url) {
    try {
        return Sites.isSupportedHost(new URL(url).hostname);
    } catch {
        return false;
    }
}

function isRatingSiteUrl(url) {
    try {
        return Sites.isRatingHost(new URL(url).hostname);
    } catch {
        return false;
    }
}

async function updateIcon(tabId) {
    try {
        const tab = await browser.tabs.get(tabId);
        if (tab && tab.url && tab.url.startsWith('http')) {
            await setIcon(tab.id, isSupportedSite(tab.url), isRatingSiteUrl(tab.url));
        }
    } catch (error) {
        console.error('Error updating icon:', error);
    }
}

function redirectTsRequest(details) {
    if (cachedPreferred === 'off') {
        return {};
    }
    try {
        const url = new URL(details.url);
        if (!Sites.isTsHost(url.hostname) || url.hostname === cachedPreferred) {
            return {};
        }
        // Never redirect auth endpoints.
        if (isAuthPath(url.pathname)) {
            return {};
        }
        // If the tab is in "login grace" or explicit bypass, keep its navigation intact.
        if (loginGraceTabs.has(details.tabId) || bypassTabs.has(details.tabId)) {
            return {};
        }
        url.hostname = cachedPreferred;
        return { redirectUrl: url.toString() };
    } catch {
        return {};
    }
}

async function handleLoadError(details) {
    if (details.frameId !== 0) {
        return;
    }
    let hostname;
    try {
        hostname = new URL(details.url).hostname;
    } catch {
        return;
    }
    if (!Sites.isTsHost(hostname)) {
        return;
    }
    if (cachedPreferred !== 'off' || !cachedFallbackOnError) {
        return;
    }

    const url = new URL(details.url);
    await Settings.setFallbackForTab(details.tabId, {
        failedHost: hostname,
        path: url.pathname + url.search + url.hash,
        url: details.url
    });
}

async function bootstrap() {
    await refreshCachedSettings();
    try {
        const tabs = await browser.tabs.query({});
        for (const tab of tabs) {
            if (tab.id !== undefined) {
                await updateIcon(tab.id);
            }
        }
    } catch (error) {
        console.error('Error updating icons on bootstrap:', error);
    }
}

browser.webRequest.onBeforeRequest.addListener(
    redirectTsRequest,
    { urls: TS_URL_PATTERNS, types: ['main_frame'] },
    ['blocking']
);

browser.runtime.onInstalled.addListener(function (details) {
    console.log('TS_switcher ' + details.reason);
    bootstrap();
});

browser.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes[Settings.STORAGE_KEY]) {
        refreshCachedSettings();
    }
});

browser.tabs.onActivated.addListener(function (activeInfo) {
    if (activeInfo && activeInfo.tabId !== undefined) {
        updateIcon(activeInfo.tabId);
    }
});

browser.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab && tab.url) {
        try {
            const hostname = new URL(tab.url).hostname;
            if (Sites.isTsHost(hostname)) {
                Settings.clearFallbackForTab(tabId);
            }
        } catch {
            // ignore
        }
    }
    if ((changeInfo.status === 'complete' || changeInfo.url) && tab && tab.url) {
        updateIcon(tabId);
    }
});

browser.webNavigation.onErrorOccurred.addListener(function (details) {
    handleLoadError(details);
});

browser.webNavigation.onCommitted.addListener(function (details) {
    if (details.frameId !== 0) return;
    if (details.tabId === undefined) return;

    let url;
    try {
        url = new URL(details.url);
    } catch {
        return;
    }
    if (!Sites.isTsHost(url.hostname)) return;

    if (isLoginPath(url.pathname)) {
        loginGraceTabs.add(details.tabId);
    } else if (isLogoutPath(url.pathname)) {
        loginGraceTabs.delete(details.tabId);
    }
});

browser.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== 'TS_SWITCHER_BYPASS') {
        return;
    }
    addBypassForTab(msg.tabId, msg.ttlMs || 8000);
    return Promise.resolve({ ok: true });
});

bootstrap();
