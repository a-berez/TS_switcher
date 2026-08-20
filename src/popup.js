'use strict';

const api = (typeof browser !== 'undefined') ? browser : chrome;

let currentHost = '';
let currentPath = '';
let currentTabId = null;
let settings = null;
let urlCheckInterval = null;

document.addEventListener('DOMContentLoaded', async function () {
    settings = await Settings.load();
    buildPreferredSelect();
    document.getElementById('open-options').addEventListener('click', openOptions);
    document.getElementById('preferred-select').addEventListener('change', onPreferredChange);
    await refreshPopup();
    startUrlMonitoring();
});

window.addEventListener('beforeunload', function () {
    stopUrlMonitoring();
});

function openOptions(e) {
    e.preventDefault();
    if (api.runtime.openOptionsPage) {
        api.runtime.openOptionsPage();
    }
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

function startUrlMonitoring() {
    stopUrlMonitoring();
    urlCheckInterval = setInterval(refreshPopup, 500);
}

function stopUrlMonitoring() {
    if (urlCheckInterval) {
        clearInterval(urlCheckInterval);
        urlCheckInterval = null;
    }
}

async function refreshPopup() {
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

        if (newHost !== currentHost || newPath !== currentPath) {
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

async function renderFallbackBanner() {
    const banner = document.getElementById('fallback-banner');
    banner.innerHTML = '';
    banner.classList.add('hidden');

    if (!currentTabId || settings.preferredTsHost !== 'off' || !settings.fallbackOnError) {
        return;
    }

    const fallback = await Settings.getFallbackForTab(currentTabId);
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
        btn.textContent = Sites.HOST_META[host].short + ' ' + host;
        btn.addEventListener('click', function () {
            navigateToHost(host, path);
            Settings.clearFallbackForTab(currentTabId);
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
        banner.classList.add('hidden');
    });
    banner.appendChild(dismiss);
}

function renderSwitchButtons() {
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

    const canRating = Sites.canShowRatingSwitch(currentPath, currentHost);
    let tsCount = 0;
    let ratingCount = 0;

    Sites.TS_HOSTS.forEach(function (host) {
        if (host === currentHost) return;
        if (settings.visibleSwitchHosts[host] === false) return;
        tsContainer.appendChild(createSwitchButton(host, false));
        tsCount++;
    });

    if (canRating) {
        Sites.RATING_HOSTS.forEach(function (host) {
            if (host === currentHost) return;
            if (settings.visibleSwitchHosts[host] === false) return;
            ratingContainer.appendChild(createSwitchButton(host, true));
            ratingCount++;
        });
    }

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
    btn.addEventListener('click', function () {
        onSwitchClick(host);
    });
    return btn;
}

async function onSwitchClick(host) {
    if (Sites.isTsHost(host) && settings.preferredTsHost !== 'off') {
        settings = await Settings.setPreferredTsHost(host);
        document.getElementById('preferred-select').value = host;
    }
    await navigateToHost(host);
}

async function navigateToHost(host, pathOverride) {
    try {
        const path = pathOverride != null ? pathOverride : currentPath;
        const newPath = Sites.convertPath(path, currentHost, host);
        const newUrl = Sites.buildUrl(host, newPath);
        const tabs = await api.tabs.query({ active: true, currentWindow: true });
        await api.tabs.update(tabs[0].id, { url: newUrl });
    } catch (error) {
        console.error('Switch error:', error);
    }
}

function renderCopyButtons() {
    const section = document.getElementById('copy-section');
    const container = document.getElementById('copy-buttons');
    container.innerHTML = '';

    if (!Sites.isSupportedHost(currentHost)) {
        section.classList.add('hidden');
        return;
    }

    let count = 0;
    Sites.ALL_HOSTS.forEach(function (host) {
        if (host === currentHost) return;
        if (settings.visibleCopyHosts[host] === false) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'copy-btn copy-btn-secondary';
        btn.textContent = Sites.HOST_META[host].short;
        btn.title = host;
        btn.addEventListener('click', function () {
            copyUrlForHost(host);
        });
        container.appendChild(btn);
        count++;
    });

    section.classList.toggle('hidden', count === 0);
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
