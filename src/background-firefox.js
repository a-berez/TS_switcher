// Background script for Firefox (Manifest V2)

const SUPPORTED_SITES = [
    'rating.chgk.info',
    'rating.pecheny.me',
    'rating.pecheny.kz'
];

const ICON_PATHS = {
    normal: {
        16: 'icons/icon16.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png'
    },
    disabled: {
        16: 'icons/icon16_disabled.png',
        48: 'icons/icon48_disabled.png',
        128: 'icons/icon128_disabled.png'
    }
};

async function setIcon(tabId, enabled) {
    try {
        const paths = enabled ? ICON_PATHS.normal : ICON_PATHS.disabled;
        if (browser.browserAction && browser.browserAction.setIcon) {
            await browser.browserAction.setIcon({ tabId, path: paths });
        } else if (browser.action && browser.action.setIcon) {
            await browser.action.setIcon({ tabId, path: paths });
        }
    } catch (error) {
        console.error('Error setting icon:', error);
    }
}

function isSupportedSite(url) {
    try {
        const urlObj = new URL(url);
        return SUPPORTED_SITES.includes(urlObj.hostname);
    } catch {
        return false;
    }
}

async function updateIcon(tabId) {
    try {
        const tab = await browser.tabs.get(tabId);
        if (tab && tab.url && tab.url.startsWith('http')) {
            const enabled = isSupportedSite(tab.url);
            await setIcon(tabId, enabled);
        }
    } catch (error) {
        console.error('Error updating icon:', error);
    }
}

browser.runtime.onInstalled.addListener(async (details) => {
    console.log(`TS_switcher ${details.reason}`);
    
    try {
        const tabs = await browser.tabs.query({});
        for (const tab of tabs) {
            if (tab.id !== undefined) {
                await updateIcon(tab.id);
            }
        }
    } catch (error) {
        console.error('Error updating icons on install:', error);
    }
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
    if (activeInfo && activeInfo.tabId !== undefined) {
        await updateIcon(activeInfo.tabId);
    }
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    try {
        if ((changeInfo.status === 'complete' || changeInfo.url) && tab && tab.url) {
            await updateIcon(tabId);
        }
    } catch (e) {
        // no-op
    }
});

