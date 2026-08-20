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
        console.error('Error setting icon:', error);
    }
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
        console.error('Error updating icon:', error);
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
                    urlFilter: '|https://' + host + '/',
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

bootstrap();
