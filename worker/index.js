const STRAVA_AUTH_URL  = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

function cors(env) {
  return {
    'Access-Control-Allow-Origin':  env.APP_URL,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;
    const c    = cors(env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: c });

    // Redirect user to Strava's OAuth consent screen
    if (path === '/auth') {
      const appUrl = url.searchParams.get('app_url') || env.APP_URL;
      const params = new URLSearchParams({
        client_id:       env.STRAVA_CLIENT_ID,
        redirect_uri:    `${url.origin}/callback`,
        response_type:   'code',
        approval_prompt: 'auto',
        scope:           'activity:read_all',
        state:           encodeURIComponent(appUrl),
      });
      return Response.redirect(`${STRAVA_AUTH_URL}?${params}`, 302);
    }

    // Exchange auth code for tokens, redirect back to app with tokens in hash
    if (path === '/callback') {
      const code  = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const state = url.searchParams.get('state') || '';
      const appUrl = decodeURIComponent(state) || env.APP_URL;

      if (error || !code) {
        return Response.redirect(`${appUrl}#strava=error`, 302);
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
        return Response.redirect(`${appUrl}#strava=error`, 302);
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
        }), { headers: { ...c, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'refresh_failed' }),
          { status: 400, headers: { ...c, 'Content-Type': 'application/json' } });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
