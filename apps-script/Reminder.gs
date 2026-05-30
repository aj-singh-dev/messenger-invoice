function handleReminderCommand(message) {
  const argument = String(message.text || '').trim().replace(/^\/reminder(?:@\w+)?\s*/i, '').trim();

  if (!argument) {
    sendTelegramText(message.chatId, buildReminderStatusMessage(message.chatId));
    return;
  }

  if (/^(on|start|yes)$/i.test(argument)) {
    addReminderChat(message.chatId);
    ensureWeeklyReminderTrigger();
    sendTelegramText(message.chatId, [
      'Weekly reminder is on.',
      '',
      'I will remind this chat every Sunday evening to send the week\'s working days.',
      '',
      'Turn it off with /reminder off.'
    ].join('\n'));
    return;
  }

  if (/^(off|stop|no|clear)$/i.test(argument)) {
    removeReminderChat(message.chatId);
    if (getReminderChats().length === 0) {
      deleteWeeklyReminderTriggers();
    }
    sendTelegramText(message.chatId, 'Weekly reminder is off.');
    return;
  }

  throw new Error('Use /reminder on or /reminder off.');
}

function buildReminderStatusMessage(chatId) {
  if (getReminderChats().indexOf(String(chatId)) !== -1) {
    return [
      'Weekly reminder is on for this chat.',
      '',
      'I will remind this chat every Sunday evening.',
      '',
      'Turn it off with /reminder off.'
    ].join('\n');
  }

  return [
    'Weekly reminder is off for this chat.',
    '',
    'Turn it on with /reminder on.'
  ].join('\n');
}

function sendWeeklyInvoiceReminders() {
  const chatIds = getReminderChats();
  chatIds.forEach(function(chatId) {
    try {
      sendTelegramText(chatId, [
        'Reminder: please send this week\'s working days when ready.',
        '',
        'You can paste the usual message here, for example:',
        '25/05 OFF',
        '26/05 10:00'
      ].join('\n'));
    } catch (error) {
      console.error('Failed to send reminder to ' + chatId + ': ' + String(error.message || error));
    }
  });
}

function addReminderChat(chatId) {
  const normalizedChatId = String(chatId);
  const chatIds = getReminderChats();
  if (chatIds.indexOf(normalizedChatId) === -1) {
    chatIds.push(normalizedChatId);
  }
  setReminderChats(chatIds);
}

function removeReminderChat(chatId) {
  const normalizedChatId = String(chatId);
  setReminderChats(getReminderChats().filter(function(existingChatId) {
    return existingChatId !== normalizedChatId;
  }));
}

function getReminderChats() {
  const value = getOptionalProperty(CONFIG_KEYS.REMINDER_CHAT_IDS);
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(function(chatId) {
      return chatId.trim();
    })
    .filter(Boolean);
}

function setReminderChats(chatIds) {
  setScriptProperty(CONFIG_KEYS.REMINDER_CHAT_IDS, chatIds.join(','));
}

function ensureWeeklyReminderTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const exists = triggers.some(function(trigger) {
    return trigger.getHandlerFunction() === 'sendWeeklyInvoiceReminders';
  });

  if (exists) {
    return;
  }

  ScriptApp.newTrigger('sendWeeklyInvoiceReminders')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(18)
    .create();
}

function deleteWeeklyReminderTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'sendWeeklyInvoiceReminders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
