function resolveInvoiceNumber(spreadsheet, invoice) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const indexSheet = getOrCreateInvoiceIndexSheet(spreadsheet);
    const existing = findInvoiceIndexEntry(indexSheet, invoice.startDate, invoice.endDate);

    if (existing) {
      invoice.invoiceNumber = existing.invoiceNumber;
      touchInvoiceIndexEntry(indexSheet, existing.row);
      return;
    }

    if (invoice.invoiceNumber) {
      upsertInvoiceIndexEntry(indexSheet, invoice);
      syncLastInvoiceNumberAtLeast(invoice.invoiceNumber);
      return;
    }

    const latest = getLatestInvoiceIndexEntry(indexSheet);
    if (!latest) {
      throw new Error(
        'Invoice number is missing and the invoice index is empty. Include the invoice number once, for example: Invoice 4.'
      );
    }

    if (invoice.startDate.getTime() < latest.startDate.getTime()) {
      throw new Error(
        'Invoice number is missing for an older unindexed week. Include the invoice number once, for example: Invoice 4.'
      );
    }

    invoice.invoiceNumber = reserveNextInvoiceNumber();
    invoice.generatedInvoiceNumber = true;
    appendInvoiceIndexEntry(indexSheet, invoice);
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateInvoiceIndexSheet(spreadsheet) {
  const sheet = getOrCreateSheet(spreadsheet, INVOICE_INDEX_SHEET_NAME);
  ensureInvoiceIndexHeader(sheet);
  return sheet;
}

function ensureInvoiceIndexHeader(sheet) {
  if (sheet.getLastRow() > 0) {
    return;
  }

  sheet.appendRow([
    'Period Start',
    'Period End',
    'Invoice Number',
    'Created At',
    'Updated At'
  ]);
}

function findInvoiceIndexEntry(sheet, startDate, endDate) {
  const entries = readInvoiceIndexEntries(sheet);
  const startKey = dateKey(startDate);
  const endKey = dateKey(endDate);

  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].startKey === startKey && entries[index].endKey === endKey) {
      return entries[index];
    }
  }

  return null;
}

function getLatestInvoiceIndexEntry(sheet) {
  const entries = readInvoiceIndexEntries(sheet);
  if (entries.length === 0) {
    return null;
  }

  entries.sort(function(a, b) {
    return a.startDate.getTime() - b.startDate.getTime();
  });

  return entries[entries.length - 1];
}

function upsertInvoiceIndexEntry(sheet, invoice) {
  const existing = findInvoiceIndexEntry(sheet, invoice.startDate, invoice.endDate);
  if (existing) {
    sheet.getRange(existing.row, INVOICE_INDEX_COLUMNS.INVOICE_NUMBER).setValue(invoice.invoiceNumber);
    touchInvoiceIndexEntry(sheet, existing.row);
    return;
  }

  appendInvoiceIndexEntry(sheet, invoice);
}

function appendInvoiceIndexEntry(sheet, invoice) {
  const now = new Date();
  sheet.appendRow([
    invoice.startDate,
    invoice.endDate,
    invoice.invoiceNumber,
    now,
    now
  ]);
}

function touchInvoiceIndexEntry(sheet, row) {
  sheet.getRange(row, INVOICE_INDEX_COLUMNS.UPDATED_AT).setValue(new Date());
}

function readInvoiceIndexEntries(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const entries = [];

  values.forEach(function(row, index) {
    const startDate = normalizeSheetDate(row[INVOICE_INDEX_COLUMNS.PERIOD_START - 1]);
    const endDate = normalizeSheetDate(row[INVOICE_INDEX_COLUMNS.PERIOD_END - 1]);
    const invoiceNumber = Number(row[INVOICE_INDEX_COLUMNS.INVOICE_NUMBER - 1]);

    if (!startDate || !endDate || !Number.isFinite(invoiceNumber)) {
      return;
    }

    entries.push({
      row: index + 2,
      startDate: startDate,
      endDate: endDate,
      startKey: dateKey(startDate),
      endKey: dateKey(endDate),
      invoiceNumber: invoiceNumber
    });
  });

  return entries;
}

function normalizeSheetDate(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return createDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'string' && value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return parseIsoDate(value);
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
      return parseUkSlashDate(value);
    }
  }

  return null;
}

function getNextInvoiceNumber() {
  const lastInvoiceNumber = Number(getRequiredProperty(CONFIG_KEYS.LAST_INVOICE_NUMBER));
  if (!Number.isFinite(lastInvoiceNumber)) {
    throw new Error('LAST_INVOICE_NUMBER must be a number.');
  }

  return lastInvoiceNumber + 1;
}

function reserveNextInvoiceNumber() {
  const invoiceNumber = getNextInvoiceNumber();
  setScriptProperty(CONFIG_KEYS.LAST_INVOICE_NUMBER, String(invoiceNumber));
  return invoiceNumber;
}

function syncLastInvoiceNumberAtLeast(invoiceNumber) {
  const current = Number(getRequiredProperty(CONFIG_KEYS.LAST_INVOICE_NUMBER));
  if (!Number.isFinite(current)) {
    throw new Error('LAST_INVOICE_NUMBER must be a number.');
  }

  if (invoiceNumber > current) {
    setScriptProperty(CONFIG_KEYS.LAST_INVOICE_NUMBER, String(invoiceNumber));
  }
}
