const CONFIG_KEYS = {
  TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
  TELEGRAM_WEBHOOK_SECRET: 'TELEGRAM_WEBHOOK_SECRET',
  TELEGRAM_ALLOWED_CHAT_IDS: 'TELEGRAM_ALLOWED_CHAT_IDS',
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  INPUT_SHEET_NAME: 'INPUT_SHEET_NAME',
  INVOICE_SHEET_NAME: 'INVOICE_SHEET_NAME',
  INVOICE_NUMBER_CELL: 'INVOICE_NUMBER_CELL',
  PERIOD_START_CELL: 'PERIOD_START_CELL',
  PERIOD_END_CELL: 'PERIOD_END_CELL',
  MONDAY_CELL: 'MONDAY_CELL',
  TUESDAY_CELL: 'TUESDAY_CELL',
  WEDNESDAY_CELL: 'WEDNESDAY_CELL',
  THURSDAY_CELL: 'THURSDAY_CELL',
  FRIDAY_CELL: 'FRIDAY_CELL',
  SATURDAY_CELL: 'SATURDAY_CELL',
  SUNDAY_CELL: 'SUNDAY_CELL',
  WEEKDAY_RATE: 'WEEKDAY_RATE',
  WEEKEND_RATE: 'WEEKEND_RATE',
  LAST_INVOICE_NUMBER: 'LAST_INVOICE_NUMBER'
};

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DAY_ALIASES = {
  mon: 'mon',
  monday: 'mon',
  tue: 'tue',
  tues: 'tue',
  tuesday: 'tue',
  wed: 'wed',
  weds: 'wed',
  wednesday: 'wed',
  thu: 'thu',
  thur: 'thu',
  thurs: 'thu',
  thursday: 'thu',
  fri: 'fri',
  friday: 'fri',
  sat: 'sat',
  saturday: 'sat',
  sun: 'sun',
  sunday: 'sun'
};

function doGet(e) {
  return jsonResponse({
    ok: true,
    service: 'telegram-invoice-bot'
  });
}

function doPost(e) {
  try {
    validateTelegramWebhook(e);

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Missing webhook POST body.');
    }

    const payload = JSON.parse(e.postData.contents);
    const message = extractTelegramMessage(payload);

    if (!message) {
      return jsonResponse({ ok: true, processed: 0 });
    }

    processInboundMessage(message);

    return jsonResponse({ ok: true, processed: 1 });
  } catch (error) {
    console.error(error.stack || error.message || error);
    return jsonResponse({ ok: false, error: String(error.message || error) });
  }
}

