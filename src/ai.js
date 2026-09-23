// Jev decision loop: keeps one request in flight, turns answers into paddle targets,
// tracks latency and retries failures with backoff.

import { requestZone } from './api.js';

export const ZONE_TARGET_Y = { top: 40, upper: 120, middle: 200, lower: 280, bottom: 360 };
export const BACKOFF_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
export const MIN_REQUEST_GAP_MS = 50;
export const LATENCY_WINDOW = 20;

/** Delay before the 0-based retry `attempt`, capped at the last value. */
export function backoffDelay(attempt) {
  return BACKOFF_DELAYS_MS[Math.min(attempt, BACKOFF_DELAYS_MS.length - 1)];
}

export function latencyLevel(ms) {
  if (ms < 150) {
    return 'good';
  }
  return ms <= 300 ? 'fair' : 'poor';
}

/** Round-trip latency of the last successful Jev calls. */
export class LatencyStats {
  samples = [];

  add(ms) {
    this.samples.push(ms);
    if (this.samples.length > LATENCY_WINDOW) {
      this.samples.shift();
    }
  }

  get last() {
    return this.samples.at(-1) ?? null;
  }

  get average() {
    if (this.samples.length === 0) {
      return null;
    }
    return this.samples.reduce((sum, ms) => sum + ms, 0) / this.samples.length;
  }
}

/**
 * Creates the loop that steers the Jev paddle. Time and I/O are injected so the loop can be tested.
 */
export function createJevController({
  apiKey,
  getBody,
  stats = new LatencyStats(),
  onError = () => {},
  onRecover = () => {},
  requestZoneFn = requestZone,
  now = () => performance.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let running = false;
  // Bumped on every start and stop, so answers from an earlier run are ignored.
  let generation = 0;
  let timer = null;
  let failures = 0;
  let targetY = ZONE_TARGET_Y.middle;
  let abortController = null;

  function schedule(delayMs, runGeneration) {
    timer = setTimer(() => {
      timer = null;
      tick(runGeneration);
    }, delayMs);
  }

  async function tick(runGeneration) {
    const startedAt = now();
    abortController = new AbortController();
    try {
      const zone = await requestZoneFn({ apiKey, body: getBody(), signal: abortController.signal });
      if (runGeneration !== generation) {
        return;
      }
      const elapsed = now() - startedAt;
      stats.add(elapsed);
      targetY = ZONE_TARGET_Y[zone];
      if (failures > 0) {
        failures = 0;
        onRecover();
      }
      schedule(Math.max(0, MIN_REQUEST_GAP_MS - elapsed), runGeneration);
    } catch (error) {
      if (runGeneration !== generation) {
        return;
      }
      onError(error);
      if (error.kind === 'auth') {
        stop();
        return;
      }
      schedule(backoffDelay(failures), runGeneration);
      failures += 1;
    }
  }

  function start() {
    if (running) {
      return;
    }
    running = true;
    failures = 0;
    generation += 1;
    schedule(0, generation);
  }

  function stop() {
    running = false;
    generation += 1;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    abortController?.abort();
  }

  return {
    start,
    stop,
    reset() {
      targetY = ZONE_TARGET_Y.middle;
    },
    get targetY() {
      return targetY;
    },
    get running() {
      return running;
    },
    stats,
  };
}
