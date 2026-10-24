const express = require('express');
const { tokenFromScan } = require('../qr');

// Page de l'agent d'accueil : il scanne le QR code (douchette ou caméra) pour confirmer la venue.
module.exports = function agentRoutes({ repo, format, access }) {
  const router = express.Router();
  router.use(access.requireAgent);

  router.get('/', (req, res) => res.render('scan', { title: 'Scanner les QR codes' }));

  router.post('/', async (req, res) => {
    const token = tokenFromScan(req.body.code);
    const participation = token ? await repo.findParticipationByToken(token) : null;
    if (!participation) return res.status(404).json({ ok: false, status: 'inconnu', message: 'QR code inconnu ou invalide.' });

    const person = {
      nom: participation.nom,
      prenom: participation.prenom,
      filiale: participation.filiale,
      evenement: participation.titre,
    };
    if (participation.termine_at) {
      return res.status(409).json({ ok: false, status: 'termine', message: 'Cet événement est déjà terminé.', person });
    }
    if (participation.scanne_at) {
      return res.status(409).json({
        ok: false,
        status: 'deja',
        message: `Déjà scanné le ${format.timestamp(participation.scanne_at)}.`,
        person,
      });
    }
    if (!(await repo.markScanned(participation.id, req.user.id))) {
      return res.status(409).json({ ok: false, status: 'deja', message: 'Ce QR code vient déjà d’être scanné.', person });
    }
    res.json({ ok: true, status: 'present', message: 'Présence confirmée.', person });
  });

  return router;
};