function processInboundMessage(message) {
  if (isDuplicateMessage(message.id)) {
    logInvoiceRun({ message: message, status: 'duplicate_ignored' });
    return;
  }

  markMessageProcessing(message.id);

  try {
    if (!isAllowedTelegramChat(message.chatId)) {
      throw new Error('This Telegram chat is not allowed to use this bot.');
    }

    const command = normalizeTelegramCommand(message.text);
    if (command === '/start') {
      sendTelegramText(message.chatId, buildStartMessage());
      markMessageProcessed(message.id);
      logInvoiceRun({ message: message, status: 'start_help_sent' });
      return;
    }

    if (command === '/id') {
      sendTelegramText(message.chatId, 'Telegram chat ID: ' + message.chatId);
      markMessageProcessed(message.id);
      logInvoiceRun({ message: message, status: 'chat_id_sent' });
      return;
    }

    const invoice = parseInvoiceRequest(message.text);

    if (!invoice.invoiceNumber) {
      invoice.invoiceNumber = reserveNextInvoiceNumber();
      invoice.generatedInvoiceNumber = true;
    }

    writeInvoiceToSheet(invoice);

    SpreadsheetApp.flush();

    const pdfBlob = exportInvoicePdf(invoice);
    const telegramResult = sendTelegramDocument(message.chatId, pdfBlob);

    markMessageProcessed(message.id);
    logInvoiceRun({
      message: message,
      invoice: invoice,
      status: 'sent',
      telegramMessageId: telegramResult && telegramResult.result ? telegramResult.result.message_id : '',
      filename: pdfBlob.getName()
    });
  } catch (error) {
    clearMessageProcessing(message.id);
    logInvoiceRun({
      message: message,
      status: 'error',
      error: String(error.message || error)
    });
    try {
      sendTelegramText(message.chatId, 'I could not create the invoice: ' + String(error.message || error));
    } catch (sendError) {
      console.error('Failed to send Telegram error message: ' + String(sendError.message || sendError));
    }
    throw error;
  }
}

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
  const allowed = getOptionalProperty(CONFIG_KEYS.TELEGRAM_ALLOWED_CHAT_IDS);
  if (!allowed) {
    return true;
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

function normalizeTelegramCommand(text) {
  const firstToken = String(text || '').trim().split(/\s+/)[0].toLowerCase();
  return firstToken.replace(/@[\w_]+$/, '');
}

function buildStartMessage() {
  return [
    'Paste or forward an invoice request in this format:',
    '',
    'Invoice week 2026-05-11 to 2026-05-17',
    'Worked: Mon Tue Wed Thu Fri Sat Sun',
    '',
    'Optional invoice number:',
    '',
    'Invoice 1042',
    'Week 2026-05-11 to 2026-05-17',
    'Worked: Mon Wed Sat Sun',
    '',
    'Send /id to see this chat ID for allowlisting.'
  ].join('\n');
}

function parseInvoiceRequest(text) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    throw new Error('Message was empty.');
  }

  const invoiceNumber = extractInvoiceNumber(normalized);
  const dateRange = extractDateRange(normalized);
  const workedDays = extractWorkedDays(normalized);

  if (!dateRange.startDate || !dateRange.endDate) {
    throw new Error('Could not find a valid date range. Use: Invoice week YYYY-MM-DD to YYYY-MM-DD.');
  }

  if (workedDays.length === 0) {
    throw new Error('Could not find worked days. Use: Worked: Mon Tue Wed Thu Fri Sat Sun.');
  }

  if (dateRange.endDate.getTime() < dateRange.startDate.getTime()) {
    throw new Error('End date cannot be before start date.');
  }

  return {
    invoiceNumber: invoiceNumber,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    workedDays: workedDays
  };
}

function extractInvoiceNumber(text) {
  const match = text.match(/\binvoice\s*(?:number|no\.?|#)?\s*[:#-]?\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function extractDateRange(text) {
  const isoRange = text.match(/\b(\d{4}-\d{2}-\d{2})\b\s*(?:to|-|until|through)\s*\b(\d{4}-\d{2}-\d{2})\b/i);
  if (isoRange) {
    return {
      startDate: parseIsoDate(isoRange[1]),
      endDate: parseIsoDate(isoRange[2])
    };
  }

  const slashRange = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b\s*(?:to|-|until|through)\s*\b(\d{1,2}\/\d{1,2}\/\d{4})\b/i);
  if (slashRange) {
    return {
      startDate: parseUkSlashDate(slashRange[1]),
      endDate: parseUkSlashDate(slashRange[2])
    };
  }

  return { startDate: null, endDate: null };
}

function extractWorkedDays(text) {
  const workedLine = text.match(/(?:worked|days|weekdays|shifts)\s*[:=-]?\s*([^\n]+)/i);
  const source = workedLine ? workedLine[1] : text;
  const found = {};

  source
    .toLowerCase()
    .replace(/[,/&+]/g, ' ')
    .split(/\s+/)
    .forEach(function(token) {
      const cleanToken = token.replace(/[^a-z]/g, '');
      const day = DAY_ALIASES[cleanToken];
      if (day) {
        found[day] = true;
      }
    });

  return DAY_ORDER.filter(function(day) {
    return Boolean(found[day]);
  });
}

function parseIsoDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error('Invalid ISO date: ' + value);
  }

  return createDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function parseUkSlashDate(value) {
  const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error('Invalid UK date: ' + value);
  }

  return createDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

function createDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Invalid date: ' + [year, month, day].join('-'));
  }

  return date;
}

function getNextInvoiceNumber() {
  const lastInvoiceNumber = Number(getRequiredProperty(CONFIG_KEYS.LAST_INVOICE_NUMBER));
  if (!Number.isFinite(lastInvoiceNumber)) {
    throw new Error('LAST_INVOICE_NUMBER must be a number.');
  }

  return lastInvoiceNumber + 1;
}

