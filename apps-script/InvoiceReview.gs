function createInvoiceReviewForMessage(message) {
  const invoice = parseInvoiceRequest(message.text);
  assertInvoiceReadyForImmediateGeneration(invoice);
  invoice.manualInvoiceNumber = Boolean(invoice.invoiceNumber);

  const spreadsheet = openInvoiceSpreadsheet();
  previewInvoiceNumber(spreadsheet, invoice);

  const token = createInvoiceReviewToken(message);
  const review = {
    token: token,
    chatId: String(message.chatId),
    sourceMessageId: message.id,
    sourceText: message.text,
    invoice: serializeInvoiceReviewInvoice(invoice),
    createdAt: new Date().toISOString()
  };

  storeInvoiceReview(review);

  const result = sendTelegramTextWithInlineKeyboard(
    message.chatId,
    buildInvoiceReviewMessage(invoice),
    buildInvoiceReviewKeyboard(token)
  );
  review.reviewMessageId = result && result.result ? result.result.message_id : '';
  storeInvoiceReview(review);

  return {
    invoice: invoice,
    token: token,
    messageId: review.reviewMessageId
  };
}

function handleInvoiceReviewCreateCallback(callbackQuery) {
  const review = getInvoiceReviewFromCallback(callbackQuery);
  const invoice = deserializeInvoiceReviewInvoice(review.invoice);
  clearInvoiceReviewEdit(callbackQuery.chatId);

  editTelegramMessageText(
    callbackQuery.chatId,
    callbackQuery.messageId,
    'Creating Invoice ' + invoice.invoiceNumber + '...'
  );

  createAndSendInvoiceFromReview(callbackQuery.chatId, invoice);
  clearInvoiceReview(review);
}

function handleInvoiceReviewCancelCallback(callbackQuery) {
  const review = getInvoiceReviewFromCallback(callbackQuery);
  const invoice = deserializeInvoiceReviewInvoice(review.invoice);
  clearInvoiceReviewEdit(callbackQuery.chatId);

  editTelegramMessageText(
    callbackQuery.chatId,
    callbackQuery.messageId,
    'Cancelled.\n\nInvoice ' + invoice.invoiceNumber + ' was not created.'
  );

  clearInvoiceReview(review);
}

function handleInvoiceReviewEditDayCallback(callbackQuery) {
  const review = getInvoiceReviewFromCallback(callbackQuery);
  clearInvoiceReviewEdit(callbackQuery.chatId);

  editTelegramMessageTextWithInlineKeyboard(
    callbackQuery.chatId,
    callbackQuery.messageId,
    buildInvoiceReviewMessage(deserializeInvoiceReviewInvoice(review.invoice)),
    buildInvoiceReviewDayKeyboard(review.token)
  );
}

function handleInvoiceReviewChangeCallback(callbackQuery) {
  const review = getInvoiceReviewFromCallback(callbackQuery);
  clearInvoiceReviewEdit(callbackQuery.chatId);

  editTelegramMessageTextWithInlineKeyboard(
    callbackQuery.chatId,
    callbackQuery.messageId,
    buildInvoiceReviewMessage(deserializeInvoiceReviewInvoice(review.invoice)),
    buildInvoiceReviewChangeKeyboard(review.token)
  );
}

function handleInvoiceReviewBackCallback(callbackQuery) {
  const review = getInvoiceReviewFromCallback(callbackQuery);
  clearInvoiceReviewEdit(callbackQuery.chatId);

  editTelegramMessageTextWithInlineKeyboard(
    callbackQuery.chatId,
    callbackQuery.messageId,
    buildInvoiceReviewMessage(deserializeInvoiceReviewInvoice(review.invoice)),
    buildInvoiceReviewKeyboard(review.token)
  );
}

