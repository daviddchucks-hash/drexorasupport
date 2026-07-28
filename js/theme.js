/* ── Theme toggle (light / dark) ───────────────────────────── */
(function () {
  'use strict';

  const STORAGE_KEY = 'drexora-theme';
  const DARK_CLASS  = 'dark-mode';

  /* Apply saved theme immediately (called before DOMContentLoaded) */
  function applyTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark') {
      document.documentElement.classList.add(DARK_CLASS);
    } else {
      document.documentElement.classList.remove(DARK_CLASS);
    }
    syncButtons();
  }

  function isDark() {
    return document.documentElement.classList.contains(DARK_CLASS);
  }

  function syncButtons() {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
      btn.querySelector('.theme-toggle-icon').textContent = isDark() ? '☀️' : '🌙';
      btn.querySelector('.theme-toggle-label').textContent = isDark() ? 'Light' : 'Dark';
    });
  }

  function toggle() {
    document.documentElement.classList.toggle(DARK_CLASS);
    localStorage.setItem(STORAGE_KEY, isDark() ? 'dark' : 'light');
    syncButtons();
  }

  /* Wire up any toggle buttons already in the DOM */
  function wireButtons() {
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', toggle);
    });
    syncButtons();
  }

  /* Run immediately for initial class application */
  applyTheme();

  /* Wire buttons once DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButtons);
  } else {
    wireButtons();
  }

  /* Expose for any page that needs it */
  window.drexoraTheme = { toggle, isDark, applyTheme };
})();
