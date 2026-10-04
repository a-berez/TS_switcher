/* Theme policy shared by the popup and content script. No persistent page state. */
'use strict';
const Theme = (() => {
    const PORT = 'ts-switcher-theme-v1';
    // Add future CSS families here only when both light/dark palettes exist.
    const families = Object.freeze({classic: true, oldschool: true, catppuccin: true, colorblind: true});
    const schemes = ['light', 'dark'];
    function scheme(value, fallback) { return schemes.includes(value) ? value : fallback; }
    function family(value) { return families[value] === true ? value : 'classic'; }
    function resolve(host, settings, page, system) {
        const ts = Sites.isTsHost(host);
        const rating = Sites.isRatingHost(host);
        const automatic = host === 'rating.chgk.gg' || ts;
        const source = automatic && page ? page : {};
        const mode = scheme(ts ? settings.tsColorScheme : settings.ratingColorScheme,
            scheme(source.scheme, system.dark ? 'dark' : 'light'));
        return {
            group: ts ? 'ts' : rating ? 'rating' : 'other',
            family: ts ? family(settings.tsTheme === 'auto' ? source.family : settings.tsTheme) : 'rating',
            scheme: mode,
            contrast: ts && (settings.tsContrast === 'more' ||
                (settings.tsContrast !== 'normal' && source.contrast === 'more')) ? 'more' : 'normal'
        };
    }
    function readPage(host, root, dark) {
        if (Sites.isTsHost(host)) return {
            family: family(root.getAttribute('data-site-theme')),
            scheme: scheme(root.getAttribute('data-bs-theme'),
                scheme(root.getAttribute('data-theme-pref'), dark ? 'dark' : 'light')),
            contrast: root.getAttribute('data-contrast') === 'high' ? 'more' : 'normal'
        };
        return {family: 'rating', scheme: dark ? 'dark' : 'light'};
    }
    return {PORT, families, resolve, readPage};
})();
