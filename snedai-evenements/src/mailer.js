const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Envoi par l'API HTTPS de Brevo (gratuit, et fonctionne sur les hébergeurs qui bloquent le SMTP).
function brevoTransport(apiKey, sender, fetchImpl) {
  return async ({ to, subject, text, html, attachments = [] }) => {
    const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
        ...(attachments.length && {
          attachment: attachments.map((a) => ({ name: a.filename, content: a.content.toString('base64') })),
        }),
      }),
    });
    if (!response.ok) throw new Error(`Brevo ${response.status} : ${await response.text()}`);
  };
}

function smtpTransport(smtp, sender) {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
  });
  return (message) => transport.sendMail({ from: { name: sender.name, address: sender.email }, ...message });
}

function createMailer(config, logger = console, fetchImpl = globalThis.fetch) {
  let deliver = null;
  if (config.brevoApiKey && config.mailFrom.email) deliver = brevoTransport(config.brevoApiKey, config.mailFrom, fetchImpl);
  else if (config.smtp.host && config.mailFrom.email) deliver = smtpTransport(config.smtp, config.mailFrom);
  const configured = Boolean(deliver);

  async function send(message) {
    if (!deliver) {
      logger.info(`[e-mail non envoyé : aucun service d’envoi configuré] À ${message.to} — ${message.subject}`);
      return false;
    }
    await deliver(message);
    return true;
  }

  function layout(content) {
    return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
      <div style="background:#26246a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;border-bottom:4px solid #f08a46;font-size:18px;font-weight:bold">Événements SNEDAI</div>
      <div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 8px 8px">${content}</div>
    </div>`;
  }

  return {
    configured,
    sender: config.mailFrom.email,

    // Message de bienvenue envoyé juste après la création du compte.
    sendWelcome(user) {
      const link = `${config.appUrl}/`;
      return send({
        to: user.email,
        subject: 'Bienvenue sur les Événements SNEDAI',
        text: `Bonjour ${user.prenom},\n\nVotre compte est créé. Vous serez prévenu(e) par e-mail à chaque nouvel événement, et vous pourrez confirmer votre présence pour recevoir votre QR code d’entrée.\n\nAccéder au site : ${link}\n`,
        html: layout(`<p>Bonjour ${escapeHtml(user.prenom)},</p>
          <p>Bienvenue sur la plateforme des <strong>événements SNEDAI</strong> 🎉 Votre compte est créé.</p>
          <ul>
            <li>Vous recevrez un e-mail <strong>à chaque nouvel événement</strong> ;</li>
            <li>un clic sur « Je serai présent(e) » vous donne votre <strong>QR code d’entrée</strong> ;</li>
            <li>le jour J, il suffit de le présenter à l’accueil.</li>
          </ul>
          <p><a href="${link}" style="display:inline-block;background:#26246a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Voir les événements</a></p>`),
      });
    },

    // E-mail de test envoyé à l'administrateur : renvoie l'erreur exacte du service d'envoi s'il y en a une.
    async sendTest(to) {
      if (!deliver) return { ok: false, error: 'Aucun service d’envoi configuré (variable BREVO_API_KEY absente sur Render).' };
      try {
        await send({
          to,
          subject: 'Test d’envoi – Événements SNEDAI',
          text: 'Si vous lisez ce message, les e-mails du site fonctionnent.',
          html: layout('<p>Si vous lisez ce message, les e-mails du site <strong>fonctionnent</strong> ✅</p>'),
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    // Prévient chaque inscrit d'un nouvel événement. Les envois se font un par un, en arrière-plan.
    async announceEvent(event, users, whenText) {
      const link = `${config.appUrl}/evenements/${event.id}`;
      let sent = 0;
      for (const user of users) {
        try {
          const ok = await send({
            to: user.email,
            subject: `Nouvel événement : ${event.titre}`,
            text: `Bonjour ${user.prenom},\n\nUn nouvel événement a été publié : ${event.titre}.\n${whenText ? `Quand : ${whenText}\n` : ''}${event.lieu ? `Où : ${event.lieu}\n` : ''}\nConfirmez votre présence ici : ${link}\n`,
            html: layout(`<p>Bonjour ${escapeHtml(user.prenom)},</p>
              <p>Un nouvel événement a été publié :</p>
              <h2 style="margin:8px 0">${escapeHtml(event.titre)}</h2>
              ${whenText ? `<p><strong>Quand :</strong> ${escapeHtml(whenText)}</p>` : ''}
              ${event.lieu ? `<p><strong>Où :</strong> ${escapeHtml(event.lieu)}</p>` : ''}
              <p><a href="${link}" style="display:inline-block;background:#26246a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Voir l’événement et confirmer ma présence</a></p>`),
          });
          if (ok) sent += 1;
        } catch (error) {
          logger.error(`Échec de l’envoi à ${user.email} : ${error.message}`);
        }
      }
      return sent;
    },

    // Envoie le QR code personnel après le clic sur « Je serai présent(e) ».
    sendQrCode(event, user, qrPng, whenText) {
      return send({
        to: user.email,
        subject: `Votre QR code pour : ${event.titre}`,
        text: `Bonjour ${user.prenom},\n\nVotre présence à « ${event.titre} » est notée. Présentez le QR code joint (pièce jointe) à l’agent d’accueil le jour de l’événement.\nVous pouvez aussi l’afficher ici : ${config.appUrl}/evenements/${event.id}\n`,
        html: layout(`<p>Bonjour ${escapeHtml(user.prenom)},</p>
          <p>Votre présence à <strong>${escapeHtml(event.titre)}</strong> est notée.</p>
          ${whenText ? `<p><strong>Quand :</strong> ${escapeHtml(whenText)}</p>` : ''}
          ${event.lieu ? `<p><strong>Où :</strong> ${escapeHtml(event.lieu)}</p>` : ''}
          <p>Votre QR code est <strong>en pièce jointe</strong>. Présentez-le à l’agent d’accueil, il sera scanné pour confirmer votre venue.</p>
          <p><a href="${config.appUrl}/evenements/${event.id}" style="display:inline-block;background:#26246a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Afficher mon QR code sur le site</a></p>`),
        attachments: [{ filename: 'qrcode.png', content: qrPng }],
      });
    },
  };
}

module.exports = { createMailer };
