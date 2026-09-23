import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AIMS,
  JevError,
  ZONES,
  buildRequestBody,
  describeError,
  requestDecision,
} from '../src/api.js';
import { createMatch } from '../src/game.js';

const answer = (zone, aim = 'straight') => new Response(JSON.stringify({
  answers: { target: { type: 'choice', choice: zone }, aim: { type: 'choice', choice: aim } },
}));

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
    match.ball = { x: 512.4, y: 140.2, vx: 310.2, vy: -300.4 };
    match.paddles.jev = 210.3;
    match.paddles.human = 95.6;

    const body = buildRequestBody(match);

    assert.equal(body.model, 'jev-latest');
    assert.deepEqual(body.state, {
      court: { width: 800, height: 400 },
      ball: { x: 512, y: 140, vx: 310, vy: -300 },
      yourPaddle: { x: 770, centerY: 210, height: 80 },
      opponentPaddle: { x: 20, centerY: 96 },
      ballMovingTowardYou: true,
      // (765 - 512.4) / 310.2 = 0.814 s, and 140.2 - 300.4 * 0.814 goes past the top wall once.
      timeToReachYou: 0.81,
      wallBounces: 1,
    });
  });

  it('asks for a target zone and an aim', () => {
    const { questions } = buildRequestBody(createMatch());
    assert.equal(questions.target.type, 'choice');
    assert.match(questions.target.instructions, /right paddle/);
    assert.match(questions.target.instructions, /timeToReachYou/);
    assert.match(questions.target.instructions, /wallBounces/);
    assert.deepEqual(Object.keys(questions.target.criteria), ZONES);
    assert.equal(questions.aim.type, 'choice');
    assert.match(questions.aim.instructions, /opponentPaddle/);
    assert.deepEqual(Object.keys(questions.aim.criteria), AIMS);
  });

  it('flags a ball moving away from Jev and omits the arrival hints', () => {
    const match = createMatch();
    match.ball.vx = -300;
    const { state } = buildRequestBody(match);
    assert.equal(state.ballMovingTowardYou, false);
    assert.equal('timeToReachYou' in state, false);
    assert.equal('wallBounces' in state, false);
  });
});

describe('requestDecision', () => {
  it('posts the body with the key and returns the chosen zone and aim', async () => {
    const body = buildRequestBody(createMatch());
    const { calls, fetchFn } = fakeFetch(answer('y240-280', 'up'));

    const decision = await requestDecision({ apiKey: 'sk-test', body, fetchFn });

    assert.deepEqual(decision, { zone: 'y240-280', aim: 'up' });
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
      await assert.rejects(requestDecision({ apiKey: 'k', body: {}, fetchFn }), { name: 'JevError', kind });
    });
  }

  it('rejects an unknown zone', async () => {
    const { fetchFn } = fakeFetch(answer('middle'));
    await assert.rejects(requestDecision({ apiKey: 'k', body: {}, fetchFn }), { kind: 'invalid-answer' });
  });

  it('rejects an unknown aim', async () => {
    const { fetchFn } = fakeFetch(answer('y0-40', 'sideways'));
    await assert.rejects(requestDecision({ apiKey: 'k', body: {}, fetchFn }), { kind: 'invalid-answer' });
  });

  it('rejects an answer without an aim', async () => {
    const { fetchFn } = fakeFetch(new Response(JSON.stringify({ answers: { target: { choice: 'y0-40' } } })));
    await assert.rejects(requestDecision({ apiKey: 'k', body: {}, fetchFn }), { kind: 'invalid-answer' });
  });

  it('rejects a body that is not JSON', async () => {
    const { fetchFn } = fakeFetch(new Response('oops'));
    await assert.rejects(requestDecision({ apiKey: 'k', body: {}, fetchFn }), { kind: 'invalid-answer' });
  });

  it('reports an unreachable local server', async () => {
    const fetchFn = async () => {
      throw new TypeError('fetch failed');
    };
    await assert.rejects(requestDecision({ apiKey: 'k', body: {}, fetchFn }), { kind: 'unreachable' });
  });

  it('times out a slow request', async () => {
    const fetchFn = (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
    await assert.rejects(requestDecision({ apiKey: 'k', body: {}, fetchFn, timeoutMs: 10 }), { kind: 'timeout' });
  });

  it("aborts when the caller's signal aborts", async () => {
    const fetchFn = (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
    const external = new AbortController();
    const promise = requestDecision({ apiKey: 'k', body: {}, fetchFn, timeoutMs: 5000, signal: external.signal });
    external.abort();
    await assert.rejects(promise, { name: 'JevError' });
  });
});

describe('errors', () => {
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
