// Popup script

// Cross-browser API
const api = (typeof browser !== 'undefined') ? browser : chrome;

const SITES = {
    MAIN: 'rating.chgk.info',
    MIRROR_ME: 'rating.pecheny.me',
    MIRROR_KZ: 'rating.pecheny.kz'
};

let currentHost = '';
let currentPath = '';

document.addEventListener('DOMContentLoaded', async () => {
    await initPopup();
    setupEventListeners();
});

async function initPopup() {
    try {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        const url = new URL(tab.url);
        currentHost = url.hostname;
        currentPath = url.pathname + url.search;
        
        const isSupported = currentHost === SITES.MAIN || 
                           currentHost === SITES.MIRROR_ME || 
                           currentHost === SITES.MIRROR_KZ;
        
        if (!isSupported) {
            document.body.classList.add('disabled-site');
            disableCopyButton();
        }
        
        updateStatus();
        showRelevantControls();
    } catch (error) {
        console.error('Init error:', error);
        document.getElementById('current-site').textContent = 'Ошибка загрузки';
    }
}

function updateStatus() {
    const statusElement = document.getElementById('current-site');
    const indicator = document.querySelector('.status-indicator');
    
    const siteConfig = {
        [SITES.MAIN]: { name: 'Основной сайт (rating.chgk.info)', color: '#4caf50' },
        [SITES.MIRROR_ME]: { name: 'Зеркало (rating.pecheny.me)', color: '#ff9800' },
        [SITES.MIRROR_KZ]: { name: 'Зеркало (rating.pecheny.kz)', color: '#ff9800' }
    };
    
    const config = siteConfig[currentHost] || { name: 'Неизвестный сайт', color: '#f44336' };
    
    statusElement.textContent = config.name;
    indicator.style.background = config.color;
}

function showRelevantControls() {
    const mainControls = document.getElementById('main-site-controls');
    const mirrorControls = document.getElementById('mirror-site-controls');
    const otherMirrorText = document.getElementById('other-mirror-text');
    
    mainControls.classList.add('hidden');
    mirrorControls.classList.add('hidden');
    
    if (currentHost === SITES.MAIN) {
        mainControls.classList.remove('hidden');
    } else if (currentHost === SITES.MIRROR_ME) {
        mirrorControls.classList.remove('hidden');
        otherMirrorText.textContent = 'rating.pecheny.kz';
    } else if (currentHost === SITES.MIRROR_KZ) {
        mirrorControls.classList.remove('hidden');
        otherMirrorText.textContent = 'rating.pecheny.me';
    }
}

function setupEventListeners() {
    document.getElementById('switch-to-pecheny-me').addEventListener('click', () => switchTo(SITES.MIRROR_ME));
    document.getElementById('switch-to-pecheny-kz').addEventListener('click', () => switchTo(SITES.MIRROR_KZ));
    document.getElementById('switch-to-original').addEventListener('click', () => switchTo(SITES.MAIN));
    document.getElementById('switch-to-other-mirror').addEventListener('click', () => {
        const target = currentHost === SITES.MIRROR_ME ? SITES.MIRROR_KZ : SITES.MIRROR_ME;
        switchTo(target);
    });
    document.getElementById('copy-url').addEventListener('click', copyOriginalUrl);
}

async function switchTo(host) {
    try {
        const newUrl = `https://${host}${currentPath}`;
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        await api.tabs.update(tab.id, { url: newUrl });
    } catch (error) {
        console.error('Switch error:', error);
    }
}

function disableCopyButton() {
    const copyBtn = document.getElementById('copy-url');
    if (copyBtn) {
        copyBtn.disabled = true;
        copyBtn.classList.add('disabled');
        copyBtn.textContent = 'Функция недоступна';
    }
}

async function copyOriginalUrl() {
    try {
        const originalUrl = `https://${SITES.MAIN}${currentPath}`;
        await navigator.clipboard.writeText(originalUrl);
        
        const copyMessage = document.getElementById('copy-message');
        copyMessage.classList.remove('hidden');
        
        setTimeout(() => {
            copyMessage.classList.add('hidden');
        }, 2000);
    } catch (error) {
        console.error('Copy error:', error);
        alert('Не удалось скопировать ссылку');
    }
}
