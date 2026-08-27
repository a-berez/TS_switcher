'use strict';

const api = (typeof browser !== 'undefined') ? browser : chrome;

let currentHost = '';
let currentPath = '';
let currentTabId = null;
let settings = null;
let lastSwitchKey = '';
let lastCopyKey = '';
let lastFallbackKey = '';
let refreshInFlight = false;
let refreshQueued = false;

document.addEventListener('DOMContentLoaded', async function () {
    settings = await Settings.load();
    buildPreferredSelect();
    document.getElementById('open-options').addEventListener('click', openOptions);
    document.getElementById('preferred-select').addEventListener('change', onPreferredChange);
    bindLiveUpdates();
    await refreshPopup();
});

function openOptions(e) {
    e.preventDefault();
    if (api.runtime.openOptionsPage) {
        api.runtime.openOptionsPage();
    }
}

function bindLiveUpdates() {
    if (api.tabs && api.tabs.onUpdated) {
        api.tabs.onUpdated.addListener(function (tabId, changeInfo) {
            if (currentTabId != null && tabId !== currentTabId) return;
            if (changeInfo.url || changeInfo.status === 'complete' || changeInfo.status === 'loading') {
                queueRefresh();
            }
        });
    }
    if (api.tabs && api.tabs.onActivated) {
        api.tabs.onActivated.addListener(function () {
            queueRefresh();
        });
    }
    if (api.storage && api.storage.onChanged) {
        api.storage.onChanged.addListener(function (changes, area) {
            if (area !== 'local' && area !== 'session') return;
            if (changes[Settings.STORAGE_KEY] || changes[Settings.FALLBACK_SESSION_KEY]) {
                queueRefresh();
            }
        });
    }
}

function queueRefresh() {
    if (refreshInFlight) {
        refreshQueued = true;
        return;
    }
    refreshPopup();
}

function buildPreferredSelect() {
    const select = document.getElementById('preferred-select');
    select.innerHTML = '';
    const off = document.createElement('option');
    off.value = 'off';
    off.textContent = 'Выключен';
    select.appendChild(off);
    Sites.TS_HOSTS.forEach(function (host) {
        const opt = document.createElement('option');
        opt.value = host;
        opt.textContent = Sites.HOST_META[host].short + ' (' + host + ')';
        select.appendChild(opt);
    });
}

async function onPreferredChange() {
    const select = document.getElementById('preferred-select');
    const value = select.value;
    if (value !== 'off' && settings.visibleSwitchHosts[value] === false) {
        alert('Сначала включите этот хост в настройках переключения.');
        select.value = settings.preferredTsHost;
        return;
    }
    settings = await Settings.setPreferredTsHost(value);
    await refreshPopup();
}

async function refreshPopup() {
    if (refreshInFlight) {
        refreshQueued = true;
        return;
    }
    refreshInFlight = true;
    try {
        settings = await Settings.load();

        const select = document.getElementById('preferred-select');
        if (select.value !== settings.preferredTsHost) {
            select.value = settings.preferredTsHost;
        }

        const tabs = await api.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab || !tab.url) {
            return;
        }
        currentTabId = tab.id;

        const url = new URL(tab.url);
        const newHost = url.hostname;
        const newPath = url.pathname + url.search;
        const hostOrPathChanged = newHost !== currentHost || newPath !== currentPath;

        if (hostOrPathChanged) {
            currentHost = newHost;
            currentPath = newPath;
            applyBodyTheme();
            updateStatus();
        }

        await renderFallbackBanner();
        renderSwitchButtons();
        renderCopyButtons();
    } catch (error) {
        console.error('Init error:', error);
        document.getElementById('current-site').textContent = 'Ошибка загрузки';
    } finally {
        refreshInFlight = false;
        if (refreshQueued) {
            refreshQueued = false;
            refreshPopup();
        }
    }
}

function applyBodyTheme() {
    const supported = Sites.isSupportedHost(currentHost);
    document.body.classList.toggle('disabled-site', !supported);
    document.body.classList.toggle('rating-site', supported && Sites.isRatingHost(currentHost));
}

