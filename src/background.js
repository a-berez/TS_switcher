// Background service worker (Chromium MV3)
importScripts('sites.js', 'settings.js');
Settings.initializeBackground();

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

const AUTH_ALLOW_RULE_ID = 98;
const DIRECT_BYPASS_RULE_ID = 99;
const DNR_RULE_BASE_ID = 100;
const A2_DNR_RULE_BASE_ID = 300;
const LOGIN_GRACE_RULE_BASE_ID = 20000;
const ORIGINAL_TS_HOST = Sites.TS_HOSTS[0];
const DIRECT_PARAM = 'ts_switcher_direct';
const LAST_TS_HOST_PREFIX = 'tsSwitcherLastHost:';
const tabStateStorage = chrome.storage.session || chrome.storage.local;

let cachedPreferred = 'off';
const lastTsHostByTab = new Map();
const navigationVersions = new Map();
let dynamicRuleQueue = Promise.resolve();
let sessionRuleQueue = Promise.resolve();
let sessionStateQueue = Promise.resolve();

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDirectBypassRule() {
    return {
        id: DIRECT_BYPASS_RULE_ID,
        priority: 10,
        action: { type: 'allow' },
        condition: {
            regexFilter: '^https://(' + Sites.TS_HOSTS.concat(Sites.A2_HOSTS).map(escapeRegex).join('|')
                + ')/[^?#]*\\?([^#]*&)?' + escapeRegex(DIRECT_PARAM) + '=1(&|#|$)',
            isUrlFilterCaseSensitive: true,
            resourceTypes: ['main_frame']
        }
    };
}

/** RE2 has no lookahead: auth endpoints use a separate higher-priority allow. */
function buildTsRedirectRegexFilter(host) {
    return '^https://' + escapeRegex(host) + '(/|$)';
}

function buildAuthAllowRule() {
    return {
        id: AUTH_ALLOW_RULE_ID,
        priority: 5,
        action: { type: 'allow' },
        condition: {
            regexFilter: '^https://(' + Sites.TS_HOSTS.map(escapeRegex).join('|')
                + ')/(login|logout)(/|\\?|#|$)',
            isUrlFilterCaseSensitive: true,
            resourceTypes: ['main_frame']
        }
    };
}

function isLoginPath(pathname) {
    return pathname === '/login' || pathname.startsWith('/login/');
}

function isLogoutPath(pathname) {
    return pathname === '/logout' || pathname.startsWith('/logout/');
}

function rememberTsHost(tabId, hostname, pathname) {
    if (tabId === undefined || tabId === chrome.tabs.TAB_ID_NONE) return;
    if (!Sites.isTsHost(hostname)) return;
    if (isLoginPath(pathname) || isLogoutPath(pathname)) return;
    if (lastTsHostByTab.get(tabId) === hostname) return;
    lastTsHostByTab.set(tabId, hostname);
    queueSessionState(function () {
        return tabStateStorage.set({ [LAST_TS_HOST_PREFIX + tabId]: hostname });
    });
}

function queueSessionState(operation) {
    sessionStateQueue = sessionStateQueue.then(operation).catch(function (error) {
        console.error('Error saving tab navigation state:', error);
    });
    return sessionStateQueue;
}

async function restoreTabState(tabs) {
    const stored = await tabStateStorage.get(null);
    const liveIds = new Set(tabs.map(function (tab) { return tab.id; }));
    const staleKeys = [];
    for (const key of Object.keys(stored)) {
        if (!key.startsWith(LAST_TS_HOST_PREFIX)) continue;
        const tabId = Number(key.slice(LAST_TS_HOST_PREFIX.length));
        if (!liveIds.has(tabId)) {
            staleKeys.push(key);
        } else if (!lastTsHostByTab.has(tabId) && Sites.isTsHost(stored[key])) {
            lastTsHostByTab.set(tabId, stored[key]);
        }
    }
    if (staleKeys.length) {
        await queueSessionState(function () { return tabStateStorage.remove(staleKeys); });
    }
    // Snapshot and replace within the same queue as login/logout events.
    const update = sessionRuleQueue.then(async function () {
        const existing = await chrome.declarativeNetRequest.getSessionRules();
        const addRules = existing.filter(function (rule) {
            return rule.id >= LOGIN_GRACE_RULE_BASE_ID
                && liveIds.has(rule.id - LOGIN_GRACE_RULE_BASE_ID);
        }).map(function (rule) {
            return { ...rule, action: { type: 'allow' },
                condition: { ...rule.condition, requestDomains: Sites.TS_HOSTS } };
        });
        await chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: existing.map(function (rule) { return rule.id; }), addRules: addRules
        });
    });
    sessionRuleQueue = update.catch(function (error) {
        console.error('Error restoring login exceptions:', error);
    });
    await sessionRuleQueue;
}

