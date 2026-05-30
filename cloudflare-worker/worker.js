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
