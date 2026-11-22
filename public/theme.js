(() => {
  const preference = matchMedia('(prefers-color-scheme: dark)');
  let saved;
  try {
    saved = localStorage.getItem('linkqr-theme');
  } catch {
    // The theme can still be changed if browser storage is unavailable.
  }
  let theme = saved === 'dark' || saved === 'light' ? saved : null;
  const current = () => theme ?? (preference.matches ? 'dark' : 'light');
  const root = document.documentElement;
  root.dataset.theme = current();

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('#theme-switch');
    function apply() {
      root.dataset.theme = current();
      button.setAttribute('aria-pressed', String(current() === 'dark'));
    }
    button.addEventListener('click', () => {
      theme = current() === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('linkqr-theme', theme);
      } catch {
        // Keep the selection for the current page.
      }
      apply();
    });
    preference.addEventListener('change', apply);
    apply();
    button.hidden = false;
  });
})();
