function handleEmailCommand(message) {
  const argument = String(message.text || '').trim().replace(/^\/email(?:@\w+)?\s*/i, '').trim();

  if (!argument) {
    const current = getEmailRecipientsForChat(message.chatId);
    sendTelegramText(message.chatId, current.length ?
      'Current email recipients:\n' + formatEmailRecipientsForTelegram(current) + '\n\nChange them with:\n/email name@example.com other@example.com\n\nClear them with:\n/email clear' :
      'No email recipients are set.\n\nSet them with:\n/email name@example.com other@example.com');
    return;
  }

  if (/^(clear|remove|off)$/i.test(argument)) {
    clearEmailRecipientForChat(message.chatId);
    sendTelegramText(message.chatId, 'Email recipients cleared.');
    return;
  }

  const recipients = parseEmailRecipientList(argument);
  if (recipients.length === 0) {
    throw new Error('Invalid email address. Use: /email name@example.com other@example.com');
  }

  setEmailRecipientsForChat(message.chatId, recipients);
  sendTelegramText(message.chatId, 'Email recipients set to:\n' + formatEmailRecipientsForTelegram(recipients));
}

function sendEmailOffer(chatId, invoice) {
  if (!areEmailOptionsEnabled()) {
    return;
  }

  const recipients = getEmailRecipientsForChat(chatId);
  if (recipients.length === 0) {
    sendTelegramText(chatId, 'No email recipients are set for this chat. Use /email name@example.com other@example.com to set them.');
    return;
  }

  const filename = invoice.driveFilename || buildInvoiceFilename(openInvoiceSpreadsheet(), invoice);
  const callbackSuffix = [dateKey(invoice.startDate), dateKey(invoice.endDate)].join('|');

  sendTelegramTextWithInlineKeyboard(
    chatId,
    [
      'How should this invoice be emailed?',
      '',
      'To:',
      formatEmailRecipientsForTelegram(recipients),
      'Invoice: ' + filename
    ].join('\n'),
    [
      [{ text: 'Create Gmail draft', callback_data: 'email_draft|' + callbackSuffix }],
      [{ text: 'Manual send', callback_data: 'email_manual|' + callbackSuffix }],
      [
        { text: 'Send directly', callback_data: 'email_send|' + callbackSuffix },
        { text: 'Skip', callback_data: 'email_skip|' + callbackSuffix }
      ]
    ]
  );
}

function handleEmailManualCallback(callbackQuery) {
  const payload = parseEmailCallbackData(callbackQuery.data);
  const recipients = getEmailRecipientsForChat(callbackQuery.chatId);
  if (recipients.length === 0) {
    throw new Error('No email recipients are set. Use /email name@example.com other@example.com first.');
  }

  const invoiceFile = getSavedInvoiceFileForEmail(payload.startDate, payload.endDate);
  const entry = invoiceFile.entry;
  const file = invoiceFile.file;
  const filename = entry.driveFilename || file.getName();
  const subject = buildEmailSubject(entry, filename);
  const body = buildEmailBody(filename);
  const openPdfUrl = prepareManualEmailPdfUrl(file);
  const text = [
    'Manual email details',
    '',
    'To:',
    recipients.join(', '),
    '',
    'Subject:',
    subject,
    '',
    'Body:',
    body,
    '',
    openPdfUrl ?
      'Open the PDF, use iOS Share, choose Mail, then paste the details above.' :
      'PDF sharing link is disabled. Open the PDF from the Telegram attachment, then use iOS Share and paste the details above.'
  ].join('\n');

  if (openPdfUrl) {
    editTelegramMessageTextWithInlineKeyboard(
      callbackQuery.chatId,
      callbackQuery.messageId,
      text,
      [[{ text: 'Open PDF', url: openPdfUrl }]]
    );
    return;
  }

  editTelegramMessageText(callbackQuery.chatId, callbackQuery.messageId, text);
}

function handleEmailSendCallback(callbackQuery) {
  const payload = parseEmailCallbackData(callbackQuery.data);
  const recipients = getEmailRecipientsForChat(callbackQuery.chatId);
  if (recipients.length === 0) {
    throw new Error('No email recipients are set. Use /email name@example.com other@example.com first.');
  }

  const invoiceFile = getSavedInvoiceFileForEmail(payload.startDate, payload.endDate);
  const entry = invoiceFile.entry;
  const file = invoiceFile.file;
  const filename = entry.driveFilename || file.getName();

  MailApp.sendEmail(buildEmailMessage(recipients, entry, file, filename));

  editTelegramMessageText(
    callbackQuery.chatId,
    callbackQuery.messageId,
    'Email sent.\n\nTo:\n' + formatEmailRecipientsForTelegram(recipients) + '\nInvoice: ' + filename
  );
}

