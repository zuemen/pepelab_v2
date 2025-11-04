const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

let config;
try {
  // eslint-disable-next-line global-require, import/no-dynamic-require
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

app.post('/getQRCode', async (req, res) => {
  const { message } = req.body || {};
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

  const url = new URL('https://verifier-sandbox.wallet.gov.tw/api/oidvp/qrcode');
  url.searchParams.set('ref', config.verifier_ref);
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
      transactionId
    });
  } catch (error) {
    console.error('Failed to retrieve QR code:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to retrieve QR code',
      message: error.response?.data || error.message
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

module.exports = { app, record };
