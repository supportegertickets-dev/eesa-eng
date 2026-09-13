/**
 * Theme bootstrap, injected into <head> by the root layout.
 *
 * This lives in its own module, deliberately without a 'use client' directive,
 * because the root layout is a server component: importing a value out of a
 * client module would hand back a client reference rather than the string.
 *
 * It must run before first paint. Applying the theme any later renders the page
 * light and then snaps it to dark, which is more jarring than no dark mode.
 */
export const THEME_STORAGE_KEY = 'eesa_theme';

export const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = stored === 'dark' ||
      ((!stored || stored === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;