function handleEmailDraftCallback(callbackQuery) {
  const payload = parseEmailCallbackData(callbackQuery.data);
  const recipients = getEmailRecipientsForChat(callbackQuery.chatId);
  if (recipients.length === 0) {
    throw new Error('No email recipients are set. Use /email name@example.com other@example.com first.');
  }

  const invoiceFile = getSavedInvoiceFileForEmail(payload.startDate, payload.endDate);
  const entry = invoiceFile.entry;
  const file = invoiceFile.file;
  const filename = entry.driveFilename || file.getName();
  const emailMessage = buildEmailMessage(recipients, entry, file, filename);

  GmailApp.createDraft(
    emailMessage.to,
    emailMessage.subject,
    emailMessage.body,
    {
      attachments: emailMessage.attachments,
      name: emailMessage.name
    }
  );

  editTelegramMessageTextWithInlineKeyboard(
    callbackQuery.chatId,
    callbackQuery.messageId,
    'Gmail draft created with the PDF attached.\n\nTo:\n' +
      formatEmailRecipientsForTelegram(recipients) +
      '\nInvoice: ' + filename +
      '\n\nOpen Gmail Drafts, review it, and send it from your mailbox.',
    [[{ text: 'Open Gmail Drafts', url: 'https://mail.google.com/mail/u/0/#drafts' }]]
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

function getSavedInvoiceFileForEmail(startDate, endDate) {
  const spreadsheet = openInvoiceSpreadsheet();
  const indexSheet = getOrCreateInvoiceIndexSheet(spreadsheet);
  const entry = findInvoiceIndexEntry(indexSheet, startDate, endDate);

  if (!entry || !entry.driveFileId) {
    throw new Error('Could not find the saved invoice PDF for this period.');
  }

  const file = DriveApp.getFileById(entry.driveFileId);
  const outputFolderId = getRequiredProperty(CONFIG_KEYS.DRIVE_OUTPUT_FOLDER_ID);
  if (!driveFileHasParent(file, outputFolderId)) {
    throw new Error('Refusing to email an invoice PDF outside DRIVE_OUTPUT_FOLDER_ID.');
  }

  return {
    entry: entry,
    file: file
  };
}

function buildEmailMessage(recipients, entry, file, filename) {
  const emailMessage = {
    to: recipients.join(','),
    subject: buildEmailSubject(entry, filename),
    body: buildEmailBody(filename),
    attachments: [file.getBlob().setName(filename)]
  };
  const senderName = getOptionalProperty(CONFIG_KEYS.EMAIL_SENDER_NAME);
  if (senderName) {
    emailMessage.name = senderName;
  }

  return emailMessage;
}

function prepareManualEmailPdfUrl(file) {
  if (!isManualDriveLinkEnabled()) {
    return '';
  }

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function isManualDriveLinkEnabled() {
  return /^true$/i.test(String(getOptionalProperty(CONFIG_KEYS.EMAIL_MANUAL_DRIVE_LINK_ENABLED) || '').trim());
}

function areEmailOptionsEnabled() {
  return /^true$/i.test(String(getOptionalProperty(CONFIG_KEYS.EMAIL_OPTIONS_ENABLED) || '').trim());
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

function getEmailRecipientsForChat(chatId) {
  return parseEmailRecipientList(getOptionalProperty(emailRecipientPropertyKey(chatId)));
}

function setEmailRecipientsForChat(chatId, emails) {
  setScriptProperty(emailRecipientPropertyKey(chatId), emails.join(','));
}

function clearEmailRecipientForChat(chatId) {
  PropertiesService.getScriptProperties().deleteProperty(emailRecipientPropertyKey(chatId));
}

function emailRecipientPropertyKey(chatId) {
  return 'EMAIL_RECIPIENT_CHAT_' + String(chatId).replace(/[^0-9A-Za-z_-]/g, '_');
}

function parseEmailRecipientList(value) {
  return String(value || '')
    .split(/[,\s;]+/)
    .map(function(email) {
      return email.trim();
    })
    .filter(Boolean)
    .filter(function(email, index, emails) {
      if (!isValidEmailAddress(email)) {
        throw new Error('Invalid email address: ' + email);
      }
      return emails.indexOf(email) === index;
    });
}

function formatEmailRecipientsForTelegram(recipients) {
  return recipients.map(function(recipient) {
    return '- ' + recipient;
  }).join('\n');
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}