function handleInvoiceReviewSelectDayCallback(callbackQuery) {
  const payload = parseInvoiceReviewCallbackData(callbackQuery.data);
  const review = loadInvoiceReview(callbackQuery.chatId, payload.token);
  if (!review) {
    throw new Error('This invoice review has expired. Please paste the rota again.');
  }

  const day = payload.day;
  const invoice = deserializeInvoiceReviewInvoice(review.invoice);
  const entry = getRosterEntriesByDay(invoice)[day];
  const current = entry ? formatInvoiceReviewEntry(entry, day) :
    ((invoice.workedDays || []).indexOf(day) !== -1 ? 'worked' : 'OFF');

  storeInvoiceReviewEdit({
    chatId: callbackQuery.chatId,
    token: review.token,
    type: 'day',
    day: day
  });

  sendTelegramForceReply(
    callbackQuery.chatId,
    [
      getDayLabel(day) + ' is currently ' + current + '.',
      '',
      'Reply with OFF, a time like 05:00, or an amount like 75.'
    ].join('\n')
  );
}

function handleInvoiceReviewEditInvoiceNumberCallback(callbackQuery) {
  const review = getInvoiceReviewFromCallback(callbackQuery);
  const invoice = deserializeInvoiceReviewInvoice(review.invoice);
  clearInvoiceReviewEdit(callbackQuery.chatId);

  storeInvoiceReviewEdit({
    chatId: callbackQuery.chatId,
    token: review.token,
    type: 'invoice_number'
  });

  sendTelegramForceReply(
    callbackQuery.chatId,
    [
      'Invoice number is currently ' + invoice.invoiceNumber + '.',
      '',
      'Reply with the invoice number to use.'
    ].join('\n')
  );
}

function handleInvoiceReviewShiftWeekCallback(callbackQuery, dayOffset) {
  const review = getInvoiceReviewFromCallback(callbackQuery);
  const invoice = deserializeInvoiceReviewInvoice(review.invoice);
  clearInvoiceReviewEdit(callbackQuery.chatId);

  shiftInvoiceReviewWeek(invoice, dayOffset);
  previewInvoiceNumber(openInvoiceSpreadsheet(), invoice);
  review.invoice = serializeInvoiceReviewInvoice(invoice);
  storeInvoiceReview(review);

  editTelegramMessageTextWithInlineKeyboard(
    callbackQuery.chatId,
    callbackQuery.messageId,
    buildInvoiceReviewMessage(invoice),
    buildInvoiceReviewKeyboard(review.token)
  );
}

function handlePendingInvoiceReviewEditMessage(message) {
  const edit = loadInvoiceReviewEdit(message.chatId);
  if (!edit) {
    return false;
  }

  const review = loadInvoiceReview(message.chatId, edit.token);
  if (!review) {
    clearInvoiceReviewEdit(message.chatId);
    sendTelegramText(message.chatId, 'This invoice review has expired. Please paste the rota again.');
    return true;
  }

  const invoice = deserializeInvoiceReviewInvoice(review.invoice);
  let changed = true;
  if (edit.type === 'invoice_number') {
    if (!isInvoiceReviewInvoiceNumberReply(message.text)) {
      clearInvoiceReviewEdit(message.chatId);
      if (isLikelyNewInvoiceRequestMessage(message.text)) {
        return false;
      }

      sendTelegramText(message.chatId, 'Reply with just the invoice number, for example 18.');
      return true;
    }

    changed = updateInvoiceReviewInvoiceNumber(invoice, message.text);
  } else {
    updateInvoiceReviewDay(invoice, edit.day, message.text);
  }

  review.invoice = serializeInvoiceReviewInvoice(invoice);
  storeInvoiceReview(review);
  clearInvoiceReviewEdit(message.chatId);

  if (changed && review.reviewMessageId) {
    editTelegramMessageTextWithInlineKeyboard(
      message.chatId,
      review.reviewMessageId,
      buildInvoiceReviewMessage(invoice),
      buildInvoiceReviewKeyboard(review.token)
    );
  }

  sendTelegramText(message.chatId, edit.type === 'invoice_number' ?
    (changed ? 'Updated invoice number.' : 'Invoice number is already ' + invoice.invoiceNumber + '.') :
    'Updated ' + getDayLabel(edit.day) + '.');
  return true;
}

