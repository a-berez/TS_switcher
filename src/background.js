// Background service worker

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
        await chrome.action.setIcon({ tabId, path: paths });
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
    if (tabId === chrome.tabs.TAB_ID_NONE) {
        return;
    }
    
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.url && tab.url.startsWith('http')) {
            const enabled = isSupportedSite(tab.url);
            await setIcon(tabId, enabled);
        }
    } catch (error) {
        console.error('Error updating icon:', error);
    }
}

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`TS_switcher ${details.reason}`);
    
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            await updateIcon(tab.id);
        }
    } catch (error) {
        console.error('Error updating icons on install:', error);
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await updateIcon(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        await updateIcon(tabId);
    }
});
