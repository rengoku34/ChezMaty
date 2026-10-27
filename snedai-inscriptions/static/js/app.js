// Comportements communs (le CSP interdit les scripts dans les attributs HTML).

// Menu déroulant (en haut à droite) : s'ouvre au clic sur le bouton, se ferme en cliquant ailleurs ou avec Échap.
const menuButton = document.getElementById('menu-button');
const menuPanel = document.getElementById('menu-panel');
if (menuButton && menuPanel) {
  const setOpen = (open) => {
    menuPanel.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  };
  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(menuPanel.hidden);
    // Ouvert au clavier (détail 0) : le curseur passe sur le premier lien.
    if (!menuPanel.hidden && event.detail === 0) menuPanel.querySelector('a, button')?.focus({ preventScroll: true });
  });
  document.addEventListener('click', (event) => {
    if (!menuPanel.hidden && !menuPanel.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menuPanel.hidden) {
      setOpen(false);
      menuButton.focus();
    }
  });
}

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

// Compte à rebours jusqu'au prochain événement (mis à jour chaque seconde).
document.querySelectorAll('[data-countdown]').forEach((box) => {
  const target = new Date(box.dataset.countdown).getTime();
  const units = Object.fromEntries([...box.querySelectorAll('[data-unit]')].map((el) => [el.dataset.unit, el]));
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const left = Math.max(0, target - Date.now());
    if (left === 0) return window.location.reload();
    const s = Math.floor(left / 1000);
    units.j.textContent = Math.floor(s / 86400);
    units.h.textContent = pad(Math.floor((s % 86400) / 3600));
    units.m.textContent = pad(Math.floor((s % 3600) / 60));
    units.s.textContent = pad(s % 60);
  };
  tick();
  setInterval(tick, 1000);
});

// Application installable : service worker, et bouton « Installer l'application » quand c'est possible.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
const installBanner = document.getElementById('install-banner');
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (installBanner && !standalone) {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBanner.hidden = false;
  });
  document.getElementById('install-button').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBanner.hidden = true;
  });
  // iPhone / iPad : pas de bouton automatique, on explique le geste.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    installBanner.querySelector('span').textContent = 'Sur iPhone : touchez « Partager » puis « Sur l’écran d’accueil » pour installer le site comme une application.';
    installBanner.querySelector('button').hidden = true;
    installBanner.hidden = false;
  }
}

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-autosubmit]')) event.target.form.submit();
});

// Bouton « Copier le lien » : copie l'adresse indiquée dans data-copy, puis affiche « Lien copié ✓ » un instant.
document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const texte = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(texte);
    } catch {
      // Navigateur sans accès au presse-papiers : on sélectionne le champ voisin pour copier à la main.
      const champ = document.getElementById(button.dataset.target);
      if (champ) { champ.focus(); champ.select(); }
    }
    const libelle = button.querySelector('span') || button;
    const avant = libelle.textContent;
    libelle.textContent = 'Lien copié ✓';
    setTimeout(() => { libelle.textContent = avant; }, 1800);
  });
});

// Un clic dans le champ du lien d'inscription le sélectionne en entier (pour le copier à la main).
document.querySelectorAll('.lien-input').forEach((champ) => champ.addEventListener('focus', () => champ.select()));