function updateStatus() {
    const statusElement = document.getElementById('current-site');
    const indicator = document.querySelector('.status-indicator');
    const meta = Sites.HOST_META[currentHost];
    const config = meta || { name: 'Неизвестный сайт', color: '#f44336' };
    statusElement.textContent = config.name;
    indicator.style.background = config.color;
}

function visibilityKey(map) {
    return Sites.ALL_HOSTS.map(function (host) {
        return host + ':' + (map[host] === false ? '0' : '1');
    }).join('|');
}

async function renderFallbackBanner() {
    const banner = document.getElementById('fallback-banner');
    let fallback = null;

    if (currentTabId && settings.preferredTsHost === 'off' && settings.fallbackOnError) {
        fallback = await Settings.getFallbackForTab(currentTabId);
    }

    const key = fallback
        ? [currentTabId, fallback.failedHost, fallback.path || '', settings.preferredTsHost, settings.fallbackOnError].join('|')
        : 'none';

    if (key === lastFallbackKey) {
        return;
    }
    lastFallbackKey = key;

    banner.innerHTML = '';
    banner.classList.add('hidden');
    if (!fallback) {
        return;
    }

    const failedHost = fallback.failedHost;
    const path = fallback.path || currentPath;

    banner.classList.remove('hidden');
    const text = document.createElement('p');
    text.className = 'fallback-text';
    text.textContent = 'Не удалось загрузить ' + failedHost;
    banner.appendChild(text);

    const btnRow = document.createElement('div');
    btnRow.className = 'fallback-buttons';

    Sites.TS_HOSTS.forEach(function (host) {
        if (host === failedHost) return;
        if (settings.visibleSwitchHosts[host] === false) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'switch-btn fallback-btn';
        btn.textContent = Sites.HOST_META[host].short;
        btn.title = host;
        btn.addEventListener('click', function () {
            navigateToHost(host, path);
            Settings.clearFallbackForTab(currentTabId);
            lastFallbackKey = '';
            banner.classList.add('hidden');
        });
        btnRow.appendChild(btn);
    });

    banner.appendChild(btnRow);

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'fallback-dismiss';
    dismiss.textContent = 'Закрыть';
    dismiss.addEventListener('click', function () {
        Settings.clearFallbackForTab(currentTabId);
        lastFallbackKey = '';
        banner.classList.add('hidden');
    });
    banner.appendChild(dismiss);
}

function renderSwitchButtons() {
    const key = [
        currentHost,
        currentPath,
        visibilityKey(settings.visibleSwitchHosts)
    ].join('|');

    if (key === lastSwitchKey) {
        return;
    }
    lastSwitchKey = key;

    const tsSection = document.getElementById('switch-ts-section');
    const ratingSection = document.getElementById('switch-rating-section');
    const tsContainer = document.getElementById('switch-ts-buttons');
    const ratingContainer = document.getElementById('switch-rating-buttons');
    tsContainer.innerHTML = '';
    ratingContainer.innerHTML = '';

    if (!Sites.isSupportedHost(currentHost)) {
        tsSection.classList.add('hidden');
        ratingSection.classList.add('hidden');
        return;
    }

    let tsCount = 0;
    let ratingCount = 0;

    Sites.TS_HOSTS.forEach(function (host) {
        if (host === currentHost) return;
        if (settings.visibleSwitchHosts[host] === false) return;
        if (!Sites.hasExactPath(currentPath, currentHost, host)) return;
        tsContainer.appendChild(createSwitchButton(host, false));
        tsCount++;
    });

    Sites.RATING_HOSTS.forEach(function (host) {
        if (host === currentHost) return;
        if (settings.visibleSwitchHosts[host] === false) return;
        if (!Sites.hasExactPath(currentPath, currentHost, host)) return;
        ratingContainer.appendChild(createSwitchButton(host, true));
        ratingCount++;
    });

    tsSection.classList.toggle('hidden', tsCount === 0);
    ratingSection.classList.toggle('hidden', ratingCount === 0);
}

