// Cloudflare Pages Function — /api
// GET reads units, POST writes them. KV namespace bound as APT_DATA.

const KV_KEY    = 'units';
const PASS_KEY  = 'passcode';

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Passcode',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const incoming = request.headers.get('X-Passcode') || '';
  const stored   = await env.APT_DATA.get(PASS_KEY);

  // first request sets the passcode
  if (!stored) {
    if (!incoming) {
      return new Response(JSON.stringify({ error: 'Send a passcode to initialize.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    await env.APT_DATA.put(PASS_KEY, incoming);
  } else if (incoming !== stored) {
    return new Response(JSON.stringify({ error: 'Wrong passcode.' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  if (method === 'GET') {
    const data = await env.APT_DATA.get(KV_KEY);
    return new Response(data || '[]', {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  if (method === 'POST') {
    let body;
    try { body = await request.json(); } catch(e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Handle passcode change
    if (body._action === 'change_passcode' && body.newPasscode) {
      await env.APT_DATA.put(PASS_KEY, body.newPasscode);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Save units array
    if (Array.isArray(body)) {
      await env.APT_DATA.put(KV_KEY, JSON.stringify(body));
      return new Response(JSON.stringify({ ok: true, count: body.length }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Body must be an array.' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method not allowed', { status: 405, headers: cors });
}