function reserveNextInvoiceNumber() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const invoiceNumber = getNextInvoiceNumber();
    setScriptProperty(CONFIG_KEYS.LAST_INVOICE_NUMBER, String(invoiceNumber));
    return invoiceNumber;
  } finally {
    lock.releaseLock();
  }
}

function writeInvoiceToSheet(invoice) {
  const spreadsheet = SpreadsheetApp.openById(getRequiredProperty(CONFIG_KEYS.SPREADSHEET_ID));
  const inputSheetIdentifier = getRequiredProperty(CONFIG_KEYS.INPUT_SHEET_NAME);
  const sheet = getSheetByNameOrId(spreadsheet, inputSheetIdentifier);

  if (!sheet) {
    throw new Error('Input sheet not found by name or gid: ' + inputSheetIdentifier);
  }

  sheet.getRange(getRequiredProperty(CONFIG_KEYS.INVOICE_NUMBER_CELL)).setValue(invoice.invoiceNumber);
  writePeriodToSheet(sheet, invoice);
  writeWorkedDayRatesToSheet(sheet, invoice);
}

function writePeriodToSheet(sheet, invoice) {
  const startCell = getRequiredProperty(CONFIG_KEYS.PERIOD_START_CELL);
  const endCell = getRequiredProperty(CONFIG_KEYS.PERIOD_END_CELL);

  if (startCell === endCell) {
    sheet.getRange(startCell).setValue(formatInvoicePeriod(invoice.startDate, invoice.endDate));
    return;
  }

  sheet.getRange(startCell).setValue(invoice.startDate);
  sheet.getRange(endCell).setValue(invoice.endDate);
}

function writeWorkedDayRatesToSheet(sheet, invoice) {
  const dayCells = {
    mon: CONFIG_KEYS.MONDAY_CELL,
    tue: CONFIG_KEYS.TUESDAY_CELL,
    wed: CONFIG_KEYS.WEDNESDAY_CELL,
    thu: CONFIG_KEYS.THURSDAY_CELL,
    fri: CONFIG_KEYS.FRIDAY_CELL,
    sat: CONFIG_KEYS.SATURDAY_CELL,
    sun: CONFIG_KEYS.SUNDAY_CELL
  };

  Object.keys(dayCells).forEach(function(day) {
    const value = invoice.workedDays.indexOf(day) !== -1 ? getRateForDay(day) : '';
    sheet.getRange(getRequiredProperty(dayCells[day])).setValue(value);
  });
}

function getRateForDay(day) {
  const rateProperty = day === 'sat' || day === 'sun' ? CONFIG_KEYS.WEEKEND_RATE : CONFIG_KEYS.WEEKDAY_RATE;
  const rate = Number(getRequiredProperty(rateProperty));

  if (!Number.isFinite(rate)) {
    throw new Error(rateProperty + ' must be a number.');
  }

  return rate;
}

