const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '..', '.env');
const env = parseEnv(fs.readFileSync(envPath, 'utf8'));

const required = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'SPREADSHEET_ID',
  'DRIVE_OUTPUT_FOLDER_ID',
  'INPUT_SHEET_NAME',
  'INVOICE_SHEET_NAME',
  'INVOICE_NUMBER_CELL',
  'PERIOD_START_CELL',
  'PERIOD_END_CELL',
  'MONDAY_CELL',
  'TUESDAY_CELL',
  'WEDNESDAY_CELL',
  'THURSDAY_CELL',
  'FRIDAY_CELL',
  'SATURDAY_CELL',
  'SUNDAY_CELL',
  'WEEKDAY_RATE',
  'WEEKEND_RATE',
  'LAST_INVOICE_NUMBER'
];

let failures = 0;

required.forEach((key) => {
  if (!env[key]) {
    failures += 1;
    console.error(`missing - ${key}`);
  }
});

if (env.SPREADSHEET_ID && !/^[a-zA-Z0-9_-]+$/.test(env.SPREADSHEET_ID)) {
  failures += 1;
  console.error('invalid - SPREADSHEET_ID should look like a Google file id');
}

if (env.DRIVE_OUTPUT_FOLDER_ID && !/^[a-zA-Z0-9_-]+$/.test(env.DRIVE_OUTPUT_FOLDER_ID)) {
  failures += 1;
  console.error('invalid - DRIVE_OUTPUT_FOLDER_ID should look like a Google Drive folder id');
}

if (env.TELEGRAM_BOT_TOKEN && !/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN)) {
  failures += 1;
  console.error('invalid - TELEGRAM_BOT_TOKEN should look like a BotFather token');
}

['TELEGRAM_ALLOWED_CHAT_IDS', 'TELEGRAM_ADMIN_CHAT_IDS'].forEach((key) => {
  if (!env[key]) {
    return;
  }

  env[key].split(',').forEach((chatId) => {
    if (!/^-?\d+$/.test(chatId.trim())) {
      failures += 1;
      console.error(`invalid - ${key} contains a non-numeric chat id: ${chatId}`);
    }
  });
});

[
  'INVOICE_NUMBER_CELL',
  'PERIOD_START_CELL',
  'PERIOD_END_CELL',
  'MONDAY_CELL',
  'TUESDAY_CELL',
  'WEDNESDAY_CELL',
  'THURSDAY_CELL',
  'FRIDAY_CELL',
  'SATURDAY_CELL',
  'SUNDAY_CELL'
].forEach((key) => {
  if (env[key] && !/^[A-Z]+[1-9][0-9]*$/i.test(env[key])) {
    failures += 1;
    console.error(`invalid - ${key} must use A1 notation`);
  }
});

['WEEKDAY_RATE', 'WEEKEND_RATE', 'LAST_INVOICE_NUMBER'].forEach((key) => {
  if (env[key] && !Number.isFinite(Number(env[key]))) {
    failures += 1;
    console.error(`invalid - ${key} must be numeric`);
  }
});

if (env.INPUT_SHEET_NAME && /^\d+$/.test(env.INPUT_SHEET_NAME)) {
  console.log(`ok - INPUT_SHEET_NAME is a numeric gid: ${env.INPUT_SHEET_NAME}`);
}

if (env.INVOICE_SHEET_NAME && /^\d+$/.test(env.INVOICE_SHEET_NAME)) {
  console.log(`ok - INVOICE_SHEET_NAME is a numeric gid: ${env.INVOICE_SHEET_NAME}`);
}

if (env.PERIOD_START_CELL && env.PERIOD_START_CELL === env.PERIOD_END_CELL) {
  console.log(`ok - period uses one display cell: ${env.PERIOD_START_CELL}`);
}

if (failures === 0) {
  console.log('ok - .env structure');
} else {
  process.exitCode = 1;
}

function parseEnv(text) {
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
    const value = trimmed.slice(equalsIndex + 1).trim();
    result[key] = value.replace(/^['"]|['"]$/g, '');
    return result;
  }, {});
}
