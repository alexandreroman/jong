import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LatencyStats,
  ZONE_TARGET_Y,
  backoffDelay,
  createJevController,
  latencyLevel,
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
  const controller = createJevController({
    apiKey: 'sk-test',
    getBody: () => ({ sent: calls.length }),
    onError: (error) => errors.push(error),
    onRecover: () => {
      recoveries += 1;
    },
    requestZoneFn: (args) => new Promise((resolve, reject) => calls.push({ args, resolve, reject })),
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
    advance(ms) {
      clock += ms;
    },
    async fireTimer() {
      const timer = timers.shift();
      timer.fn();
      await settle();
      return timer.ms;
    },
    async answer(zone) {
      calls.at(-1).resolve(zone);
      await settle();
    },
    async fail(kind) {
      calls.at(-1).reject(new JevError(kind));
      await settle();
    },
  };
}

describe('helpers', () => {
  it('maps zones to paddle targets', () => {
    assert.deepEqual(ZONE_TARGET_Y, { top: 40, upper: 120, middle: 200, lower: 280, bottom: 360 });
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
    assert.deepEqual(h.calls[0].args.body, { sent: 0 });
    assert.equal(h.timers.length, 0);
  });

  it('applies an answer, records latency and asks again', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    h.advance(120);
    await h.answer('lower');
    assert.equal(h.controller.targetY, 280);
    assert.equal(h.controller.stats.last, 120);
    assert.equal(h.timers.length, 1);
    assert.equal(h.timers[0].ms, 0);
  });

  it('waits at least 50 ms between requests', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    h.advance(20);
    await h.answer('top');
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
    await h.answer('top');
    assert.equal(h.recoveries, 1);
    assert.equal(h.controller.targetY, 40);
    assert.equal(h.controller.stats.samples.length, 1);
  });

  it('stops on an invalid key', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    await h.fail('auth');
    assert.equal(h.errors[0].kind, 'auth');
    assert.equal(h.controller.running, false);
    assert.equal(h.timers.length, 0);
  });

  it('discards an answer that arrives after stop', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    h.controller.stop();
    await h.answer('bottom');
    assert.equal(h.controller.targetY, 200);
    assert.equal(h.controller.stats.last, null);
    assert.equal(h.timers.length, 0);
  });

  it('cancels a pending request on stop', () => {
    const h = createHarness();
    h.controller.start();
    h.controller.stop();
    assert.equal(h.timers.length, 0);
    assert.equal(h.controller.running, false);
  });

  it('resets the target to the middle', async () => {
    const h = createHarness();
    h.controller.start();
    await h.fireTimer();
    await h.answer('bottom');
    h.controller.reset();
    assert.equal(h.controller.targetY, 200);
  });
});