function createAndSendInvoiceFromReview(chatId, invoice) {
  sendTelegramChatAction(chatId, 'typing');

  const spreadsheet = openInvoiceSpreadsheet();
  if (invoice.generatedInvoiceNumber) {
    invoice.invoiceNumber = null;
  }
  resolveInvoiceNumber(spreadsheet, invoice);
  writeInvoiceToSheet(spreadsheet, invoice);

  SpreadsheetApp.flush();

  sendTelegramChatAction(chatId, 'upload_document');

  const pdfBlob = exportInvoicePdf(spreadsheet, invoice);
  saveInvoicePdf(spreadsheet, invoice, pdfBlob);
  sendTelegramChatAction(chatId, 'upload_document');
  const telegramResult = sendTelegramDocument(chatId, pdfBlob);
  // sendInvoiceSuccessSummary(chatId, invoice, pdfBlob.getName());
  sendInvoiceUncertainStatusNote(chatId, invoice);
  sendDelayedEmailOffer(chatId, invoice);

  logInvoiceRun({
    message: {
      chatId: chatId,
      id: 'review:' + dateKey(invoice.startDate) + ':' + dateKey(invoice.endDate),
      text: ''
    },
    invoice: invoice,
    status: 'sent',
    telegramMessageId: telegramResult && telegramResult.result ? telegramResult.result.message_id : '',
    filename: pdfBlob.getName()
  });
}

function getInvoiceReviewFromCallback(callbackQuery) {
  const payload = parseInvoiceReviewCallbackData(callbackQuery.data);
  const review = loadInvoiceReview(callbackQuery.chatId, payload.token);

  if (!review) {
    throw new Error('This invoice review has expired. Please paste the rota again.');
  }

  return review;
}

function updateInvoiceReviewDay(invoice, day, value) {
  const entry = parseInvoiceReviewDayValue(invoice, day, value);
  const rosterEntries = (invoice.rosterEntries || []).filter(function(existingEntry) {
    return existingEntry.weekday !== day;
  });

  rosterEntries.push(entry);
  rosterEntries.sort(function(a, b) {
    return a.date.getTime() - b.date.getTime();
  });

  invoice.rosterEntries = rosterEntries;
  invoice.workedDays = DAY_ORDER.filter(function(dayKey) {
    return rosterEntries.some(function(rosterEntry) {
      return rosterEntry.weekday === dayKey && rosterEntry.worked;
    });
  });
}

function updateInvoiceReviewInvoiceNumber(invoice, value) {
  const match = String(value || '').trim().match(/^\d+$/);
  if (!match) {
    throw new Error('Reply with the invoice number to use.');
  }

  const invoiceNumber = Number(match[0]);
  if (!Number.isFinite(invoiceNumber) || invoiceNumber <= 0) {
    throw new Error('Invoice number must be greater than zero.');
  }

  if (Number(invoice.invoiceNumber) === invoiceNumber && invoice.manualInvoiceNumber) {
    return false;
  }

  invoice.invoiceNumber = invoiceNumber;
  invoice.generatedInvoiceNumber = false;
  invoice.manualInvoiceNumber = true;
  previewInvoiceNumber(openInvoiceSpreadsheet(), invoice);
  return true;
}

function isInvoiceReviewInvoiceNumberReply(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function isLikelyNewInvoiceRequestMessage(value) {
  try {
    parseInvoiceRequest(String(value || ''));
    return true;
  } catch (error) {
    return false;
  }
}

function shiftInvoiceReviewWeek(invoice, dayOffset) {
  invoice.startDate = addDays(invoice.startDate, dayOffset);
  invoice.endDate = addDays(invoice.endDate, dayOffset);
  invoice.indexRow = null;
  invoice.driveFileId = '';
  invoice.driveFilename = '';

  if (!invoice.manualInvoiceNumber) {
    invoice.invoiceNumber = null;
  }

  invoice.rosterEntries = (invoice.rosterEntries || []).map(function(entry) {
    entry.date = addDays(entry.date, dayOffset);
    entry.weekday = dayKeyForDate(entry.date);
    return entry;
  });

  invoice.workedDays = DAY_ORDER.filter(function(dayKey) {
    return (invoice.rosterEntries || []).some(function(entry) {
      return entry.weekday === dayKey && entry.worked;
    });
  });
}

function parseInvoiceReviewDayValue(invoice, day, value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error('Reply with OFF, a time like 05:00, or an amount like 75.');
  }

  const date = addDays(invoice.startDate, DAY_ORDER.indexOf(day));
  const amountOnly = normalized.match(/^(?:£\s*)?(\d+(?:\.\d{1,2})?)$/);
  if (amountOnly) {
    return {
      date: date,
      weekday: day,
      rawStatus: 'worked',
      worked: true,
      shiftTime: '',
      amountOverride: Number(amountOnly[1]),
      uncertain: false
    };
  }

  const parsedStatus = parseRosterStatus(normalized);
  return {
    date: date,
    weekday: day,
    rawStatus: normalized,
    worked: parsedStatus.worked,
    shiftTime: parsedStatus.shiftTime,
    amountOverride: parsedStatus.amountOverride,
    uncertain: parsedStatus.uncertain
  };
}

