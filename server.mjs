// Local dev server for Jong: serves the static game files and relays Jev requests to TypeSafe,
// whose API rejects browser CORS requests. It holds no game logic and stores nothing.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_PORT = 3000;
const DEFAULT_UPSTREAM_URL = 'https://api.typesafe.ai/v1/systemone';
const PROXY_PATH = '/api/systemone';
const MAX_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

/**
 * Creates the Jong HTTP server without starting it.
 *
 * @param {object} [options]
 * @param {string} [options.upstreamUrl] URL that `POST /api/systemone` is forwarded to.
 * @param {string} [options.rootDir] Directory containing `index.html` and `src/`.
 * @returns {http.Server}
 */
export function createServer({ upstreamUrl = DEFAULT_UPSTREAM_URL, rootDir = import.meta.dirname } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const pathname = req.url.split('?')[0];
      if (pathname === PROXY_PATH) {
        await handleProxy(req, res, upstreamUrl);
      } else {
        await handleStatic(req, res, rootDir, pathname);
      }
    } catch (error) {
      console.error(`Unexpected error on ${req.method} ${req.url}:`, error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal server error' });
      } else {
        res.destroy();
      }
    }
  });
}

async function handleProxy(req, res, upstreamUrl) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const body = await readBody(req, MAX_BODY_BYTES);
  if (body === null) {
    // Close the connection so the client stops uploading the rest of the oversized body.
    res.setHeader('Connection', 'close');
    sendJson(res, 413, { error: `Request body exceeds ${MAX_BODY_BYTES} bytes` });
    return;
  }

  // Only the API key and the content type are forwarded: cookies and other browser headers stay local.
  const headers = { 'Content-Type': 'application/json' };
  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }

  let upstreamResponse;
  let upstreamBody;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer());
  } catch (error) {
    console.error(`Upstream request failed: ${error.message}`);
    sendJson(res, 502, { error: 'Unable to reach the TypeSafe API' });
    return;
  }

  res.writeHead(upstreamResponse.status, {
    'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(upstreamBody);
}

/**
 * Reads the whole request body, or resolves to `null` as soon as it exceeds `maxBytes`.
 */
function readBody(req, maxBytes) {
  const declaredLength = Number(req.headers['content-length']);
  if (declaredLength > maxBytes) {
    req.resume();
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) {
        return;
      }
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!tooLarge) {
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', reject);
  });
}

async function handleStatic(req, res, rootDir, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendText(res, 405, 'Method not allowed');
    return;
  }

  const filePath = resolveStaticPath(rootDir, pathname);
  if (filePath === null) {
    sendText(res, 404, 'Not found');
    return;
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      sendText(res, 404, 'Not found');
      return;
    }
    throw error;
  }
  if (!fileStats.isFile()) {
    sendText(res, 404, 'Not found');
    return;
  }

  // The modules are unhashed and loaded together by index.html, so a long max-age could mix old and new files
  // after a deploy. "no-cache" makes browsers revalidate every time, which costs a 304 without reading the file.
  const etag = computeEtag(fileStats);
  const cacheHeaders = { 'Cache-Control': 'no-cache', ETag: etag };
  if (matchesIfNoneMatch(req.headers['if-none-match'], etag)) {
    res.writeHead(304, cacheHeaders);
    res.end();
    return;
  }

  const content = await readFile(filePath);
  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType, ...cacheHeaders });
  res.end(content);
}

/**
 * Builds a weak ETag from the file size and modification time, so it can be checked without reading the file.
 */
function computeEtag(fileStats) {
  return `W/"${fileStats.size.toString(16)}-${Math.floor(fileStats.mtimeMs).toString(16)}"`;
}

/**
 * Tells whether an `If-None-Match` header matches `etag`, using the weak comparison required by RFC 9110.
 */
function matchesIfNoneMatch(ifNoneMatch, etag) {
  if (!ifNoneMatch) {
    return false;
  }
  if (ifNoneMatch.trim() === '*') {
    return true;
  }
  const opaqueTag = stripWeakPrefix(etag);
  return ifNoneMatch.split(',').some((candidate) => stripWeakPrefix(candidate.trim()) === opaqueTag);
}

function stripWeakPrefix(tag) {
  return tag.startsWith('W/') ? tag.slice(2) : tag;
}

/**
 * Maps a request path to a file on disk, or returns `null` when the path is not public.
 * Only `/` (index.html) and files inside `src/` are public.
 */
function resolveStaticPath(rootDir, pathname) {
  if (pathname === '/') {
    return path.join(rootDir, 'index.html');
  }
  if (!pathname.startsWith('/src/')) {
    return null;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decodedPath.includes('\0')) {
    return null;
  }

  // Resolve first, then check containment: this rejects "..", encoded "%2e%2e" and similar traversal tricks.
  const srcDir = path.join(rootDir, 'src');
  const filePath = path.resolve(rootDir, `.${decodedPath}`);
  if (!filePath.startsWith(srcDir + path.sep)) {
    return null;
  }
  return filePath;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

function listLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

if (import.meta.main) {
  // server.listen rejects an invalid port with a clear error, so PORT needs no validation here.
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const server = createServer({ upstreamUrl: process.env.TYPESAFE_API_URL });

  server.listen(port, '0.0.0.0', () => {
    console.log('Jong is running:');
    console.log(`  Local:   http://localhost:${port}/`);
    for (const address of listLanAddresses()) {
      console.log(`  Network: http://${address}:${port}/`);
    }
  });
}
