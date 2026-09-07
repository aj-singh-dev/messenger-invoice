function extractTelegramMessage(payload) {
  const update = payload || {};
  const telegramMessage = update.message;

  if (!telegramMessage || !telegramMessage.chat || telegramMessage.chat.id === undefined) {
    return null;
  }

  const text = telegramMessage.text || telegramMessage.caption || '';
  if (!text) {
    return null;
  }

  return {
    id: String(update.update_id) + ':' + String(telegramMessage.message_id || ''),
    updateId: update.update_id,
    messageId: telegramMessage.message_id,
    from: telegramMessage.from && telegramMessage.from.id !== undefined ? String(telegramMessage.from.id) : '',
    chatId: String(telegramMessage.chat.id),
    timestamp: telegramMessage.date || '',
    text: text
  };
}

function extractTelegramCallbackQuery(payload) {
  const update = payload || {};
  const callbackQuery = update.callback_query;

  if (!callbackQuery || !callbackQuery.message || !callbackQuery.message.chat) {
    return null;
  }

  return {
    id: String(update.update_id) + ':' + String(callbackQuery.id || ''),
    updateId: update.update_id,
    callbackQueryId: callbackQuery.id,
    from: callbackQuery.from && callbackQuery.from.id !== undefined ? String(callbackQuery.from.id) : '',
    chatId: String(callbackQuery.message.chat.id),
    messageId: callbackQuery.message.message_id,
    data: callbackQuery.data || ''
  };
}

function validateTelegramWebhook(e) {
  const expectedSecret = getOptionalProperty(CONFIG_KEYS.TELEGRAM_WEBHOOK_SECRET);
  if (!expectedSecret) {
    return;
  }

  const headers = e && e.headers ? e.headers : {};
  const actualSecret =
    headers['X-Telegram-Bot-Api-Secret-Token'] ||
    headers['x-telegram-bot-api-secret-token'] ||
    (e && e.parameter ? e.parameter.telegram_secret : '');

  if (!actualSecret) {
    throw new Error('Missing Telegram webhook secret.');
  }

  if (actualSecret !== expectedSecret) {
    throw new Error('Invalid Telegram webhook secret.');
  }
}

function isAllowedTelegramChat(chatId) {
  if (isAdminTelegramChat(chatId)) {
    return true;
  }

  const allowed = getOptionalProperty(CONFIG_KEYS.TELEGRAM_ALLOWED_CHAT_IDS);
  if (!allowed) {
    return false;
  }

  const normalizedChatId = String(chatId);
  return allowed
    .split(',')
    .map(function(value) {
      return value.trim();
    })
    .filter(Boolean)
    .indexOf(normalizedChatId) !== -1;
}

function isAdminTelegramChat(chatId) {
  const admins = getOptionalProperty(CONFIG_KEYS.TELEGRAM_ADMIN_CHAT_IDS);
  if (!admins) {
    return false;
  }

  const normalizedChatId = String(chatId);
  return admins
    .split(',')
    .map(function(value) {
      return value.trim();
    })
    .filter(Boolean)
    .indexOf(normalizedChatId) !== -1;
}

function normalizeTelegramCommand(text) {
  const firstToken = String(text || '').trim().split(/\s+/)[0].toLowerCase();
  return firstToken.replace(/@[\w_]+$/, '');
}

function buildStartMessage() {
  return [
    'Paste or forward an invoice request in this format:',
    '',
    'Hi,',
    '18/05 OFF',
    '19/05 OFF',
    '20/05 10:00',
    '21/05 10:00',
    '22/05 11:00',
    '23/05 10:00',
    '24/05 11:00',
    'PLEASE CONFIRM',
    '',
    'If this is the first message for an older week, include the invoice number once:',
    '',
    'Invoice 4',
    '18/05 OFF',
    '19/05 OFF',
    '20/05 10:00',
    '',
    'Send /id to see this chat ID for allowlisting.',
    'Send /email name@example.com to set the email recipient.',
    'Send /reminder on to get a weekly reminder.',
    'Send /version to see the deployed bot version.',
    'Admins can send /auth to get a Google authorization link.'
  ].join('\n');
}

function sendTelegramDocument(chatId, pdfBlob) {
  const url = getTelegramApiUrl('sendDocument');

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: {
      chat_id: chatId,
      document: pdfBlob,
      caption: pdfBlob.getName()
    },
    muteHttpExceptions: true
  });

  return parseJsonResponse(response, 'Telegram document send');
}

function sendTelegramText(chatId, text) {
  const url = getTelegramApiUrl('sendMessage');

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: text
    }),
    muteHttpExceptions: true
  });

  return parseJsonResponse(response, 'Telegram text send');
}

function sendTelegramTextWithInlineKeyboard(chatId, text, inlineKeyboard) {
  const url = getTelegramApiUrl('sendMessage');

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    }),
    muteHttpExceptions: true
  });

  return parseJsonResponse(response, 'Telegram inline message send');
}

function answerTelegramCallbackQuery(callbackQueryId, text) {
  const url = getTelegramApiUrl('answerCallbackQuery');

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text
    }),
    muteHttpExceptions: true
  });

  return parseJsonResponse(response, 'Telegram callback answer');
}

function editTelegramMessageText(chatId, messageId, text) {
  const url = getTelegramApiUrl('editMessageText');

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text
    }),
    muteHttpExceptions: true
  });

  return parseJsonResponse(response, 'Telegram message edit');
}

function sendTelegramChatAction(chatId, action) {
  const url = getTelegramApiUrl('sendChatAction');

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      action: action
    }),
    muteHttpExceptions: true
  });

  return parseJsonResponse(response, 'Telegram chat action send');
}

function getTelegramApiUrl(method) {
  return 'https://api.telegram.org/bot' +
    getRequiredProperty(CONFIG_KEYS.TELEGRAM_BOT_TOKEN) +
    '/' +
    method;
}
