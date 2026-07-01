const STRAVA_AUTH_URL  = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Token',
};

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // Redirect user to Strava's OAuth consent screen
    if (path === '/auth') {
      // Store app_url in state param so callback knows where to return
      const appUrl = url.searchParams.get('app_url') || env.APP_URL;
      const state  = encodeURIComponent(appUrl);
      const params = new URLSearchParams({
        client_id:       env.STRAVA_CLIENT_ID,
        redirect_uri:    `${url.origin}/callback`,
        response_type:   'code',
        approval_prompt: 'force',
        scope:           'activity:read_all',
        state,
      });
      return Response.redirect(`${STRAVA_AUTH_URL}?${params}`, 302);
    }

    // Exchange auth code for tokens, redirect back to app with tokens in hash
    if (path === '/callback') {
      const code  = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      // Prefer app_url echoed back via state param; fall back to env var
      const stateParam = url.searchParams.get('state');
      const appUrl = (stateParam ? decodeURIComponent(stateParam) : null) || env.APP_URL;

      if (error || !code) {
        return Response.redirect(`${appUrl}#strava=error&reason=${encodeURIComponent(error||'cancelled')}`, 302);
      }
      try {
        const resp = await fetch(STRAVA_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:     env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            code,
            grant_type:    'authorization_code',
          }),
        });
        const data = await resp.json();
        if (!data.access_token) throw new Error('no token');
        const params = new URLSearchParams({
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
          expires_at:    data.expires_at,
          athlete:       data.athlete?.firstname || '',
        });
        return Response.redirect(`${appUrl}#strava=${encodeURIComponent(params.toString())}`, 302);
      } catch (e) {
        return Response.redirect(`${appUrl}#strava=error&reason=token_exchange`, 302);
      }
    }

    // Refresh an expired access token
    if (path === '/refresh' && request.method === 'POST') {
      try {
        const { refresh_token } = await request.json();
        const resp = await fetch(STRAVA_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:     env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            refresh_token,
            grant_type:    'refresh_token',
          }),
        });
        const data = await resp.json();
        return new Response(JSON.stringify({
          access_token: data.access_token,
          expires_at:   data.expires_at,
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'refresh_failed' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    // Store a health check-in (called by iOS Shortcut)
    if (path === '/health' && request.method === 'POST') {
      const token = request.headers.get('X-Sync-Token') || '';
      if (!token) {
        return new Response(JSON.stringify({ ok: false, reason: 'missing_token' }),
          { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      let body;
      try { body = await request.json(); } catch(e) {
        return new Response(JSON.stringify({ ok: false, reason: 'invalid_json' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const { date, sleepHours, hrv, restingHR, vo2max, steps, bodyBattery, garminSyncTime } = body;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(JSON.stringify({ ok: false, reason: 'invalid_date' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const payload = JSON.stringify({ date, sleepHours, hrv, restingHR, vo2max, steps, bodyBattery, garminSyncTime });
      const ttl = 7776000; // 90 days in seconds
      await env.HEALTH_DATA.put(`health:${token}:${date}`, payload, { expirationTtl: ttl });
      await env.HEALTH_DATA.put(`health:${token}:latest`, date, { expirationTtl: ttl });
      return new Response(JSON.stringify({ ok: true }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Retrieve a health check-in
    if (path === '/health' && request.method === 'GET') {
      const token = request.headers.get('X-Sync-Token') || '';
      if (!token) {
        return new Response(JSON.stringify({ ok: false, reason: 'missing_token' }),
          { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const wantLatest = url.searchParams.get('latest') === 'true';
      let date = url.searchParams.get('date');
      if (wantLatest || !date) {
        const latestDate = await env.HEALTH_DATA.get(`health:${token}:latest`);
        if (!latestDate) {
          return new Response(JSON.stringify({ ok: false, reason: 'not_found' }),
            { headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        date = latestDate;
      }
      const raw = await env.HEALTH_DATA.get(`health:${token}:${date}`);
      if (!raw) {
        return new Response(JSON.stringify({ ok: false, reason: 'not_found' }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return new Response(raw,
        { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Proxy Claude API calls — avoids CORS/iOS PWA restrictions on direct browser requests
    if (path === '/claude' && request.method === 'POST') {
      try {
        const { key, model, system, messages, max_tokens } = await request.json();
        if (!key || !key.startsWith('sk-ant')) {
          return new Response(JSON.stringify({ error: { message: 'missing or invalid API key' } }),
            { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        const resp = await fetch(CLAUDE_API, {
          method: 'POST',
          headers: {
            'Content-Type':    'application/json',
            'x-api-key':       key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model, system, messages, max_tokens }),
        });
        const data = await resp.json();
        return new Response(JSON.stringify(data),
          { status: resp.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: { message: 'proxy_failed' } }),
          { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    // Proxy OpenAI (ChatGPT) calls — same CORS/iOS-PWA reasons as /claude.
    // Accepts the same Claude-shaped payload {key, model, system, messages, max_tokens}
    // and translates to OpenAI's chat-completions format. Returns OpenAI's raw JSON;
    // the client normalizes it to the {content:[{text}]} shape.
    if (path === '/openai' && request.method === 'POST') {
      try {
        const { key, model, system, messages, max_tokens } = await request.json();
        if (!key || !key.startsWith('sk-')) {
          return new Response(JSON.stringify({ error: { message: 'missing or invalid API key' } }),
            { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        const oaMessages = [];
        if (system) oaMessages.push({ role: 'system', content: system });
        for (const m of (messages || [])) oaMessages.push({ role: m.role, content: m.content });
        const resp = await fetch(OPENAI_API, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${key}`,
          },
          body: JSON.stringify({ model, messages: oaMessages, max_tokens }),
        });
        const data = await resp.json();
        return new Response(JSON.stringify(data),
          { status: resp.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: { message: 'proxy_failed' } }),
          { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
