function handleEmailCommand(message) {
  const argument = String(message.text || '').trim().replace(/^\/email(?:@\w+)?\s*/i, '').trim();

  if (!argument) {
    const current = getEmailRecipientForChat(message.chatId);
    sendTelegramText(message.chatId, current ?
      'Current email recipient: ' + current + '\n\nChange it with:\n/email name@example.com\n\nClear it with:\n/email clear' :
      'No email recipient is set.\n\nSet one with:\n/email name@example.com');
    return;
  }

  if (/^(clear|remove|off)$/i.test(argument)) {
    clearEmailRecipientForChat(message.chatId);
    sendTelegramText(message.chatId, 'Email recipient cleared.');
    return;
  }

  if (!isValidEmailAddress(argument)) {
    throw new Error('Invalid email address. Use: /email name@example.com');
  }

  setEmailRecipientForChat(message.chatId, argument);
  sendTelegramText(message.chatId, 'Email recipient set to: ' + argument);
}

function sendEmailOffer(chatId, invoice) {
  const recipient = getEmailRecipientForChat(chatId);
  if (!recipient) {
    sendTelegramText(chatId, 'No email recipient is set for this chat. Use /email name@example.com to set one.');
    return;
  }

  const filename = invoice.driveFilename || buildInvoiceFilename(openInvoiceSpreadsheet(), invoice);
  const callbackSuffix = [dateKey(invoice.startDate), dateKey(invoice.endDate)].join('|');

  sendTelegramTextWithInlineKeyboard(
    chatId,
    [
      'Send this invoice by email?',
      '',
      'To: ' + recipient,
      'Invoice: ' + filename
    ].join('\n'),
    [[
      { text: 'Send email', callback_data: 'email_send|' + callbackSuffix },
      { text: 'Skip', callback_data: 'email_skip|' + callbackSuffix }
    ]]
  );
}

function handleEmailSendCallback(callbackQuery) {
  const payload = parseEmailCallbackData(callbackQuery.data);
  const recipient = getEmailRecipientForChat(callbackQuery.chatId);
  if (!recipient) {
    throw new Error('No email recipient is set. Use /email name@example.com first.');
  }

  const spreadsheet = openInvoiceSpreadsheet();
  const indexSheet = getOrCreateInvoiceIndexSheet(spreadsheet);
  const entry = findInvoiceIndexEntry(indexSheet, payload.startDate, payload.endDate);

  if (!entry || !entry.driveFileId) {
    throw new Error('Could not find the saved invoice PDF for this period.');
  }

  const file = DriveApp.getFileById(entry.driveFileId);
  const outputFolderId = getRequiredProperty(CONFIG_KEYS.DRIVE_OUTPUT_FOLDER_ID);
  if (!driveFileHasParent(file, outputFolderId)) {
    throw new Error('Refusing to email an invoice PDF outside DRIVE_OUTPUT_FOLDER_ID.');
  }

  const filename = entry.driveFilename || file.getName();
  const emailMessage = {
    to: recipient,
    subject: buildEmailSubject(entry, filename),
    body: buildEmailBody(filename),
    attachments: [file.getBlob().setName(filename)]
  };
  const senderName = getOptionalProperty(CONFIG_KEYS.EMAIL_SENDER_NAME);
  if (senderName) {
    emailMessage.name = senderName;
  }

  MailApp.sendEmail(emailMessage);

  editTelegramMessageText(
    callbackQuery.chatId,
    callbackQuery.messageId,
    'Email sent.\n\nTo: ' + recipient + '\nInvoice: ' + filename
  );
}

function handleEmailSkipCallback(callbackQuery) {
  const payload = parseEmailCallbackData(callbackQuery.data);
  const spreadsheet = openInvoiceSpreadsheet();
  const indexSheet = getOrCreateInvoiceIndexSheet(spreadsheet);
  const entry = findInvoiceIndexEntry(indexSheet, payload.startDate, payload.endDate);
  const filename = entry && entry.driveFilename ? entry.driveFilename : 'invoice PDF';

  editTelegramMessageText(
    callbackQuery.chatId,
    callbackQuery.messageId,
    'Email skipped.\n\nInvoice: ' + filename
  );
}

function parseEmailCallbackData(data) {
  const parts = String(data || '').split('|');
  if (parts.length !== 3) {
    throw new Error('Invalid email action.');
  }

  return {
    action: parts[0],
    startDate: parseIsoDate(parts[1]),
    endDate: parseIsoDate(parts[2])
  };
}

function buildEmailSubject(entry, filename) {
  return [
    'Invoice ' + entry.invoiceNumber,
    dateKey(entry.startDate) + ' to ' + dateKey(entry.endDate)
  ].join(' - ');
}

function buildEmailBody(filename) {
  const invoiceTitle = filename.replace(/\.pdf$/i, '');

  return [
    'Hi,',
    '',
    'Please find attached the invoice PDF.',
    '',
    'Invoice: ' + invoiceTitle,
    '',
    'Thanks'
  ].join('\n');
}

function getEmailRecipientForChat(chatId) {
  return getOptionalProperty(emailRecipientPropertyKey(chatId));
}

function setEmailRecipientForChat(chatId, email) {
  setScriptProperty(emailRecipientPropertyKey(chatId), email);
}

function clearEmailRecipientForChat(chatId) {
  PropertiesService.getScriptProperties().deleteProperty(emailRecipientPropertyKey(chatId));
}

function emailRecipientPropertyKey(chatId) {
  return 'EMAIL_RECIPIENT_CHAT_' + String(chatId).replace(/[^0-9A-Za-z_-]/g, '_');
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}