/** A: preferred; B: last non-auth TS host on this tab (not info). */
function resolveInfoLoginTarget(tabId) {
    if (cachedPreferred !== 'off') {
        if (cachedPreferred === ORIGINAL_TS_HOST) {
            return null;
        }
        return cachedPreferred;
    }
    const last = lastTsHostByTab.get(tabId);
    if (last && last !== ORIGINAL_TS_HOST) {
        return last;
    }
    return null;
}

function maybeRewriteInfoLogin(tabId, rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }
    if (url.hostname !== ORIGINAL_TS_HOST || !isLoginPath(url.pathname)) {
        return null;
    }
    if (url.searchParams.get(DIRECT_PARAM) === '1') {
        return null;
    }
    const target = resolveInfoLoginTarget(tabId);
    if (!target) {
        return null;
    }
    url.hostname = target;
    return url.toString();
}

function setLoginGrace(tabId, enabled) {
    if (!Number.isInteger(tabId) || tabId < 0) return Promise.resolve();
    const ruleId = LOGIN_GRACE_RULE_BASE_ID + tabId;
    const update = sessionRuleQueue.then(function () {
        return chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [ruleId],
            addRules: enabled ? [{
                id: ruleId,
                priority: 20,
                action: { type: 'allow' },
                condition: { tabIds: [tabId], requestDomains: Sites.TS_HOSTS, resourceTypes: ['main_frame'] }
            }] : []
        });
    });
    sessionRuleQueue = update.catch(function (error) {
        console.error('Error updating login exception:', error);
    });
    return sessionRuleQueue;
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

function updateRedirectRules() {
    const update = dynamicRuleQueue.then(applyRedirectRules);
    dynamicRuleQueue = update.catch(function (error) {
        console.error('Error updating redirect rules:', error);
    });
    return dynamicRuleQueue;
}

async function applyRedirectRules() {
    const settings = await Settings.load();
    const preferred = settings.preferredTsHost;
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map(function (rule) { return rule.id; });

    const addRules = [buildDirectBypassRule(), buildAuthAllowRule()];

    const groups = [
        { hosts: Sites.TS_HOSTS, target: preferred, base: DNR_RULE_BASE_ID },
        { hosts: Sites.A2_HOSTS, target: settings.preferredA2Host, base: A2_DNR_RULE_BASE_ID }
    ];
    for (const { hosts, target, base } of groups) {
        if (target === 'off') continue;
        hosts.filter(host => host !== target).forEach(function (host, index) {
            addRules.push({
                id: base + index,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: {
                        transform: {
                            scheme: 'https',
                            host: target
                        }
                    }
                },
                condition: {
                    regexFilter: buildTsRedirectRegexFilter(host),
                    resourceTypes: ['main_frame']
                }
            });
        });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: removeRuleIds,
        addRules: addRules
    });
    cachedPreferred = preferred;
}

async function handleLoadError(details) {
    if (details.frameId !== 0 || /(?:ERR_ABORTED|NS_BINDING_ABORTED)/.test(details.error || '')) {
        return;
    }
    const version = navigationVersions.get(details.tabId) || {};
    navigationVersions.set(details.tabId, version);
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
    if (navigationVersions.get(details.tabId) !== version
        || cachedPreferred !== 'off' || !settings.fallbackOnError) {
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
        await restoreTabState(tabs);
        for (const tab of tabs) {
            if (tab.id !== undefined && tab.url) {
                try {
                    const u = new URL(tab.url);
                    rememberTsHost(tab.id, u.hostname, u.pathname);
                    if (Sites.isTsHost(u.hostname) && isLoginPath(u.pathname) && !navigationVersions.has(tab.id)) {
                        await setLoginGrace(tab.id, true);
                    }
                } catch {
                    // ignore
                }
            }
            await updateIcon(tab.id);
        }
    } catch (error) {
        console.error('Error updating icons on bootstrap:', error);
    }
}

