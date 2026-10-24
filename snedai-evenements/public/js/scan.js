(() => {
  const root = document.querySelector('.scan');
  const form = document.getElementById('scan-form');
  const input = document.getElementById('scan-input');
  const result = document.getElementById('scan-result');
  const history = document.getElementById('scan-history');
  const cameraToggle = document.getElementById('camera-toggle');
  const STYLES = { present: 'ok', deja: 'warn', termine: 'warn', inconnu: 'error' };

  let busy = false;
  let lastCode = '';
  let lastCodeAt = 0;

  function show(data) {
    const person = data.person ? `${data.person.prenom} ${data.person.nom}` : '';
    result.hidden = false;
    result.className = `scan-result scan-${STYLES[data.status] || 'error'}`;
    result.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = data.message;
    result.append(title);
    if (data.person) {
      const details = document.createElement('div');
      details.textContent = `${person} — ${data.person.filiale} · ${data.person.evenement}`;
      result.append(details);
    }
    const item = document.createElement('li');
    item.className = `scan-${STYLES[data.status] || 'error'}`;
    item.textContent = `${new Date().toLocaleTimeString('fr-FR')} · ${person || 'Inconnu'} · ${data.message}`;
    history.prepend(item);
    while (history.children.length > 15) history.lastChild.remove();
  }

  async function submit(code) {
    code = code.trim();
    // La caméra lit le même code plusieurs fois par seconde : on ignore les répétitions.
    if (!code || busy || (code === lastCode && Date.now() - lastCodeAt < 4000)) return;
    busy = true;
    lastCode = code;
    lastCodeAt = Date.now();
    try {
      const response = await fetch('/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': root.dataset.csrf },
        body: JSON.stringify({ code }),
      });
      show(await response.json());
    } catch {
      show({ status: 'inconnu', message: 'Connexion impossible. Vérifiez le réseau.' });
    } finally {
      busy = false;
      input.value = '';
      input.focus();
    }
  }

  // Une douchette « tape » le contenu du QR code puis la touche Entrée : le formulaire est envoyé.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(input.value);
  });

  let scanner = null;
  cameraToggle.addEventListener('click', async () => {
    if (scanner) {
      await scanner.stop().catch(() => {});
      scanner = null;
      cameraToggle.textContent = '📷 Utiliser la caméra';
      return;
    }
    if (!window.Html5Qrcode) return show({ status: 'inconnu', message: 'Lecteur caméra indisponible.' });
    scanner = new window.Html5Qrcode('camera');
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (text) => submit(text));
      cameraToggle.textContent = '⏹ Arrêter la caméra';
    } catch {
      scanner = null;
      show({ status: 'inconnu', message: 'Impossible d’ouvrir la caméra (autorisation refusée ou site non sécurisé en HTTPS).' });
    }
  });
})();
