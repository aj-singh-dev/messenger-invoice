export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }

    const body = await request.text();
    const chatId = getTelegramChatId(body);
    if (!isAllowedTelegramChat(chatId, env.TELEGRAM_ALLOWED_CHAT_IDS, env.TELEGRAM_ADMIN_CHAT_IDS)) {
      return new Response('OK', { status: 200 });
    }

    const appsScriptUrl =
      env.APPS_SCRIPT_URL +
      '?telegram_secret=' +
      encodeURIComponent(env.TELEGRAM_WEBHOOK_SECRET);

    ctx.waitUntil(fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET
      },
      body,
      redirect: 'follow'
    }));

    return new Response('OK', { status: 200 });
  }
};

function getTelegramChatId(body) {
  let update;

  try {
    update = JSON.parse(body);
  } catch (error) {
    return '';
  }

  if (update.message && update.message.chat && update.message.chat.id !== undefined) {
    return String(update.message.chat.id);
  }

  if (update.callback_query &&
      update.callback_query.message &&
      update.callback_query.message.chat &&
      update.callback_query.message.chat.id !== undefined) {
    return String(update.callback_query.message.chat.id);
  }

  return '';
}

function isAllowedTelegramChat(chatId, allowedChatIds, adminChatIds) {
  if (!chatId) {
    return false;
  }

  return includesChatId(adminChatIds, chatId) || includesChatId(allowedChatIds, chatId);
}

function includesChatId(chatIds, chatId) {
  if (!chatIds) {
    return false;
  }

  return chatIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(String(chatId));
}
