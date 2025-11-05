const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

let config;
try {
  config = require('./config');
} catch (error) {
  config = require('./config.sample');
  console.warn('config.js not found; falling back to config.sample.js placeholders.');
}

const app = express();
app.use(express.json());

const record = {
  pending_checkin: {}
};

// ===== 驗證端 API：產生授權請求 QR Code =====
app.post('/getQRCode', async (req, res) => {
  const { message, scenario } = req.body || {};
  if (typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      error: 'Invalid payload',
      message: 'The "message" field is required.'
    });
  }

  const transactionId = uuidv4();
  record.pending_checkin[transactionId] = {
    message,
    createdAt: new Date().toISOString()
  };

  const normalizedScenario = (scenario || 'consent').toLowerCase();
  const scenarioRefs = config.verifier_refs || {};
  const selectedRef = scenarioRefs[normalizedScenario] || config.verifier_ref;

  if (!selectedRef) {
    return res.status(400).json({
      error: 'Missing verifier ref',
      message: 'config.verifier_ref 或 verifier_refs 中必須至少提供一組驗證服務代碼。'
    });
  }

  const url = new URL('https://verifier-sandbox.wallet.gov.tw/api/oidvp/qrcode');
  url.searchParams.set('ref', selectedRef);
  url.searchParams.set('transactionId', transactionId);

  try {
    const response = await axios.get(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        'access-token': config.verifier_accessToken
      },
      timeout: 15000
    });

    const { qrcodeImage, authUri } = response.data || {};
    if (!qrcodeImage || !authUri) {
      throw new Error('Sandbox response is missing qrcodeImage or authUri');
    }

    return res.json({
      qrcodeImage,
      authUri,
      transactionId,
      ref: selectedRef,
      scenario: normalizedScenario
    });
  } catch (error) {
    console.error('Failed to retrieve QR code:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to retrieve QR code',
      message: error.response?.data || error.message
    });
  }
});

// ===== 發行端 API：產生發卡 QR Code =====
app.post('/issueCard', async (req, res) => {
  const { vcUid, fields } = req.body;

  const payload = {
    vcUid: vcUid || config.vcUid,
    issuanceDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
    expiredDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, ''),
    fields: fields || Object.entries(config.cards[vcUid] || {}).map(([ename, content]) => ({ ename, content }))
  };

  try {
    const response = await axios.post(
      'https://issuer-sandbox.wallet.gov.tw/api/qrcode/data',
      payload,
      {
        headers: {
          'access-token': config.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    return res.json(response.data);
  } catch (error) {
    console.error('Failed to issue card:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to issue card',
      message: error.response?.data || error.message
    });
  }
});

// ===== 404 fallback =====
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ===== Server start =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

module.exports = { app, record };
