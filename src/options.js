'use strict';

let saveTimer = null;

document.addEventListener('DOMContentLoaded', async function () {
    const settings = await Settings.load();
    buildPreferredSelect(settings.preferredTsHost);
    document.getElementById('opt-fallback').checked = settings.fallbackOnError;
    buildHostsTable(settings);
    document.getElementById('opt-preferred').addEventListener('change', scheduleSave);
    document.getElementById('opt-fallback').addEventListener('change', scheduleSave);
});

function buildPreferredSelect(current) {
    const select = document.getElementById('opt-preferred');
    select.innerHTML = '';
    const off = document.createElement('option');
    off.value = 'off';
    off.textContent = 'Выключен';
    select.appendChild(off);
    Sites.TS_HOSTS.forEach(function (host) {
        const opt = document.createElement('option');
        opt.value = host;
        opt.textContent = host;
        select.appendChild(opt);
    });
    select.value = current;
}

function buildHostsTable(settings) {
    const tbody = document.getElementById('hosts-tbody');
    tbody.innerHTML = '';
    Sites.ALL_HOSTS.forEach(function (host) {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.textContent = Sites.HOST_META[host].name;
        tr.appendChild(nameTd);

        const swTd = document.createElement('td');
        const swCb = document.createElement('input');
        swCb.type = 'checkbox';
        swCb.dataset.host = host;
        swCb.dataset.kind = 'switch';
        swCb.checked = settings.visibleSwitchHosts[host] !== false;
        swCb.addEventListener('change', scheduleSave);
        swTd.appendChild(swCb);
        tr.appendChild(swTd);

        const cpTd = document.createElement('td');
        const cpCb = document.createElement('input');
        cpCb.type = 'checkbox';
        cpCb.dataset.host = host;
        cpCb.dataset.kind = 'copy';
        cpCb.checked = settings.visibleCopyHosts[host] !== false;
        cpCb.addEventListener('change', scheduleSave);
        cpTd.appendChild(cpCb);
        tr.appendChild(cpTd);

        const loginTd = document.createElement('td');
        if (Sites.isTsHost(host)) {
            const loginLink = document.createElement('a');
            loginLink.className = 'login-link';
            loginLink.href = 'https://' + host + '/login';
            loginLink.target = '_blank';
            loginLink.rel = 'noopener noreferrer';
            loginLink.textContent = 'Войти';
            loginLink.title = 'Открыть /login на ' + host;
            loginTd.appendChild(loginLink);
        } else {
            loginTd.textContent = '—';
            loginTd.className = 'login-na';
        }
        tr.appendChild(loginTd);

        tbody.appendChild(tr);
    });
}

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveFromForm, 300);
}

async function saveFromForm() {
    const preferred = document.getElementById('opt-preferred').value;
    const fallbackOnError = document.getElementById('opt-fallback').checked;
    const visibleSwitchHosts = {};
    const visibleCopyHosts = {};

    document.querySelectorAll('#hosts-tbody input[data-host]').forEach(function (cb) {
        const host = cb.dataset.host;
        if (cb.dataset.kind === 'switch') {
            visibleSwitchHosts[host] = cb.checked;
        } else {
            visibleCopyHosts[host] = cb.checked;
        }
    });

    if (preferred !== 'off' && visibleSwitchHosts[preferred] === false) {
        showStatus('Нельзя выбрать скрытый хост как предпочитаемый. Включите переключение для него.', true);
        const settings = await Settings.load();
        document.getElementById('opt-preferred').value = settings.preferredTsHost;
        return;
    }

    await Settings.save({
        preferredTsHost: preferred,
        fallbackOnError: fallbackOnError,
        visibleSwitchHosts: visibleSwitchHosts,
        visibleCopyHosts: visibleCopyHosts
    });
    showStatus('Сохранено');
}

function showStatus(text, isError) {
    const el = document.getElementById('save-status');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
}