chrome.runtime.onInstalled.addListener(function (details) {
    console.log('TS_switcher ' + details.reason);
    updateRedirectRules();
});

chrome.runtime.onStartup.addListener(function () {
    updateRedirectRules();
});

chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes[Settings.STORAGE_KEY]) {
        updateRedirectRules();
    }
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
    updateIcon(activeInfo.tabId);
});

chrome.tabs.onRemoved.addListener(function (tabId) {
    lastTsHostByTab.delete(tabId);
    queueSessionState(function () { return tabStateStorage.remove(LAST_TS_HOST_PREFIX + tabId); });
    navigationVersions.delete(tabId);
    setLoginGrace(tabId, false);
    Settings.clearFallbackForTab(tabId);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if ((changeInfo.status === 'complete' || changeInfo.url) && tab && tab.url) {
        updateIcon(tabId);
    }
});

chrome.webNavigation.onErrorOccurred.addListener(function (details) {
    handleLoadError(details);
});

chrome.webNavigation.onBeforeNavigate.addListener(async function (details) {
    if (details.frameId !== 0) return;
    if (details.tabId === undefined) return;
    navigationVersions.set(details.tabId, {});

    let url;
    try {
        url = new URL(details.url);
    } catch {
        return;
    }

    rememberTsHost(details.tabId, url.hostname, url.pathname);
    // /logout can redirect before onCommitted ever sees that URL.
    if (Sites.isTsHost(url.hostname) && isLogoutPath(url.pathname)) {
        setLoginGrace(details.tabId, false);
    }

    const version = navigationVersions.get(details.tabId);
    await ready;
    if (navigationVersions.get(details.tabId) !== version) return;
    const rewritten = maybeRewriteInfoLogin(details.tabId, details.url);
    if (rewritten) {
        chrome.tabs.update(details.tabId, { url: rewritten }).catch(function () { });
    }
});

chrome.webNavigation.onCommitted.addListener(async function (details) {
    if (details.frameId !== 0) return;
    if (details.tabId === undefined) return;

    let url;
    try {
        url = new URL(details.url);
    } catch {
        return;
    }
    if (!Sites.isTsHost(url.hostname)) return;

    rememberTsHost(details.tabId, url.hostname, url.pathname);

    if (isLoginPath(url.pathname)) {
        setLoginGrace(details.tabId, true).catch(function () { });
        // HTTP redirects do not emit another onBeforeNavigate for their target.
        // Wait for restored settings/state, then confirm this is still the current
        // document so a delayed handler cannot replace the user's next navigation.
        if (url.hostname === ORIGINAL_TS_HOST && url.searchParams.get(DIRECT_PARAM) !== '1') {
            await ready;
            const rewritten = maybeRewriteInfoLogin(details.tabId, details.url);
            if (rewritten) {
                try {
                    const tab = await chrome.tabs.get(details.tabId);
                    if (tab.url === details.url && (!tab.pendingUrl || tab.pendingUrl === details.url)) {
                        await chrome.tabs.update(details.tabId, { url: rewritten });
                    }
                } catch (error) {
                    if (!isMissingTabError(error)) console.error('Error returning to mirror login:', error);
                }
            }
        }
    } else if (isLogoutPath(url.pathname)) {
        setLoginGrace(details.tabId, false).catch(function () { });
    }
});

chrome.webNavigation.onCompleted.addListener(function (details) {
    if (details.frameId !== 0) return;
    navigationVersions.set(details.tabId, {});
    // Unlike tabs.onUpdated complete, this event excludes browser error pages.
    Settings.clearFallbackForTab(details.tabId);
});

const ready = bootstrap();
