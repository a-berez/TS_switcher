// Background service worker (Chromium MV3)
importScripts('sites.js', 'settings.js');

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

const DNR_RULE_BASE_ID = 100;
const BYPASS_RULE_BASE_ID = 10000;
const LOGIN_GRACE_RULE_BASE_ID = 20000;

let bypassRuleCounter = 0;

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLoginPath(pathname) {
    return pathname === '/login' || pathname.startsWith('/login/');
}

function isLogoutPath(pathname) {
    return pathname === '/logout' || pathname.startsWith('/logout/');
}

async function addBypassForTab(tabId, ttlMs) {
    if (!tabId && tabId !== 0) return;
    const ruleId = BYPASS_RULE_BASE_ID + (++bypassRuleCounter);
    await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [
            {
                id: ruleId,
                priority: 10,
                action: { type: 'allowAllRequests' },
                condition: { tabIds: [tabId], resourceTypes: ['main_frame'] }
            }
        ]
    });
    if (ttlMs && ttlMs > 0) {
        setTimeout(function () {
            chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] }).catch(function () { });
        }, ttlMs);
    }
}

async function setLoginGrace(tabId, enabled) {
    const ruleId = LOGIN_GRACE_RULE_BASE_ID + tabId;
    if (enabled) {
        await chrome.declarativeNetRequest.updateSessionRules({
            addRules: [
                {
                    id: ruleId,
                    priority: 20,
                    action: { type: 'allowAllRequests' },
                    condition: { tabIds: [tabId], resourceTypes: ['main_frame'] }
                }
            ]
        });
    } else {
        await chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [ruleId]
        });
    }
}

async function setIcon(tabId, enabled, isRatingSite) {
    try {
        let paths;
        if (!enabled) {
            paths = ICON_PATHS.disabled;
        } else if (isRatingSite) {
            paths = ICON_PATHS.normal_rating;
        } else {
            paths = ICON_PATHS.normal;
        }
        await chrome.action.setIcon({ tabId: tabId, path: paths });
    } catch (error) {
        if (!isMissingTabError(error)) {
            console.error('Error setting icon:', error);
        }
    }
}

function isMissingTabError(error) {
    const msg = (error && error.message) ? error.message : String(error || '');
    return /no tab with id/i.test(msg);
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
    if (tabId === chrome.tabs.TAB_ID_NONE) {
        return;
    }
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.url && tab.url.startsWith('http')) {
            await setIcon(tabId, isSupportedSite(tab.url), isRatingSiteUrl(tab.url));
        }
    } catch (error) {
        if (!isMissingTabError(error)) {
            console.error('Error updating icon:', error);
        }
    }
}

async function updateRedirectRules() {
    try {
        const settings = await Settings.load();
        const preferred = settings.preferredTsHost;
        const existing = await chrome.declarativeNetRequest.getDynamicRules();
        const removeRuleIds = existing.map(function (rule) { return rule.id; });

        if (preferred === 'off') {
            if (removeRuleIds.length) {
                await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeRuleIds });
            }
            return;
        }

        const otherHosts = Sites.TS_HOSTS.filter(function (h) { return h !== preferred; });
        const addRules = otherHosts.map(function (host, index) {
            const escapedHost = escapeRegex(host);
            // Exclude /login and /logout from redirecting. This fixes "mirror login opens original login".
            const regexFilter = '^https://' + escapedHost + '(?:/|$)(?:$|\\?.*|#.*|player/\\d+|players/\\d+|tournament/\\d+|teams/\\d+).*';
            return {
                id: DNR_RULE_BASE_ID + index,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: {
                        transform: {
                            scheme: 'https',
                            host: preferred
                        }
                    }
                },
                condition: {
                    regexFilter: regexFilter,
                    resourceTypes: ['main_frame']
                }
            };
        });

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: removeRuleIds,
            addRules: addRules
        });
    } catch (error) {
        console.error('Error updating redirect rules:', error);
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

    const settings = await Settings.load();
    if (settings.preferredTsHost !== 'off' || !settings.fallbackOnError) {
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
    await updateRedirectRules();
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            await updateIcon(tab.id);
        }
    } catch (error) {
        console.error('Error updating icons on bootstrap:', error);
    }
}

chrome.runtime.onInstalled.addListener(function (details) {
    console.log('TS_switcher ' + details.reason);
    bootstrap();
});

chrome.runtime.onStartup.addListener(function () {
    bootstrap();
});

chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes[Settings.STORAGE_KEY]) {
        updateRedirectRules();
    }
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
    updateIcon(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
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

chrome.webNavigation.onErrorOccurred.addListener(function (details) {
    handleLoadError(details);
});

chrome.webNavigation.onCommitted.addListener(function (details) {
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
        setLoginGrace(details.tabId, true).catch(function () { });
    } else if (isLogoutPath(url.pathname)) {
        setLoginGrace(details.tabId, false).catch(function () { });
    }
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== 'TS_SWITCHER_BYPASS') {
        return;
    }
    const tabId = msg.tabId;
    const ttlMs = msg.ttlMs || 8000;
    addBypassForTab(tabId, ttlMs).then(function () {
        sendResponse && sendResponse({ ok: true });
    }).catch(function () {
        sendResponse && sendResponse({ ok: false });
    });
    return true; // keep the message channel open for sendResponse
});

bootstrap();
