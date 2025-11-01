// Popup script

// Cross-browser API
const api = (typeof browser !== 'undefined') ? browser : chrome;

const SITES = {
    MAIN: 'rating.chgk.info',
    MIRROR_ME: 'rating.pecheny.me',
    MIRROR_KZ: 'rating.pecheny.kz',
    RATING_GG: 'rating.chgk.gg'
};

let currentHost = '';
let currentPath = '';
let urlCheckInterval = null;

// Типы страниц для переключения на rating.chgk.gg
const PAGE_TYPES = {
    PLAYER: 'player',
    TOURNAMENT: 'tournament',
    TEAM: 'team'
};

// Определяет тип страницы по пути
function getPageType(path) {
    // Паттерны для rating.chgk.info и зеркал
    const infoPattern = /^\/(player|tournament|teams)\/(\d+)/;
    // Паттерны для rating.chgk.gg
    const ggPattern = /^\/b\/(player|tournament|team)\/(\d+)/;
    
    const infoMatch = path.match(infoPattern);
    if (infoMatch) {
        const type = infoMatch[1];
        return type === 'teams' ? PAGE_TYPES.TEAM : type;
    }
    
    const ggMatch = path.match(ggPattern);
    if (ggMatch) {
        return ggMatch[1];
    }
    
    return null;
}

// Проверяет, является ли страница главной
function isHomePage(path) {
    // Убираем query параметры и хэш для проверки
    const cleanPath = path.split('?')[0].split('#')[0];
    // Главная страница: "/" или "/b/" для rating.chgk.gg
    return cleanPath === '/' || cleanPath === '/b/' || cleanPath === '/b';
}

// Преобразует путь с rating.chgk.info/зеркал на rating.chgk.gg
function convertPathToGG(path) {
    const pageType = getPageType(path);
    if (!pageType) return null;
    
    const match = path.match(/\/(player|tournament|teams)\/(\d+)/);
    if (!match) return null;
    
    const [, type, id] = match;
    const ggType = type === 'teams' ? 'team' : type;
    
    // Удаляем query параметры и хэш для формирования базового пути
    const basePath = path.split('?')[0].split('#')[0];
    const baseMatch = basePath.match(/^\/(player|tournament|teams)\/(\d+)/);
    
    if (baseMatch) {
        return `/b/${ggType}/${id}/`;
    }
    
    return null;
}

// Преобразует путь с rating.chgk.gg на rating.chgk.info
function convertPathFromGG(path) {
    const pageType = getPageType(path);
    if (!pageType) return null;
    
    const match = path.match(/\/b\/(player|tournament|team)\/(\d+)/);
    if (!match) return null;
    
    const [, type, id] = match;
    const infoType = type === 'team' ? 'teams' : type;
    
    // Удаляем query параметры и хэш для формирования базового пути
    const basePath = path.split('?')[0].split('#')[0];
    const baseMatch = basePath.match(/^\/b\/(player|tournament|team)\/(\d+)/);
    
    if (baseMatch) {
        return `/${infoType}/${id}`;
    }
    
    return null;
}

document.addEventListener('DOMContentLoaded', async () => {
    await initPopup();
    setupEventListeners();
    startUrlMonitoring();
});

// Останавливаем мониторинг при закрытии попапа
window.addEventListener('beforeunload', () => {
    stopUrlMonitoring();
});

