import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  JevError,
  ZONES,
  buildRequestBody,
  describeError,
  errorKindForStatus,
  requestZone,
} from '../src/api.js';
import { createMatch } from '../src/game.js';

const answer = (choice) => new Response(JSON.stringify({ answers: { target: { type: 'choice', choice } } }));

function fakeFetch(response) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response() : response;
  };
  return { calls, fetchFn };
}

describe('buildRequestBody', () => {
  it('describes the court from the Jev paddle point of view', () => {
    const match = createMatch();
    match.ball = { x: 512.4, y: 140.2, vx: 310.2, vy: -160.4 };
    match.paddles.jev = 210.3;

    const body = buildRequestBody(match);

    assert.equal(body.model, 'jev-latest');
    assert.deepEqual(body.state, {
      court: { width: 800, height: 400 },
      ball: { x: 512, y: 140, vx: 310, vy: -160 },
      yourPaddle: { x: 770, centerY: 210, height: 80 },
      ballMovingTowardYou: true,
    });
    assert.equal(body.questions.target.type, 'choice');
    assert.match(body.questions.target.instructions, /right paddle/);
    assert.deepEqual(Object.keys(body.questions.target.criteria), ZONES);
  });

  it('flags a ball moving away from Jev', () => {
    const match = createMatch();
    match.ball.vx = -300;
    assert.equal(buildRequestBody(match).state.ballMovingTowardYou, false);
  });
});

describe('requestZone', () => {
  it('posts the body with the key and returns the chosen zone', async () => {
    const body = buildRequestBody(createMatch());
    const { calls, fetchFn } = fakeFetch(answer('lower'));

    const zone = await requestZone({ apiKey: 'sk-test', body, fetchFn });

    assert.equal(zone, 'lower');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/systemone');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), body);
  });

  for (const [status, kind] of [[401, 'auth'], [403, 'auth'], [429, 'rate-limit'], [400, 'server'],
    [500, 'server'], [502, 'server']]) {
    it(`maps HTTP ${status} to "${kind}"`, async () => {
      const { fetchFn } = fakeFetch(() => new Response('{}', { status }));
      await assert.rejects(requestZone({ apiKey: 'k', body: {}, fetchFn }), { name: 'JevError', kind });
    });
  }

  it('rejects an unknown zone', async () => {
    const { fetchFn } = fakeFetch(answer('sideways'));
    await assert.rejects(requestZone({ apiKey: 'k', body: {}, fetchFn }), { kind: 'invalid-answer' });
  });

  it('rejects a body that is not JSON', async () => {
    const { fetchFn } = fakeFetch(new Response('oops'));
    await assert.rejects(requestZone({ apiKey: 'k', body: {}, fetchFn }), { kind: 'invalid-answer' });
  });

  it('reports an unreachable local server', async () => {
    const fetchFn = async () => {
      throw new TypeError('fetch failed');
    };
    await assert.rejects(requestZone({ apiKey: 'k', body: {}, fetchFn }), { kind: 'unreachable' });
  });

  it('times out a slow request', async () => {
    const fetchFn = (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
    await assert.rejects(requestZone({ apiKey: 'k', body: {}, fetchFn, timeoutMs: 10 }), { kind: 'timeout' });
  });
});

describe('errors', () => {
  it('maps status codes to error kinds', () => {
    assert.equal(errorKindForStatus(401), 'auth');
    assert.equal(errorKindForStatus(403), 'auth');
    assert.equal(errorKindForStatus(429), 'rate-limit');
    assert.equal(errorKindForStatus(503), 'server');
  });

  it('describes each kind for the player', () => {
    assert.equal(describeError('auth'), 'Invalid API key');
    assert.equal(describeError('rate-limit'), 'Rate limited');
    assert.equal(describeError('unreachable'), 'Cannot reach the local server');
    assert.equal(describeError('server'), 'Connection lost');
    assert.equal(describeError('timeout'), 'Connection lost');
    assert.equal(describeError('invalid-answer'), 'Connection lost');
  });

  it('carries its kind and message', () => {
    const error = new JevError('auth');
    assert.ok(error instanceof Error);
    assert.equal(error.kind, 'auth');
    assert.equal(error.message, 'Invalid API key');
  });
});
