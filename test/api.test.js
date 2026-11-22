import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import jsQR from 'jsqr';
import pngjs from 'pngjs';
import { createLinkQrServer } from '../src/server.js';

const server = createLinkQrServer();
let origin;

before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));

function createQr(body, contentType = 'application/json') {
  return fetch(origin + '/api/v1/qr', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
}

test('returns a PNG that decodes to the original URL, including Unicode and escapes', async () => {
  const url = 'https://example.com/한글?source=%2F&lang=ko#intro';
  const response = await createQr(JSON.stringify({ url }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const png = pngjs.PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual([png.width, png.height], [512, 512]);
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, url);
});

test('rejects malformed input without returning user-supplied content', async () => {
  const cases = [
    ['{', 400, 'invalid_json'],
    [JSON.stringify({ url: 'file:///tmp/private' }), 400, 'invalid_url'],
    [JSON.stringify({ url: 'https://name:secret@example.com/' }), 400, 'invalid_url'],
    [JSON.stringify({ url: 'https://example.com/' + '가'.repeat(400) }), 400, 'invalid_url'],
    ['x'.repeat(8193), 413, 'body_too_large'],
    ['https://example.com', 415, 'unsupported_media_type', 'text/plain'],
  ];
  for (const [body, status, code, type] of cases) {
    const response = await createQr(body, type);
    assert.equal(response.status, status);
    const json = await response.json();
    assert.equal(json.code, code);
    assert.equal(JSON.stringify(json).includes('secret'), false);
  }
});

test('serves the UI, bundled assets, and health endpoint', async () => {
  for (const [path, type] of [
    ['/', 'text/html'], ['/app.js', 'text/javascript'], ['/style.css', 'text/css'],
    ['/healthz', 'application/json'],
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
    await response.arrayBuffer();
  }
  const response = await fetch(origin + '/api/v1/qr');
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
  await response.arrayBuffer();
});
