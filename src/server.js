import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { TextDecoder } from 'node:util';
import QRCode from 'qrcode';

const MAX_BODY = 8 * 1024;
const MAX_URL = 1024;
const MAX_ACTIVE = 8;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const assets = new Map(
  [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
    ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ].map(([route, file, type]) => [
    route, { type, body: readFileSync(new URL('../public/' + file, import.meta.url)) },
  ]),
);

function send(response, status, type, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'Referrer-Policy': 'no-referrer',
    ...headers,
  }).end(body);
}

function error(response, status, code, message, headers) {
  send(response, status, 'application/json', JSON.stringify({ code, message }), headers);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY) return { tooLarge: true };
    chunks.push(chunk);
  }
  try {
    return { payload: JSON.parse(utf8.decode(Buffer.concat(chunks, size))) };
  } catch {
    return {};
  }
}

function validUrl(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  // Reject syntax the URL parser would silently repair before encoding the original string.
  if (Buffer.byteLength(url) > MAX_URL || !/^https?:\/\/[^/]/i.test(url) ||
      /\s|[\x00-\x1f\x7f\\]/u.test(url)) return null;
  const parsed = URL.parse(url);
  return parsed?.hostname && !parsed.username && !parsed.password ? url : null;
}

export function createLinkQrServer() {
  let active = 0;
  return createServer({
    headersTimeout: 5000,
    requestTimeout: 10000,
    keepAliveTimeout: 5000,
    connectionsCheckingInterval: 1000,
  }, async (request, response) => {
    const route = request.url.split('?', 1)[0];
    const asset = assets.get(route);
    const method = route === '/api/v1/qr' ? 'POST' : asset || route === '/healthz' ? 'GET' : null;
    if (!method) return error(response, 404, 'not_found', 'Route not found.');
    if (request.method !== method) {
      return error(response, 405, 'method_not_allowed', 'Method not allowed.', { Allow: method });
    }
    if (asset) return send(response, 200, asset.type, asset.body);
    if (route === '/healthz') return send(response, 200, 'application/json', '{"status":"ok"}');

    const type = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
    const close = { Connection: 'close' };
    if (type !== 'application/json') {
      return error(response, 415, 'unsupported_media_type', 'Send application/json.', close);
    }
    if (Number(request.headers['content-length']) > MAX_BODY) {
      return error(response, 413, 'body_too_large', 'Request body exceeds 8 KiB.', close);
    }
    if (active >= MAX_ACTIVE) {
      return error(response, 503, 'busy', 'Try again shortly.', { ...close, 'Retry-After': '1' });
    }

    active += 1;
    try {
      const { tooLarge, payload } = await readJson(request);
      if (tooLarge) return error(response, 413, 'body_too_large', 'Request body exceeds 8 KiB.', close);
      if (payload === undefined) return error(response, 400, 'invalid_json', 'Invalid JSON.');
      const url = validUrl(payload?.url);
      if (!url) {
        return error(response, 400, 'invalid_url', 'Send an HTTP or HTTPS URL of up to 1024 UTF-8 bytes.');
      }
      const png = await QRCode.toBuffer(url, { type: 'png', width: 512, margin: 4, errorCorrectionLevel: 'M' });
      if (!response.destroyed) send(response, 200, 'image/png', png);
    } catch {
      if (!response.destroyed && !response.headersSent) {
        error(response, 500, 'generation_failed', 'Could not generate a QR code.', close);
      }
    } finally {
      active -= 1;
    }
  });
}
