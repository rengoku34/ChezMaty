// Comportements communs (le CSP interdit les scripts dans les attributs HTML).

// Page ressortie de la mémoire du navigateur (bouton « Retour ») : on la redemande au serveur,
// qui renvoie vers la connexion si l'on s'est déconnecté.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});
document.addEventListener('submit', (event) => {
  const message = event.target.dataset?.confirm;
  if (message && !window.confirm(message)) event.preventDefault();
});

// Champs de connexion : verrouillés au chargement pour que le navigateur ne les remplisse pas
// tout seul avec un identifiant enregistré ; ils se déverrouillent dès qu'on clique ou tape dedans.
document.querySelectorAll('[data-no-autofill]').forEach((input) => {
  const unlock = () => input.removeAttribute('readonly');
  input.addEventListener('pointerdown', unlock);
  input.addEventListener('focus', unlock);
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
    // Sur ordinateur seulement : sur téléphone, le clavier qui s'ouvre cacherait l'animation.
    if (window.matchMedia('(min-width: 761px)').matches) {
      setTimeout(() => form.querySelector('input:not([type=hidden]), select')?.focus({ preventScroll: true }), 600);
    }
  });
}

// Tableau de bord d'un événement en cours : rechargé toutes les 20 s pour voir arriver les présents
// scannés à l'entrée. Le choix (activé / désactivé) est mémorisé sur l'appareil.
const autoRefresh = document.getElementById('auto-refresh');
if (autoRefresh) {
  try { autoRefresh.checked = localStorage.getItem('dashboard-auto-refresh') !== '0'; } catch {}
  autoRefresh.addEventListener('change', () => {
    try { localStorage.setItem('dashboard-auto-refresh', autoRefresh.checked ? '1' : '0'); } catch {}
  });
  setInterval(() => {
    if (autoRefresh.checked && document.visibilityState === 'visible') {
      try { sessionStorage.setItem('auto-reloaded', '1'); } catch {}
      window.location.reload();
    }
  }, 20000);
}

// Chiffres du tableau de bord : comptent de 0 jusqu'à leur valeur au chargement
// (pas lors des actualisations automatiques, pour ne pas distraire).
let autoReloaded = false;
try { autoReloaded = sessionStorage.getItem('auto-reloaded') === '1'; sessionStorage.removeItem('auto-reloaded'); } catch {}
if (autoReloaded) document.documentElement.classList.add('no-intro');
if (!autoReloaded && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.stat strong').forEach((el) => {
    const target = Number(el.textContent);
    if (!Number.isFinite(target) || target === 0) return;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / 700, 1);
      el.textContent = String(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  });
}

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-autosubmit]')) event.target.form.submit();
});
