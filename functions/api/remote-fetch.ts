const ALLOWED_REMOTE_HOSTS = new Set([
  'raw.githubusercontent.com',
  'github.com',
  'api.github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'codeload.github.com'
]);

const MAX_REMOTE_BYTES = 25 * 1024 * 1024;

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  try {
    const reqUrl = new URL(context.request.url);
    const target = (reqUrl.searchParams.get('url') || '').trim();
    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const parsed = new URL(target);
    if (parsed.protocol !== 'https:' || !ALLOWED_REMOTE_HOSTS.has(parsed.hostname)) {
      return new Response(JSON.stringify({ error: 'Host not permitted for remote-fetch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'UMEDT-Pages/2.4.0',
        Accept: 'application/json, application/octet-stream, */*'
      },
      redirect: 'follow'
    });

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_REMOTE_BYTES) {
      return new Response(JSON.stringify({ error: 'Remote payload exceeds 25 MB safety limit' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(bytes, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Remote fetch relay failed'
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    );
  }
}
