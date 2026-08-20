/* global self */
'use strict';

const Sites = (function () {
    const TS_HOSTS = [
        'rating.chgk.info',
        'rating.pecheny.me',
        'rating.pecheny.kz',
        'rating.pecheny.ru'
    ];

    const RATING_HOSTS = [
        'rating.chgk.gg',
        'rating.chgk.fun',
        'chgk.quest'
    ];

    const ALL_HOSTS = TS_HOSTS.concat(RATING_HOSTS);

    const HOST_META = {
        'rating.chgk.info': { name: 'Основной сайт (rating.chgk.info)', short: 'info', color: '#4caf50', family: 'ts' },
        'rating.pecheny.me': { name: 'Зеркало (rating.pecheny.me)', short: '.me', color: '#ff9800', family: 'ts' },
        'rating.pecheny.kz': { name: 'Зеркало (rating.pecheny.kz)', short: '.kz', color: '#ff9800', family: 'ts' },
        'rating.pecheny.ru': { name: 'Зеркало (rating.pecheny.ru)', short: '.ru', color: '#ff9800', family: 'ts' },
        'rating.chgk.gg': { name: 'Рейтинг (rating.chgk.gg)', short: '.gg', color: '#2196f3', family: 'rating' },
        'rating.chgk.fun': { name: 'Рейтинг (rating.chgk.fun)', short: '.fun', color: '#2196f3', family: 'rating' },
        'chgk.quest': { name: 'Рейтинг (chgk.quest)', short: 'quest', color: '#2196f3', family: 'rating' }
    };

    const PAGE_TYPES = { PLAYER: 'player', TOURNAMENT: 'tournament', TEAM: 'team' };

    function splitPath(path) {
        const q = path.indexOf('?');
        const h = path.indexOf('#');
        let end = path.length;
        if (q >= 0) end = Math.min(end, q);
        if (h >= 0) end = Math.min(end, h);
        const pathname = path.slice(0, end);
        const suffix = path.slice(end);
        return { pathname, suffix };
    }

    function isTsHost(host) {
        return TS_HOSTS.indexOf(host) >= 0;
    }

    function isRatingHost(host) {
        return RATING_HOSTS.indexOf(host) >= 0;
    }

    function isSupportedHost(host) {
        return ALL_HOSTS.indexOf(host) >= 0;
    }

    function isHomePage(path, host) {
        const { pathname } = splitPath(path);
        if (host === 'rating.chgk.gg') {
            return pathname === '/' || pathname === '/b/' || pathname === '/b';
        }
        return pathname === '/' || pathname === '';
    }

    function getDefaultHome(host) {
        return host === 'rating.chgk.gg' ? '/b/' : '/';
    }

    /** @returns {{ type: string, id: string } | null} */
    function getPageInfo(path, host) {
        const { pathname } = splitPath(path);

        if (isTsHost(host)) {
            const m = pathname.match(/^\/(player|players|tournament|teams)\/(\d+)/);
            if (!m) return null;
            const type = m[1] === 'teams' ? PAGE_TYPES.TEAM
                : m[1] === 'players' ? PAGE_TYPES.PLAYER
                    : m[1];
            return { type, id: m[2] };
        }

        if (host === 'rating.chgk.gg') {
            const m = pathname.match(/^\/b\/(player|tournament|team)\/(\d+)/);
            if (!m) return null;
            return { type: m[1], id: m[2] };
        }

        if (host === 'rating.chgk.fun') {
            const m = pathname.match(/^\/(player|players|tournament|teams)\/(\d+)/);
            if (!m) return null;
            const type = m[1] === 'teams' ? PAGE_TYPES.TEAM
                : m[1] === 'players' ? PAGE_TYPES.PLAYER
                    : m[1];
            return { type, id: m[2] };
        }

        if (host === 'chgk.quest') {
            const m = pathname.match(/^\/(player|team|tournament)\/(\d+)/);
            if (!m) return null;
            return { type: m[1], id: m[2] };
        }

        return null;
    }

    function canShowRatingSwitch(path, host) {
        return isHomePage(path, host) || getPageInfo(path, host) !== null;
    }

    function buildPathForPage(info, host) {
        const { type, id } = info;

        if (isTsHost(host)) {
            const seg = type === PAGE_TYPES.TEAM ? 'teams'
                : type === PAGE_TYPES.PLAYER ? 'players'
                    : 'tournament';
            return `/${seg}/${id}`;
        }

        if (host === 'rating.chgk.gg') {
            return `/b/${type}/${id}/`;
        }

        if (host === 'rating.chgk.fun') {
            const seg = type === PAGE_TYPES.TEAM ? 'teams'
                : type === PAGE_TYPES.PLAYER ? 'player'
                    : 'tournament';
            return `/${seg}/${id}`;
        }

        if (host === 'chgk.quest') {
            const seg = type === PAGE_TYPES.TEAM ? 'team' : type;
            return `/${seg}/${id}`;
        }

        return getDefaultHome(host);
    }

    function convertPath(path, fromHost, toHost) {
        if (fromHost === toHost) return path;

        const { suffix } = splitPath(path);

        if (isHomePage(path, fromHost)) {
            return getDefaultHome(toHost) + suffix;
        }

        const info = getPageInfo(path, fromHost);
        if (!info) {
            return getDefaultHome(toHost) + suffix;
        }

        return buildPathForPage(info, toHost) + suffix;
    }

    function buildUrl(host, path) {
        return `https://${host}${path}`;
    }

    return {
        TS_HOSTS,
        RATING_HOSTS,
        ALL_HOSTS,
        HOST_META,
        PAGE_TYPES,
        isTsHost,
        isRatingHost,
        isSupportedHost,
        isHomePage,
        getDefaultHome,
        getPageInfo,
        canShowRatingSwitch,
        buildPathForPage,
        convertPath,
        buildUrl
    };
}());

if (typeof self !== 'undefined') {
    self.Sites = Sites;
}
if (typeof window !== 'undefined') {
    window.Sites = Sites;
}