async function initPopup() {
    try {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) {
            return;
        }
        
        const url = new URL(tab.url);
        const newHost = url.hostname;
        const newPath = url.pathname + url.search;
        
        // Проверяем, изменился ли URL
        if (newHost !== currentHost || newPath !== currentPath) {
            currentHost = newHost;
            currentPath = newPath;
            
            const isSupported = currentHost === SITES.MAIN || 
                               currentHost === SITES.MIRROR_ME || 
                               currentHost === SITES.MIRROR_KZ ||
                               currentHost === SITES.RATING_GG;
            
            if (!isSupported) {
                document.body.classList.add('disabled-site');
                document.body.classList.remove('rating-gg-site');
                disableCopyButton();
            } else {
                document.body.classList.remove('disabled-site');
                // Добавляем класс для сайта рейтинга
                if (currentHost === SITES.RATING_GG) {
                    document.body.classList.add('rating-gg-site');
                } else {
                    document.body.classList.remove('rating-gg-site');
                }
            }
            
            updateStatus();
            showRelevantControls();
        }
    } catch (error) {
        console.error('Init error:', error);
        document.getElementById('current-site').textContent = 'Ошибка загрузки';
    }
}

// Запускает мониторинг изменений URL вкладки
function startUrlMonitoring() {
    // Останавливаем предыдущий интервал, если он есть
    stopUrlMonitoring();
    
    // Проверяем URL каждые 500мс, пока попап открыт
    urlCheckInterval = setInterval(async () => {
        await initPopup();
    }, 500);
}

// Останавливает мониторинг изменений URL
function stopUrlMonitoring() {
    if (urlCheckInterval) {
        clearInterval(urlCheckInterval);
        urlCheckInterval = null;
    }
}

function updateStatus() {
    const statusElement = document.getElementById('current-site');
    const indicator = document.querySelector('.status-indicator');
    
    const siteConfig = {
        [SITES.MAIN]: { name: 'Основной сайт (rating.chgk.info)', color: '#4caf50' },
        [SITES.MIRROR_ME]: { name: 'Зеркало (rating.pecheny.me)', color: '#ff9800' },
        [SITES.MIRROR_KZ]: { name: 'Зеркало (rating.pecheny.kz)', color: '#ff9800' },
        [SITES.RATING_GG]: { name: 'Рейтинг (rating.chgk.gg)', color: '#2196f3' }
    };
    
    const config = siteConfig[currentHost] || { name: 'Неизвестный сайт', color: '#f44336' };
    
    statusElement.textContent = config.name;
    indicator.style.background = config.color;
}

