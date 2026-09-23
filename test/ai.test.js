import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LatencyStats,
  ZONE_TARGET_Y,
  backoffDelay,
  createJevController,
  latencyLevel,
  paddleTargetY,
} from '../src/ai.js';
import { JevError } from '../src/api.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

// Controller wired to a fake clock, fake timers and requests the test resolves by hand.
function createHarness() {
  const timers = [];
  const calls = [];
  const errors = [];
  let recoveries = 0;
  let clock = 0;
  let ballMovingTowardYou = true;
  const controller = createJevController({
    apiKey: 'sk-test',
    getBody: () => ({ sent: calls.length, state: { ballMovingTowardYou } }),
    onError: (error) => errors.push(error),
    onRecover: () => {
      recoveries += 1;
    },
    requestDecisionFn: (args) => new Promise((resolve, reject) => calls.push({ args, resolve, reject })),
    now: () => clock,
    setTimer: (fn, ms) => {
      const timer = { fn, ms };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      const index = timers.indexOf(timer);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    },
  });
  return {
    controller,
    calls,
    errors,
    timers,
    get recoveries() {
      return recoveries;
    },
    set ballMovingTowardYou(value) {
      ballMovingTowardYou = value;
    },
    advance(ms) {
      clock += ms;
    },
    async fireTimer() {
      const timer = timers.shift();
      timer.fn();
      await settle();
      return timer.ms;
    },
    async answer(zone, aim = 'straight') {
      calls.at(-1).resolve({ zone, aim });
      await settle();
    },
    async fail(kind) {
      calls.at(-1).reject(new JevError(kind));
      await settle();
    },
  };
}

describe('helpers', () => {
  it('maps zones to their centers', () => {
    assert.deepEqual(Object.values(ZONE_TARGET_Y), [20, 60, 100, 140, 180, 220, 260, 300, 340, 380]);
  });

  it('offsets the paddle so the ball hits the side that sends it where Jev aims', () => {
    assert.equal(paddleTargetY({ zone: 'y240-280', aim: 'straight' }, true), 260);
    assert.equal(paddleTargetY({ zone: 'y240-280', aim: 'up' }, true), 275);
    assert.equal(paddleTargetY({ zone: 'y240-280', aim: 'down' }, true), 245);
  });

  it('recenters without offset while the ball moves away', () => {
    assert.equal(paddleTargetY({ zone: 'y0-40', aim: 'up' }, false), 200);
  });

  it('backs off 0.5, 1, 2, 4, then 8 s', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(backoffDelay), [500, 1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it('grades latency', () => {
    assert.equal(latencyLevel(149), 'good');
    assert.equal(latencyLevel(150), 'fair');
    assert.equal(latencyLevel(300), 'fair');
    assert.equal(latencyLevel(301), 'poor');
  });
});

describe('LatencyStats', () => {
  it('is empty at first', () => {
    const stats = new LatencyStats();
    assert.equal(stats.last, null);
    assert.equal(stats.average, null);
  });

  it('keeps the last 20 samples', () => {
    const stats = new LatencyStats();
    for (let ms = 1; ms <= 25; ms++) {
      stats.add(ms);
    }
    assert.equal(stats.samples.length, 20);
    assert.equal(stats.samples[0], 6);
    assert.equal(stats.last, 25);
    assert.equal(stats.average, 15.5);
  });
});

describe('createJevController', () => {
  it('aims at the middle before the first answer', () => {
    assert.equal(createHarness().controller.targetY, 200);
  });

  it('keeps exactly one request in flight', async () => {
    const h = createHarness();
    h.controller.start();
    h.controller.start();
    assert.equal(h.timers.length, 1);
    assert.equal(await h.fireTimer(), 0);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].args.apiKey, 'sk-test');
    assert.deepEqual(h.calls[0].args.body, { sent: 0, state: { ballMovingTowardYou: true } });
    assert.equal(h.timers.length, 0);
  });

  it('applies an answer, records latency and asks again', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    h.advance(120);
    await h.answer('y240-280', 'down');
    assert.equal(h.controller.targetY, 245);
    assert.equal(h.controller.stats.last, 120);
    assert.equal(h.timers.length, 1);
    assert.equal(h.timers[0].ms, 0);
  });

  it('waits at least 50 ms between requests', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    h.advance(20);
    await h.answer('y0-40');
    assert.equal(h.timers[0].ms, 30);
  });

  it('backs off on failures, then recovers', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    await h.fail('server');
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0].kind, 'server');
    assert.equal(await h.fireTimer(), 500);
    await h.fail('timeout');
    assert.equal(await h.fireTimer(), 1000);
    assert.equal(h.recoveries, 0);
    await h.answer('y0-40');
    assert.equal(h.recoveries, 1);
    assert.equal(h.controller.targetY, 20);
    assert.equal(h.controller.stats.samples.length, 1);
  });

  it('recovers after a failure even when restarted in between', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    await h.fail('server');
    h.controller.stop();
    h.controller.start();
    await h.fireTimer();
    await h.answer('y0-40');
    assert.equal(h.recoveries, 1);
  });

  it('stops on an invalid key', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    await h.fail('auth');
    assert.equal(h.errors[0].kind, 'auth');
    assert.equal(h.timers.length, 0);
  });

  it('discards an answer that arrives after stop', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    h.controller.stop();
    await h.answer('y360-400');
    assert.equal(h.controller.targetY, 200);
    assert.equal(h.controller.stats.last, null);
    assert.equal(h.timers.length, 0);
  });

  it('cancels a pending request on stop', () => {
    const h = createHarness();
    h.controller.start();
    h.controller.stop();
    assert.equal(h.timers.length, 0);
  });

  it('aborts the in-flight request on stop', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    assert.equal(h.calls[0].args.signal.aborted, false);
    h.controller.stop();
    assert.equal(h.calls[0].args.signal.aborted, true);
  });

  it('recenters while the ball moves away, whatever Jev answers, and keeps asking', async () => {
    const h = createHarness();
    h.ballMovingTowardYou = false;
    h.controller.start();
    await h.fireTimer();
    h.advance(90);
    await h.answer('y360-400', 'up');
    assert.equal(h.controller.targetY, 200);
    assert.equal(h.controller.stats.last, 90);
    assert.equal(h.timers.length, 1);
  });

  it('judges the recentering from the body sent with the request', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    // The ball turns around while the request is in flight; the answer still applies to the sent state.
    h.ballMovingTowardYou = false;
    await h.answer('y360-400');
    assert.equal(h.controller.targetY, 380);
  });

  it('resets the target to the middle', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    await h.answer('y360-400');
    h.controller.reset();
    assert.equal(h.controller.targetY, 200);
  });
});
