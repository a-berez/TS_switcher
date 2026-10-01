'use strict';

const optionsApi = (typeof browser !== 'undefined') ? browser : chrome;
let refreshVersion = 0;
let saveVersion = 0;
let pendingSaves = 0;

document.addEventListener('DOMContentLoaded', async function () {
    buildPreferredSelect('off');
    buildHostsTable(Settings.getDefaults());
    document.getElementById('opt-preferred').addEventListener('change', saveFromForm);
    document.getElementById('opt-fallback').addEventListener('change', saveFromForm);
    optionsApi.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes[Settings.STORAGE_KEY]) {
            refreshOptions().catch(function (error) { showStatus(error.message, true); });
        }
    });
    await refreshOptions();
});

async function refreshOptions() {
    const version = ++refreshVersion;
    // Keep the user's current controls while their writes are in flight. The
    // last completed write reloads every field, including external changes.
    if (pendingSaves) return;
    const settings = await Settings.load();
    if (version !== refreshVersion || pendingSaves) return;
    document.getElementById('opt-preferred').value = settings.preferredTsHost;
    document.getElementById('opt-fallback').checked = settings.fallbackOnError;
    document.querySelectorAll('#hosts-tbody input[data-host]').forEach(function (cb) {
        const map = cb.dataset.kind === 'switch' ? settings.visibleSwitchHosts : settings.visibleCopyHosts;
        cb.checked = map[cb.dataset.host] !== false;
    });
}

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
        swCb.addEventListener('change', saveFromForm);
        swTd.appendChild(swCb);
        tr.appendChild(swTd);

        const cpTd = document.createElement('td');
        const cpCb = document.createElement('input');
        cpCb.type = 'checkbox';
        cpCb.dataset.host = host;
        cpCb.dataset.kind = 'copy';
        cpCb.checked = settings.visibleCopyHosts[host] !== false;
        cpCb.addEventListener('change', saveFromForm);
        cpTd.appendChild(cpCb);
        tr.appendChild(cpTd);

        const loginTd = document.createElement('td');
        if (Sites.isTsHost(host)) {
            const loginLink = document.createElement('a');
            loginLink.className = 'login-link';
            loginLink.href = 'https://' + host + '/login?ts_switcher_direct=1';
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

async function saveFromForm(event) {
    // Capture only this edit before awaiting: another page may have newer values.
    const target = event.target;
    const partial = {};
    if (target === document.getElementById('opt-preferred')) {
        partial.preferredTsHost = target.value;
    } else if (target === document.getElementById('opt-fallback')) {
        partial.fallbackOnError = target.checked;
    } else if (target.dataset.host) {
        const key = target.dataset.kind === 'switch' ? 'visibleSwitchHosts' : 'visibleCopyHosts';
        partial[key] = { [target.dataset.host]: target.checked };
    } else {
        return;
    }
    const version = ++saveVersion;
    pendingSaves++;
    ++refreshVersion; // Invalidate reads started before this edit.
    try {
        const saved = await Settings.save(partial);
        if (version !== saveVersion) return;
        if (partial.preferredTsHost && partial.preferredTsHost !== 'off' && saved.preferredTsHost !== partial.preferredTsHost) {
            showStatus('Нельзя выбрать скрытый хост как предпочитаемый. Включите переключение для него.', true);
        } else {
            showStatus('Сохранено');
        }
    } catch (error) {
        if (version === saveVersion) showStatus('Не удалось сохранить настройки: ' + error.message, true);
    } finally {
        pendingSaves--;
        if (pendingSaves === 0) {
            try {
                await refreshOptions();
            } catch (error) {
                showStatus('Не удалось обновить настройки: ' + error.message, true);
            }
        }
    }
}

function showStatus(text, isError) {
    const el = document.getElementById('save-status');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
}
