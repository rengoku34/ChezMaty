const QRCode = require('qrcode');

const QR_PREFIX = 'SNEDAI-EVT:';

const qrContent = (token) => `${QR_PREFIX}${token}`;

// Accepte le contenu complet du QR code, ou le seul jeton saisi à la main.
function tokenFromScan(raw) {
  const value = String(raw || '').trim();
  const token = value.startsWith(QR_PREFIX) ? value.slice(QR_PREFIX.length) : value;
  return /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null;
}

const qrPng = (token) => QRCode.toBuffer(qrContent(token), { width: 480, margin: 2, errorCorrectionLevel: 'M' });
const qrDataUrl = (token) => QRCode.toDataURL(qrContent(token), { width: 320, margin: 2, errorCorrectionLevel: 'M' });

module.exports = { qrContent, tokenFromScan, qrPng, qrDataUrl };
