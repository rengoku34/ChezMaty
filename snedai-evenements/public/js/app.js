// Comportements communs (le CSP interdit les scripts dans les attributs HTML).
document.addEventListener('submit', (event) => {
  const message = event.target.dataset?.confirm;
  if (message && !window.confirm(message)) event.preventDefault();
});

// Formulaire de connexion / inscription : le volet glisse sans recharger la page.
const authContainer = document.getElementById('auth-container');
if (authContainer) {
  authContainer.addEventListener('click', (event) => {
    const link = event.target.closest('[data-auth]');
    if (!link) return;
    event.preventDefault();
    const register = link.dataset.auth === 'register';
    authContainer.classList.toggle('right-panel-active', register);
    history.replaceState(null, '', link.getAttribute('href'));
    const form = authContainer.querySelector(register ? '.sign-up-container' : '.sign-in-container');
    setTimeout(() => form.querySelector('input:not([type=hidden]), select')?.focus({ preventScroll: true }), 600);
  });
}

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-autosubmit]')) event.target.form.submit();
});
