const express = require('express');
const { scanCode } = require('../services/attendance');

// Page de l'agent d'accueil : il scanne le QR code (douchette ou caméra) pour confirmer la venue.
module.exports = function agentRoutes({ repo, format, access }) {
  const router = express.Router();
  router.use(access.requireAgent);

  router.get('/', (req, res) => res.render('scan', { title: 'Scanner les QR codes' }));

  router.post('/', async (req, res) => {
    const { status, body } = await scanCode({ repo, format }, req.body.code, req.user.id);
    res.status(status).json(body);
  });

  return router;
};