function exportInvoicePdf(invoice) {
  const spreadsheetId = getRequiredProperty(CONFIG_KEYS.SPREADSHEET_ID);
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const invoiceSheetIdentifier = getRequiredProperty(CONFIG_KEYS.INVOICE_SHEET_NAME);
  const invoiceSheet = getSheetByNameOrId(spreadsheet, invoiceSheetIdentifier);

  if (!invoiceSheet) {
    throw new Error('Invoice sheet not found by name or gid: ' + invoiceSheetIdentifier);
  }

  const exportUrl = [
    'https://docs.google.com/spreadsheets/d/',
    encodeURIComponent(spreadsheetId),
    '/export?format=pdf',
    '&gid=',
    invoiceSheet.getSheetId(),
    '&size=A4',
    '&portrait=true',
    '&fitw=true',
    '&sheetnames=false',
    '&printtitle=false',
    '&pagenumbers=false',
    '&gridlines=false',
    '&fzr=false',
    '&top_margin=0.50',
    '&bottom_margin=0.50',
    '&left_margin=0.50',
    '&right_margin=0.50'
  ].join('');

  const response = UrlFetchApp.fetch(exportUrl, {
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('PDF export failed with HTTP ' + status + ': ' + response.getContentText());
  }

  return response
    .getBlob()
    .setContentType('application/pdf')
    .setName(buildInvoiceFilename(invoice));
}

function buildInvoiceFilename(invoice) {
  return [
    'Invoice',
    invoice.invoiceNumber,
    formatDateForFilename(invoice.startDate),
    'to',
    formatDateForFilename(invoice.endDate)
  ].join('-') + '.pdf';
}

function formatDateForFilename(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatInvoicePeriod(startDate, endDate) {
  return Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'dd/MM/yyyy') +
    ' - ' +
    Utilities.formatDate(endDate, Session.getScriptTimeZone(), 'dd/MM/yyyy');
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

function getTelegramApiUrl(method) {
  return 'https://api.telegram.org/bot' +
    getRequiredProperty(CONFIG_KEYS.TELEGRAM_BOT_TOKEN) +
    '/' +
    method;
}

function isDuplicateMessage(messageId) {
  if (!messageId) {
    return false;
  }

  return CacheService.getScriptCache().get(cacheKeyForMessage(messageId)) === '1';
}

function markMessageProcessing(messageId) {
  if (!messageId) {
    return;
  }

  CacheService.getScriptCache().put(cacheKeyForMessage(messageId), '1', 300);
}

function markMessageProcessed(messageId) {
  if (!messageId) {
    return;
  }

  CacheService.getScriptCache().put(cacheKeyForMessage(messageId), '1', 21600);
}

function clearMessageProcessing(messageId) {
  if (!messageId) {
    return;
  }

  CacheService.getScriptCache().remove(cacheKeyForMessage(messageId));
}

function cacheKeyForMessage(messageId) {
  return 'tg_msg_' + messageId;
}

function logInvoiceRun(entry) {
  try {
    const spreadsheetId = getOptionalProperty(CONFIG_KEYS.SPREADSHEET_ID);
    if (!spreadsheetId) {
      console.log(JSON.stringify(entry));
      return;
    }

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = getOrCreateSheet(spreadsheet, 'Invoice Runs');

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp',
        'Status',
        'Sender',
        'Message ID',
        'Raw Text',
        'Invoice Number',
        'Start Date',
        'End Date',
        'Worked Days',
        'Filename',
        'Telegram Message ID',
        'Error'
      ]);
    }

    const invoice = entry.invoice || {};
    const message = entry.message || {};

    sheet.appendRow([
      new Date(),
      entry.status || '',
      message.from || '',
      message.id || '',
      message.text || '',
      invoice.invoiceNumber || '',
      invoice.startDate || '',
      invoice.endDate || '',
      invoice.workedDays ? invoice.workedDays.join(',') : '',
      entry.filename || '',
      entry.telegramMessageId || '',
      entry.error || ''
    ]);
  } catch (error) {
    console.error('Failed to write invoice log: ' + String(error.message || error));
  }
}

function getOrCreateSheet(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function getSheetByNameOrId(spreadsheet, identifier) {
  const byName = spreadsheet.getSheetByName(identifier);
  if (byName) {
    return byName;
  }

  if (/^\d+$/.test(String(identifier))) {
    const sheetId = Number(identifier);
    const sheets = spreadsheet.getSheets();
    for (let index = 0; index < sheets.length; index += 1) {
      if (sheets[index].getSheetId() === sheetId) {
        return sheets[index];
      }
    }
  }

  return null;
}

function getRequiredProperty(key) {
  const value = getOptionalProperty(key);
  if (!value) {
    throw new Error('Missing script property: ' + key);
  }

  return value;
}

function getOptionalProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setScriptProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function parseJsonResponse(response, label) {
  const status = response.getResponseCode();
  const text = response.getContentText();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(label + ' returned non-JSON HTTP ' + status + ': ' + text);
  }

  if (status < 200 || status >= 300 || data.ok === false) {
    throw new Error(label + ' failed with HTTP ' + status + ': ' + text);
  }

  return data;
}

function jsonResponse(value) {
  return HtmlService.createHtmlOutput(JSON.stringify(value));
}

function testParseInvoiceRequest() {
  const parsed = parseInvoiceRequest('Invoice week 2026-05-11 to 2026-05-17\nWorked: Mon Tue Wed Thu Fri');
  console.log(JSON.stringify({
    invoiceNumber: parsed.invoiceNumber,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    workedDays: parsed.workedDays
  }));
}
