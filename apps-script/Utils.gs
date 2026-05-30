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

function formatDateForFilename(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatInvoicePeriod(startDate, endDate) {
  return Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'dd/MM/yyyy') +
    ' - ' +
    Utilities.formatDate(endDate, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return [year, month, day].join('-');
}
