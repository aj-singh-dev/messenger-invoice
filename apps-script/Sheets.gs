function openInvoiceSpreadsheet() {
  return SpreadsheetApp.openById(getRequiredProperty(CONFIG_KEYS.SPREADSHEET_ID));
}

function writeInvoiceToSheet(spreadsheet, invoice) {
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

function exportInvoicePdf(spreadsheet, invoice) {
  const spreadsheetId = getRequiredProperty(CONFIG_KEYS.SPREADSHEET_ID);
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
    .setName(buildInvoiceFilename(spreadsheet, invoice));
}

function buildInvoiceFilename(spreadsheet, invoice) {
  return [
    sanitizeFilename(spreadsheet.getName()),
    invoice.invoiceNumber
  ].join(' - ') + '.pdf';
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
