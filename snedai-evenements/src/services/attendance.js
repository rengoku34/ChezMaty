const { qrPng, tokenFromScan } = require('../qr');

// Confirmation de présence, commune au site et à l'application : crée le billet (une seule fois)
// et envoie le QR code par e-mail à la première confirmation.
async function confirmAttendance({ repo, mailer, format, logger }, event, user) {
  const already = Boolean(await repo.findParticipation(event.id, user.id));
  const participation = await repo.confirmParticipation(event.id, user.id);
  let emailed = false;
  if (!already) {
    try {
      emailed = Boolean(await mailer.sendQrCode(event, user, await qrPng(participation.qr_token), format.eventRange(event.debut, event.fin)));
    } catch (error) {
      logger.error(`QR code non envoyé à ${user.email} : ${error.message}`);
    }
  }
  return { participation, already, emailed };
}

// Scan d'un QR code par un agent : renvoie le code HTTP et le corps de la réponse JSON.
async function scanCode({ repo, format }, rawCode, agentId) {
  const token = tokenFromScan(rawCode);
  const participation = token ? await repo.findParticipationByToken(token) : null;
  if (!participation) return { status: 404, body: { ok: false, status: 'inconnu', message: 'QR code inconnu ou invalide.' } };

  const person = { nom: participation.nom, prenom: participation.prenom, filiale: participation.filiale, evenement: participation.titre };
  if (participation.termine_at) {
    return { status: 409, body: { ok: false, status: 'termine', message: 'Cet événement est déjà terminé.', person } };
  }
  if (participation.scanne_at) {
    return { status: 409, body: { ok: false, status: 'deja', message: `Déjà scanné le ${format.timestamp(participation.scanne_at)}.`, person } };
  }
  if (!(await repo.markScanned(participation.id, agentId))) {
    return { status: 409, body: { ok: false, status: 'deja', message: 'Ce QR code vient déjà d’être scanné.', person } };
  }
  return { status: 200, body: { ok: true, status: 'present', message: 'Présence confirmée.', person } };
}

module.exports = { confirmAttendance, scanCode };