function createSwitchButton(host, isRating) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'switch-btn' + (isRating ? ' rating-btn' : '');
    const icon = document.createElement('span');
    icon.className = 'btn-icon';
    icon.textContent = isRating ? '⭐' : (host === Sites.TS_HOSTS[0] ? '🏠' : '📡');
    const text = document.createElement('span');
    text.className = 'btn-text';
    text.textContent = host;
    btn.appendChild(icon);
    btn.appendChild(text);
    const targetPath = Sites.convertPath(currentPath, currentHost, host);
    btn.title = Sites.buildUrl(host, targetPath);
    btn.addEventListener('click', function () {
        onSwitchClick(host);
    });
    return btn;
}

async function onSwitchClick(host) {
    await navigateToHost(host);
}

async function navigateToHost(host, pathOverride) {
    try {
        const path = pathOverride != null ? pathOverride : currentPath;
        const newPath = Sites.convertPath(path, currentHost, host);
        let newUrl = Sites.buildUrl(host, newPath);
        if (Sites.isTsHost(host)) {
            const u = new URL(newUrl);
            u.searchParams.set('ts_switcher_direct', '1');
            newUrl = u.toString();
        }
        const tabs = await api.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0].id;
        if (Sites.isTsHost(host)) {
            try {
                if (api === chrome) {
                    await new Promise(function (resolve) {
                        api.runtime.sendMessage({ type: 'TS_SWITCHER_BYPASS', tabId: tabId, ttlMs: 8000 }, function () {
                            resolve();
                        });
                    });
                } else {
                    await api.runtime.sendMessage({ type: 'TS_SWITCHER_BYPASS', tabId: tabId, ttlMs: 8000 });
                }
            } catch {
                // ignore if background listener is not ready
            }
        }
        await api.tabs.update(tabId, { url: newUrl });
    } catch (error) {
        console.error('Switch error:', error);
    }
}

function renderCopyButtons() {
    const key = [
        currentHost,
        currentPath,
        visibilityKey(settings.visibleCopyHosts)
    ].join('|');

    if (key === lastCopyKey) {
        return;
    }
    lastCopyKey = key;

    const section = document.getElementById('copy-section');
    const tsRow = document.getElementById('copy-ts-row');
    const ratingRow = document.getElementById('copy-rating-row');
    tsRow.innerHTML = '';
    ratingRow.innerHTML = '';

    if (!Sites.isSupportedHost(currentHost)) {
        section.classList.add('hidden');
        tsRow.classList.add('hidden');
        ratingRow.classList.add('hidden');
        return;
    }

    const tsCount = fillCopyRow(tsRow, Sites.TS_HOSTS, false);
    const ratingCount = fillCopyRow(ratingRow, Sites.RATING_HOSTS, true);

    section.classList.toggle('hidden', tsCount + ratingCount === 0);
}

function fillCopyRow(row, hosts, isRating) {
    let count = 0;
    hosts.forEach(function (host) {
        if (settings.visibleCopyHosts[host] === false) return;
        if (!Sites.hasExactPath(currentPath, currentHost, host)) return;

        const targetPath = Sites.convertPath(currentPath, currentHost, host);
        const url = Sites.buildUrl(host, targetPath);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'copy-btn copy-btn-secondary' + (isRating ? ' copy-btn-rating' : ' copy-btn-ts');
        btn.textContent = Sites.HOST_META[host].short;
        btn.title = url;
        btn.addEventListener('click', function () {
            copyUrlForHost(host);
        });
        row.appendChild(btn);
        count++;
    });

    row.style.setProperty('--copy-cols', String(Math.max(count, 1)));
    row.classList.toggle('hidden', count === 0);
    return count;
}

async function copyUrlForHost(targetHost) {
    try {
        const newPath = Sites.convertPath(currentPath, currentHost, targetHost);
        const url = Sites.buildUrl(targetHost, newPath);
        await navigator.clipboard.writeText(url);

        const copyMessage = document.getElementById('copy-message');
        copyMessage.classList.remove('hidden');
        setTimeout(function () {
            copyMessage.classList.add('hidden');
        }, 2000);
    } catch (error) {
        console.error('Copy error:', error);
        alert('Не удалось скопировать ссылку');
    }
}
