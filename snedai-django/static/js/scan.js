// Page de l'agent d'accueil : reçoit le code du QR (terminal de scan ou caméra), l'envoie au serveur,
// et affiche le résultat (vert / orange / rouge) avec un bip.
(() => {
  const root = document.querySelector('.scan');
  const input = document.getElementById('scan-input');        // champ invisible qui reçoit le code du terminal
  const ready = document.getElementById('scan-ready');        // message « Prêt à scanner »
  const result = document.getElementById('scan-result');
  const history = document.getElementById('scan-history');
  const cameraToggle = document.getElementById('camera-toggle');
  // Style du résultat selon la réponse du serveur.
  const STYLES = { present: 'ok', deja: 'warn', termine: 'warn', inconnu: 'error' };
  // Un QR code complet : « SNEDAI-EVT: » suivi de 32 caractères.
  const FULL_CODE = /^SNEDAI-EVT:[A-Za-z0-9_-]{32}$/;

  let busy = false;
  let lastCode = '';
  let lastCodeAt = 0;
  let autoTimer = null;

  // Bip court et aigu si la présence est confirmée, deux bips graves sinon (et vibration si possible).
  let audio = null;
  function beep(ok) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const tones = ok ? [[880, 0]] : [[220, 0], [220, 0.22]];
      for (const [freq, delay] of tones) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = freq;
        gain.gain.value = 0.15;
        osc.connect(gain).connect(audio.destination);
        osc.start(audio.currentTime + delay);
        osc.stop(audio.currentTime + delay + 0.15);
      }
      navigator.vibrate?.(ok ? 80 : [120, 80, 120]);
    } catch {}
  }

  // Affiche le résultat d'un scan.
  function show(data) {
    beep(data.status === 'present');
    const style = STYLES[data.status] || 'error';
    const person = data.person ? `${data.person.prenom} ${data.person.nom}` : '';
    ready.hidden = true;
    result.hidden = false;
    result.className = `scan-result scan-${style}`;
    void result.offsetWidth;                 // relance l'animation à chaque scan
    result.classList.add('flash');
    const flash = document.getElementById('scan-flash');
    flash.className = `scan-flash scan-flash-${style}`;
    void flash.offsetWidth;
    flash.classList.add('on');
    result.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = data.message;
    result.append(title);
    if (data.person) {
      const details = document.createElement('div');
      details.textContent = `${person} — ${data.person.filiale} · ${data.person.evenement}`;
      result.append(details);
    }
    // Une ligne de plus dans « Derniers scans » (15 au maximum).
    const item = document.createElement('li');
    item.className = `scan-${style}`;
    item.textContent = `${new Date().toLocaleTimeString('fr-FR')} · ${person || 'Inconnu'} · ${data.message}`;
    history.prepend(item);
    while (history.children.length > 15) history.lastChild.remove();
  }

  // Envoie le code au serveur et affiche la réponse.
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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRFToken': root.dataset.csrf },
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

  // Le terminal « tape » le contenu du QR code, puis la touche Entrée (ou Tab selon son réglage).
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      clearTimeout(autoTimer);
      submit(input.value);
    }
  });

  // Certains terminaux n'envoient pas « Entrée » après le code : dès qu'un QR code complet est reçu,
  // on l'envoie après une courte pause.
  const checkComplete = () => {
    clearTimeout(autoTimer);
    if (FULL_CODE.test(input.value.trim())) autoTimer = setTimeout(() => submit(input.value), 120);
  };
  input.addEventListener('input', checkComplete);
  // Certains lecteurs Android remplissent le champ sans déclencher d'événement : vérification régulière.
  let lastSeen = '';
  setInterval(() => {
    if (input.value !== lastSeen) {
      lastSeen = input.value;
      checkComplete();
    }
  }, 250);

  // Le curseur reste toujours dans le champ invisible : le terminal peut scanner à tout moment,
  // même si quelqu'un a touché ailleurs sur l'écran.
  document.addEventListener('keydown', (event) => {
    if (document.activeElement !== input && event.key.length === 1 && !event.ctrlKey && !event.metaKey) input.focus();
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement === document.body || document.activeElement === null) input.focus({ preventScroll: true });
    }, 150);
  });

  // L'écran du terminal reste allumé tant que la page Scanner est ouverte.
  let wakeLock = null;
  const keepAwake = async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch {}
  };
  keepAwake();
  document.addEventListener('visibilitychange', () => {
    keepAwake();
    if (document.visibilityState === 'visible') input.focus({ preventScroll: true });
  });

  // Scan par la caméra (secours).
  let scanner = null;
  cameraToggle.addEventListener('click', async () => {
    if (scanner) {
      await scanner.stop().catch(() => {});
      scanner = null;
      cameraToggle.textContent = 'Utiliser la caméra';
      return;
    }
    if (!window.Html5Qrcode) return show({ status: 'inconnu', message: 'Lecteur caméra indisponible.' });
    scanner = new window.Html5Qrcode('camera');
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (text) => submit(text));
      cameraToggle.textContent = 'Arrêter la caméra';
    } catch {
      scanner = null;
      show({ status: 'inconnu', message: 'Impossible d’ouvrir la caméra (autorisation refusée ou site non sécurisé en HTTPS).' });
    }
  });
})();