function showRelevantControls() {
    const mainControls = document.getElementById('main-site-controls');
    const mirrorControls = document.getElementById('mirror-site-controls');
    const ratingGGControl = document.getElementById('rating-gg-control');
    const otherMirrorBtn = document.getElementById('switch-to-other-mirror');
    const pechenyMeFromGG = document.getElementById('switch-to-pecheny-me-from-gg');
    const pechenyKzFromGG = document.getElementById('switch-to-pecheny-kz-from-gg');
    const otherMirrorText = document.getElementById('other-mirror-text');
    
    // Сначала скрываем все секции и сбрасываем состояние всех кнопок
    mainControls.classList.add('hidden');
    mirrorControls.classList.add('hidden');
    ratingGGControl.classList.add('hidden');
    
    // ВСЕГДА явно скрываем/показываем каждую кнопку отдельно для избежания конфликтов
    otherMirrorBtn.classList.add('hidden');
    pechenyMeFromGG.classList.add('hidden');
    pechenyKzFromGG.classList.add('hidden');
    
    // Определяем, является ли текущая страница страницей игрока/турнира/команды
    const pageType = getPageType(currentPath);
    const isSupportedPage = pageType !== null;
    // Определяем, является ли текущая страница главной
    const isHome = isHomePage(currentPath);
    // Показываем кнопку рейтинга на главной или на поддерживаемых страницах
    const canShowRatingButton = isHome || isSupportedPage;
    
    if (currentHost === SITES.MAIN) {
        // На основном сайте: обе кнопки зеркал + кнопка сайта рейтинга (если главная или поддерживаемая страница)
        mainControls.classList.remove('hidden');
        if (canShowRatingButton) {
            ratingGGControl.classList.remove('hidden');
        }
    } else if (currentHost === SITES.MIRROR_ME) {
        // На зеркале .me: основной сайт + одно зеркало (.kz) + кнопка сайта рейтинга (если главная или поддерживаемая страница)
        mirrorControls.classList.remove('hidden');
        otherMirrorBtn.classList.remove('hidden');
        otherMirrorText.textContent = 'rating.pecheny.kz';
        // Гарантируем, что кнопки для rating.chgk.gg скрыты
        pechenyMeFromGG.classList.add('hidden');
        pechenyKzFromGG.classList.add('hidden');
        if (canShowRatingButton) {
            ratingGGControl.classList.remove('hidden');
        }
    } else if (currentHost === SITES.MIRROR_KZ) {
        // На зеркале .kz: основной сайт + одно зеркало (.me) + кнопка сайта рейтинга (если главная или поддерживаемая страница)
        mirrorControls.classList.remove('hidden');
        otherMirrorBtn.classList.remove('hidden');
        otherMirrorText.textContent = 'rating.pecheny.me';
        // Гарантируем, что кнопки для rating.chgk.gg скрыты
        pechenyMeFromGG.classList.add('hidden');
        pechenyKzFromGG.classList.add('hidden');
        if (canShowRatingButton) {
            ratingGGControl.classList.remove('hidden');
        }
    } else if (currentHost === SITES.RATING_GG) {
        // На rating.chgk.gg показываем кнопки только на главной или на страницах игроков/команд/турниров
        const isHome = isHomePage(currentPath);
        const canShowButtons = isHome || isSupportedPage;
        
        if (canShowButtons) {
            // На rating.chgk.gg показываем: основной сайт, оба зеркала отдельно (БЕЗ кнопки "Другое зеркало")
            mirrorControls.classList.remove('hidden');
            // ВАЖНО: кнопка "Другое зеркало" должна быть скрыта
            otherMirrorBtn.classList.add('hidden');
            // Показываем обе кнопки зеркал отдельно
            pechenyMeFromGG.classList.remove('hidden');
            pechenyKzFromGG.classList.remove('hidden');
        }
        // На rating.chgk.gg не показываем кнопку переключения на себя
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
    document.getElementById('switch-to-pecheny-me-from-gg').addEventListener('click', () => switchTo(SITES.MIRROR_ME));
    document.getElementById('switch-to-pecheny-kz-from-gg').addEventListener('click', () => switchTo(SITES.MIRROR_KZ));
    document.getElementById('switch-to-rating-gg').addEventListener('click', () => switchTo(SITES.RATING_GG, true));
    document.getElementById('copy-url').addEventListener('click', copyOriginalUrl);
}

async function switchTo(host, needConversion = false) {
    try {
        let newPath = currentPath;
        
        // Если переключаемся на rating.chgk.gg или с него, нужно преобразовать путь
        if (needConversion || host === SITES.RATING_GG || currentHost === SITES.RATING_GG) {
            if (host === SITES.RATING_GG) {
                // Переход на rating.chgk.gg
                const convertedPath = convertPathToGG(currentPath);
                if (convertedPath) {
                    newPath = convertedPath;
                } else {
                    // Если конвертация не удалась (например, не поддерживаемая страница),
                    // переходим на главную страницу рейтинга
                    newPath = '/b/';
                }
            } else if (currentHost === SITES.RATING_GG) {
                // Переход с rating.chgk.gg на основной сайт или зеркала
                const isHome = isHomePage(currentPath);
                if (isHome) {
                    // С главной страницы рейтинга переходим на главные других сайтов
                    newPath = '/';
                } else {
                    // С страниц игроков/команд/турниров конвертируем путь
                    const convertedPath = convertPathFromGG(currentPath);
                    if (convertedPath) {
                        newPath = convertedPath;
                    } else {
                        // Если конвертация не удалась (например, не поддерживаемая страница),
                        // переходим на главную страницу целевого сайта
                        newPath = '/';
                    }
                }
            }
        }
        
        const newUrl = `https://${host}${newPath}`;
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
