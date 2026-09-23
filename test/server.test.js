import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createServer } from '../server.mjs';

const ROOT_DIR = path.join(import.meta.dirname, '..');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

// fetch() normalizes "..", so traversal attempts must go through node:http to keep the raw path.
function getRawPath(port, rawPath) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: rawPath }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
  });
}

describe('server', () => {
  let upstream;
  let proxy;
  let proxyUrl;
  let lastUpstreamRequest;

  before(async () => {
    upstream = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      lastUpstreamRequest = { method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() };
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end('{"answers":{"zone":{"choice":"middle"}}}');
    });
    const upstreamPort = await listen(upstream);

    proxy = createServer({ upstreamUrl: `http://127.0.0.1:${upstreamPort}/v1/systemone`, rootDir: ROOT_DIR });
    const proxyPort = await listen(proxy);
    proxyUrl = `http://127.0.0.1:${proxyPort}`;
  });

  after(async () => {
    await close(proxy);
    await close(upstream);
  });

  describe('POST /api/systemone', () => {
    it('forwards the body and Authorization header and returns the upstream response', async () => {
      const requestBody = JSON.stringify({ model: 'jev-latest', state: 'ball at center' });

      const response = await fetch(`${proxyUrl}/api/systemone`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
        body: requestBody,
      });

      assert.equal(response.status, 201);
      assert.match(response.headers.get('content-type'), /^application\/json/);
      assert.equal(await response.text(), '{"answers":{"zone":{"choice":"middle"}}}');
      assert.equal(lastUpstreamRequest.method, 'POST');
      assert.equal(lastUpstreamRequest.body, requestBody);
      assert.equal(lastUpstreamRequest.headers.authorization, 'Bearer test-key');
      assert.equal(lastUpstreamRequest.headers['content-type'], 'application/json');
    });

    it('does not forward other headers such as Cookie', async () => {
      const response = await fetch(`${proxyUrl}/api/systemone`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-key', Cookie: 'session=secret', 'X-Custom': 'value' },
        body: '{}',
      });
      await response.text();

      assert.equal(lastUpstreamRequest.headers.cookie, undefined);
      assert.equal(lastUpstreamRequest.headers['x-custom'], undefined);
    });

    it('rejects bodies larger than 256 KB with 413', async () => {
      const response = await fetch(`${proxyUrl}/api/systemone`, {
        method: 'POST',
        body: 'x'.repeat(256 * 1024 + 1),
      });
      await response.text();

      assert.equal(response.status, 413);
    });

    it('returns 405 for other methods', async () => {
      const response = await fetch(`${proxyUrl}/api/systemone`);
      await response.text();

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'POST');
    });
  });

  it('returns 502 with a JSON error when the upstream is unreachable', async () => {
    const unusedServer = http.createServer();
    const unusedPort = await listen(unusedServer);
    await close(unusedServer);

    const brokenProxy = createServer({ upstreamUrl: `http://127.0.0.1:${unusedPort}/`, rootDir: ROOT_DIR });
    const brokenProxyPort = await listen(brokenProxy);
    try {
      const response = await fetch(`http://127.0.0.1:${brokenProxyPort}/api/systemone`, { method: 'POST', body: '{}' });

      assert.equal(response.status, 502);
      assert.equal(typeof (await response.json()).error, 'string');
    } finally {
      await close(brokenProxy);
    }
  });

  describe('static files', () => {
    it('serves index.html on /', async () => {
      const response = await fetch(`${proxyUrl}/`);

      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
      assert.match(response.headers.get('etag'), /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
      assert.match(await response.text(), /<canvas id="game"/);
    });

    it('answers 304 with an empty body when If-None-Match matches the ETag', async () => {
      const first = await fetch(`${proxyUrl}/src/main.js`);
      await first.text();
      const etag = first.headers.get('etag');

      const response = await fetch(`${proxyUrl}/src/main.js`, { headers: { 'If-None-Match': etag } });

      assert.equal(response.status, 304);
      assert.equal(response.headers.get('etag'), etag);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
      assert.equal(await response.text(), '');
    });

    it('matches an ETag within a list of candidates', async () => {
      const first = await fetch(`${proxyUrl}/`);
      await first.text();
      const etag = first.headers.get('etag');

      const response = await fetch(`${proxyUrl}/`, { headers: { 'If-None-Match': `"other", ${etag}` } });
      await response.text();

      assert.equal(response.status, 304);
    });

    it('serves the file again when If-None-Match does not match', async () => {
      const response = await fetch(`${proxyUrl}/`, { headers: { 'If-None-Match': 'W/"0-0"' } });

      assert.equal(response.status, 200);
      assert.match(await response.text(), /<canvas id="game"/);
    });

    it('answers 304 when If-None-Match is *', async () => {
      const response = await fetch(`${proxyUrl}/`, { headers: { 'If-None-Match': '*' } });
      await response.text();

      assert.equal(response.status, 304);
    });

    it('answers 304 to HEAD when If-None-Match matches the ETag', async () => {
      const first = await fetch(`${proxyUrl}/`, { method: 'HEAD' });
      const etag = first.headers.get('etag');

      const response = await fetch(`${proxyUrl}/`, { method: 'HEAD', headers: { 'If-None-Match': etag } });

      assert.equal(response.status, 304);
      assert.equal(response.headers.get('etag'), etag);
    });

    it('serves JavaScript files under src/', async () => {
      const response = await fetch(`${proxyUrl}/src/main.js`);
      await response.text();

      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/javascript/);
    });

    for (const rawPath of [
      '/server.mjs',
      '/package.json',
      '/../package.json',
      '/src/../server.mjs',
      '/src/..%2fserver.mjs',
      '/src/%2e%2e/server.mjs',
      '/src/missing.js',
    ]) {
      it(`returns 404 for ${rawPath}`, async () => {
        const port = new URL(proxyUrl).port;

        assert.equal(await getRawPath(port, rawPath), 404);
      });
    }
  });
});