function buildInvoiceReviewMessage(invoice) {
  return [
    'Please check this invoice before I create the PDF.',
    '',
    'Invoice: ' + invoice.invoiceNumber,
    'Week: ' + formatFriendlyDateRange(invoice.startDate, invoice.endDate),
    '',
    buildInvoiceReviewDayLines(invoice).join('\n'),
    '',
    'Total: £' + formatMoneyForTelegram(calculateInvoiceReviewTotal(invoice))
  ].join('\n');
}

function buildInvoiceReviewDayLines(invoice) {
  const entriesByDay = getRosterEntriesByDay(invoice);

  return DAY_ORDER.map(function(day) {
    const entry = entriesByDay[day];
    const label = getDayLabel(day);

    if (entry) {
      return label + ': ' + formatInvoiceReviewEntry(entry, day);
    }

    if ((invoice.workedDays || []).indexOf(day) !== -1) {
      return label + ': worked - £' + formatMoneyForTelegram(getDefaultDayAmount(day));
    }

    return label + ': OFF';
  });
}

function formatInvoiceReviewEntry(entry, day) {
  if (!entry.worked) {
    return 'OFF';
  }

  const status = entry.shiftTime || entry.rawStatus || 'worked';
  const suffix = entry.uncertain ? ' - please check' : '';
  return status + ' - £' + formatMoneyForTelegram(getInvoiceReviewEntryAmount(entry, day)) + suffix;
}

function calculateInvoiceReviewTotal(invoice) {
  const entriesByDay = getRosterEntriesByDay(invoice);

  return DAY_ORDER.reduce(function(total, day) {
    const entry = entriesByDay[day];
    if (entry) {
      return entry.worked ? total + getInvoiceReviewEntryAmount(entry, day) : total;
    }

    if ((invoice.workedDays || []).indexOf(day) !== -1) {
      return total + getDefaultDayAmount(day);
    }

    return total;
  }, 0);
}

function getInvoiceReviewEntryAmount(entry, day) {
  if (entry.amountOverride !== null && entry.amountOverride !== undefined && entry.amountOverride !== '') {
    return Number(entry.amountOverride);
  }

  return getDefaultDayAmount(day);
}

function getDefaultDayAmount(day) {
  const key = day === 'sat' || day === 'sun' ? CONFIG_KEYS.WEEKEND_RATE : CONFIG_KEYS.WEEKDAY_RATE;
  const amount = Number(getOptionalProperty(key));
  return Number.isFinite(amount) ? amount : 0;
}

function getRosterEntriesByDay(invoice) {
  const entriesByDay = {};

  (invoice.rosterEntries || []).forEach(function(entry) {
    entriesByDay[entry.weekday] = entry;
  });

  return entriesByDay;
}

function buildInvoiceReviewKeyboard(token) {
  return [
    [{ text: 'Cancel', callback_data: 'review_cancel|' + token }],
    [{ text: 'Change', callback_data: 'review_change|' + token }],
    [{ text: 'Create PDF', callback_data: 'review_create|' + token }]
  ];
}

function buildInvoiceReviewChangeKeyboard(token) {
  return [
    [{ text: 'Change day', callback_data: 'review_edit_day|' + token }],
    [{ text: 'Invoice number', callback_data: 'review_edit_invoice|' + token }],
    // [
    //   { text: 'Week -7 days', callback_data: 'review_shift_prev|' + token },
    //   { text: 'Week +7 days', callback_data: 'review_shift_next|' + token }
    // ],
    [{ text: 'Back', callback_data: 'review_back|' + token }],
    [{ text: 'Cancel', callback_data: 'review_cancel|' + token }]
  ];
}

