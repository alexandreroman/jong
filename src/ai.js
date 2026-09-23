// Jev decision loop: keeps one request in flight, turns answers into paddle targets,
// tracks latency and retries failures with backoff.

import { ZONES, ZONE_HEIGHT, requestDecision } from './api.js';
import { COURT } from './game.js';

// Center of each zone. No zone is centered on the court middle, hence COURT_MIDDLE_Y.
export const ZONE_TARGET_Y = Object.fromEntries(
  ZONES.map((zone, index) => [zone, index * ZONE_HEIGHT + ZONE_HEIGHT / 2]),
);
const COURT_MIDDLE_Y = COURT.height / 2;
// Hitting the ball off-center angles it: the ball must meet the upper part of the paddle to go up.
// Budget: the ball lands up to 20 px (half a zone) from the zone center; adding this 15 px offset gives 35 px,
// which leaves 10 px of the 45 px hit tolerance (PADDLE.height / 2 + BALL_SIZE / 2) as slack for wall-clamp
// drift (bounceOffWalls clamps without reflecting the overshoot), rounding of the state sent to Jev, and
// imperfect estimates.
const AIM_OFFSET_PX = 15;
const AIM_OFFSETS = { up: AIM_OFFSET_PX, straight: 0, down: -AIM_OFFSET_PX };
const BACKOFF_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
const MIN_REQUEST_GAP_MS = 50;
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
 * Paddle target for a Jev decision. The paddle recenters while the ball moves away, whatever Jev answered.
 */
export function paddleTargetY({ zone, aim }, ballMovingTowardYou) {
  if (!ballMovingTowardYou) {
    return COURT_MIDDLE_Y;
  }
  return ZONE_TARGET_Y[zone] + AIM_OFFSETS[aim];
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
  requestDecisionFn = requestDecision,
  now = () => performance.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let running = false;
  // Bumped on every start and stop, so answers from an earlier run are ignored.
  let generation = 0;
  let timer = null;
  let failures = 0;
  let targetY = COURT_MIDDLE_Y;
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
      const body = getBody();
      const decision = await requestDecisionFn({ apiKey, body, signal: abortController.signal });
      if (runGeneration !== generation) {
        return;
      }
      const elapsed = now() - startedAt;
      stats.add(elapsed);
      targetY = paddleTargetY(decision, body.state.ballMovingTowardYou);
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
      targetY = COURT_MIDDLE_Y;
    },
    get targetY() {
      return targetY;
    },
    stats,
  };
}
