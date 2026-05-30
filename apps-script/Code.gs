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
    const spreadsheet = openInvoiceSpreadsheet();

    resolveInvoiceNumber(spreadsheet, invoice);
    writeInvoiceToSheet(spreadsheet, invoice);

    SpreadsheetApp.flush();

    const pdfBlob = exportInvoicePdf(spreadsheet, invoice);
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

function testParseInvoiceRequest() {
  const parsed = parseInvoiceRequest('Invoice week 2026-05-11 to 2026-05-17\nWorked: Mon Tue Wed Thu Fri');
  console.log(JSON.stringify({
    invoiceNumber: parsed.invoiceNumber,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    workedDays: parsed.workedDays
  }));
}
