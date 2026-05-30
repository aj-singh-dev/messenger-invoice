const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const text = fs.readFileSync(envPath, 'utf8');

  return text.split(/\r?\n/).reduce((result, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return result;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      return result;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    result[key] = value;
    return result;
  }, {});
}

function requestTelegram(method, payload) {
  const https = require('https');
  const env = loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
  }

  const body = payload ? JSON.stringify(payload) : '';

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/' + method,
      method: payload ? 'POST' : 'GET',
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      } : {}
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: data ? JSON.parse(data) : {}
          });
        } catch (error) {
          reject(new Error('Telegram returned non-JSON: ' + data));
        }
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(body);
    }
    req.end();
  });
}

function maskWebhookInfo(info) {
  if (!info || !info.result) {
    return info;
  }

  const result = Object.assign({}, info.result);
  if (result.url) {
    result.url = result.url.replace(/telegram_secret=[^&]+/, 'telegram_secret=***');
  }

  return Object.assign({}, info, { result: result });
}

module.exports = {
  loadEnv,
  requestTelegram,
  maskWebhookInfo
};
