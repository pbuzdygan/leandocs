// Applies the theme before the first paint (UI_SPEC §84), so dark mode does not flash light while
// the app loads. A separate file because the Content-Security-Policy allows no inline scripts.
// Mirrors `ThemeController` in src/app/theme.ts; the app takes over once it has loaded its settings.
/* global window, document */
(function () {
  var theme = 'system';
  try {
    theme = JSON.parse(window.localStorage.getItem('leandocs.theme')) || 'system';
  } catch {
    // Storage blocked or a damaged value: follow the system.
  }
  if (theme !== 'light' && theme !== 'dark')
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
