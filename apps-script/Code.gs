function doGet(e) {
  return jsonResponse({
    ok: true,
    service: 'messenger-invoice-bot'
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
    if (command === '/start' || command === '/help') {
      sendTelegramText(message.chatId, buildStartMessage());
      markMessageProcessed(message.id);
      logInvoiceRun({ message: message, status: command === '/help' ? 'help_sent' : 'start_help_sent' });
      return;
    }

    if (command === '/id') {
      sendTelegramText(message.chatId, 'Telegram chat ID: ' + message.chatId);
      markMessageProcessed(message.id);
      logInvoiceRun({ message: message, status: 'chat_id_sent' });
      return;
    }

    if (command === '/version') {
      sendTelegramText(message.chatId, 'Messenger Invoice Bot\nVersion: ' + APP_VERSION);
      markMessageProcessed(message.id);
      logInvoiceRun({ message: message, status: 'version_sent' });
      return;
    }

    if (command === '/auth') {
      if (!isAdminTelegramChat(message.chatId)) {
        throw new Error('Only admin chats can request the Google authorization link.');
      }

      sendTelegramText(message.chatId, buildAuthorizationMessage());
      markMessageProcessed(message.id);
      logInvoiceRun({ message: message, status: 'auth_link_sent' });
      return;
    }

    sendTelegramChatAction(message.chatId, 'typing');

    const invoice = parseInvoiceRequest(message.text);
    const spreadsheet = openInvoiceSpreadsheet();

    resolveInvoiceNumber(spreadsheet, invoice);
    writeInvoiceToSheet(spreadsheet, invoice);

    SpreadsheetApp.flush();

    sendTelegramChatAction(message.chatId, 'upload_document');

    const pdfBlob = exportInvoicePdf(spreadsheet, invoice);
    saveInvoicePdf(spreadsheet, invoice, pdfBlob);
    sendTelegramChatAction(message.chatId, 'upload_document');
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
      sendTelegramText(message.chatId, buildErrorMessageForChat(message.chatId, error));
    } catch (sendError) {
      console.error('Failed to send Telegram error message: ' + String(sendError.message || sendError));
    }
    throw error;
  }
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

function testAuthorizeDriveOutputFolder() {
  const folder = DriveApp.getFolderById(getRequiredProperty(CONFIG_KEYS.DRIVE_OUTPUT_FOLDER_ID));
  const file = folder.createFile('messenger-invoice-auth-test.txt', 'Authorization test file. Safe to delete.');
  file.setTrashed(true);

  console.log('Drive output folder authorization OK: ' + folder.getName());
}