function buildInvoiceReviewDayKeyboard(token) {
  return [
    [
      { text: 'Monday', callback_data: 'review_day|' + token + '|mon' },
      { text: 'Tuesday', callback_data: 'review_day|' + token + '|tue' }
    ],
    [
      { text: 'Wednesday', callback_data: 'review_day|' + token + '|wed' },
      { text: 'Thursday', callback_data: 'review_day|' + token + '|thu' }
    ],
    [
      { text: 'Friday', callback_data: 'review_day|' + token + '|fri' },
      { text: 'Saturday', callback_data: 'review_day|' + token + '|sat' }
    ],
    [
      { text: 'Sunday', callback_data: 'review_day|' + token + '|sun' },
      { text: 'Cancel', callback_data: 'review_cancel|' + token }
    ]
  ];
}

function parseInvoiceReviewCallbackData(data) {
  const parts = String(data || '').split('|');
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error('Invalid invoice review action.');
  }

  if (parts.length === 3 && DAY_ORDER.indexOf(parts[2]) === -1) {
    throw new Error('Invalid invoice review day.');
  }

  return {
    action: parts[0],
    token: parts[1],
    day: parts[2] || ''
  };
}

function createInvoiceReviewToken(message) {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}

function storeInvoiceReview(review) {
  CacheService.getScriptCache().put(invoiceReviewCacheKey(review.chatId, review.token), JSON.stringify(review), 21600);
}

function loadInvoiceReview(chatId, token) {
  const value = CacheService.getScriptCache().get(invoiceReviewCacheKey(chatId, token));
  return value ? JSON.parse(value) : null;
}

function clearInvoiceReview(review) {
  CacheService.getScriptCache().remove(invoiceReviewCacheKey(review.chatId, review.token));
}

function storeInvoiceReviewEdit(edit) {
  CacheService.getScriptCache().put(invoiceReviewEditCacheKey(edit.chatId), JSON.stringify(edit), 1800);
}

function loadInvoiceReviewEdit(chatId) {
  const value = CacheService.getScriptCache().get(invoiceReviewEditCacheKey(chatId));
  return value ? JSON.parse(value) : null;
}

function clearInvoiceReviewEdit(chatId) {
  CacheService.getScriptCache().remove(invoiceReviewEditCacheKey(chatId));
}

function invoiceReviewCacheKey(chatId, token) {
  return 'invoice_review_' + String(chatId).replace(/[^0-9A-Za-z_-]/g, '_') + '_' + String(token);
}

function invoiceReviewEditCacheKey(chatId) {
  return 'invoice_review_edit_' + String(chatId).replace(/[^0-9A-Za-z_-]/g, '_');
}

function serializeInvoiceReviewInvoice(invoice) {
  const copy = {};

  Object.keys(invoice).forEach(function(key) {
    if (key === 'startDate' || key === 'endDate') {
      copy[key] = dateKey(invoice[key]);
      return;
    }

    if (key === 'rosterEntries') {
      copy[key] = (invoice.rosterEntries || []).map(serializeInvoiceReviewRosterEntry);
      return;
    }

    copy[key] = invoice[key];
  });

  return copy;
}

function serializeInvoiceReviewRosterEntry(entry) {
  const copy = {};

  Object.keys(entry).forEach(function(key) {
    copy[key] = key === 'date' ? dateKey(entry.date) : entry[key];
  });

  return copy;
}

function deserializeInvoiceReviewInvoice(invoice) {
  const copy = {};

  Object.keys(invoice).forEach(function(key) {
    if (key === 'startDate' || key === 'endDate') {
      copy[key] = parseIsoDate(invoice[key]);
      return;
    }

    if (key === 'rosterEntries') {
      copy[key] = (invoice.rosterEntries || []).map(deserializeInvoiceReviewRosterEntry);
      return;
    }

    copy[key] = invoice[key];
  });

  return copy;
}

function deserializeInvoiceReviewRosterEntry(entry) {
  const copy = {};

  Object.keys(entry).forEach(function(key) {
    copy[key] = key === 'date' ? parseIsoDate(entry.date) : entry[key];
  });

  return copy;
}

function formatMoneyForTelegram(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number)) {
    return '0';
  }

  return number % 1 === 0 ? String(number) : number.toFixed(2);
}
