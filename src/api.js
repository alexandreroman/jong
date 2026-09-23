// Jev API client: builds the paddle decision request, calls the local proxy and maps failures to typed errors.

import { COURT, PADDLE, RIGHT_PADDLE_X } from './game.js';

export const API_PATH = '/api/systemone';
export const MODEL = 'jev-latest';
export const REQUEST_TIMEOUT_MS = 2000;
export const ZONES = ['top', 'upper', 'middle', 'lower', 'bottom'];

const INSTRUCTIONS = 'You control the right paddle in Pong. Where should it move to intercept the ball?';
const CRITERIA = {
  top: 'Top fifth of the court (y 0-80)',
  upper: 'Upper fifth of the court (y 80-160)',
  middle: 'Middle fifth of the court (y 160-240)',
  lower: 'Lower fifth of the court (y 240-320)',
  bottom: 'Bottom fifth of the court (y 320-400)',
};

const MESSAGES = {
  auth: 'Invalid API key',
  'rate-limit': 'Rate limited',
  unreachable: 'Cannot reach the local server',
};

/** Player-facing description of an error kind, without any "retrying" suffix. */
export function describeError(kind) {
  return MESSAGES[kind] ?? 'Connection lost';
}

export class JevError extends Error {
  /** @param {'auth'|'rate-limit'|'server'|'unreachable'|'timeout'|'invalid-answer'} kind */
  constructor(kind) {
    super(describeError(kind));
    this.name = 'JevError';
    this.kind = kind;
  }
}

export function errorKindForStatus(status) {
  if (status === 401 || status === 403) {
    return 'auth';
  }
  return status === 429 ? 'rate-limit' : 'server';
}

/** Builds the Jev request for the current match, seen from the right (Jev) paddle. */
export function buildRequestBody(match) {
  const { ball } = match;
  return {
    model: MODEL,
    state: {
      court: { width: COURT.width, height: COURT.height },
      ball: { x: Math.round(ball.x), y: Math.round(ball.y), vx: Math.round(ball.vx), vy: Math.round(ball.vy) },
      yourPaddle: { x: RIGHT_PADDLE_X, centerY: Math.round(match.paddles.jev), height: PADDLE.height },
      ballMovingTowardYou: ball.vx > 0,
    },
    questions: {
      target: { type: 'choice', instructions: INSTRUCTIONS, criteria: CRITERIA },
    },
  };
}

/**
 * Asks Jev where its paddle should go.
 *
 * @returns {Promise<string>} one of ZONES
 * @throws {JevError}
 */
export async function requestZone({
  apiKey,
  body,
  // Wrapped so the browser's fetch is never called with a foreign `this`.
  fetchFn = (...args) => globalThis.fetch(...args),
  timeoutMs = REQUEST_TIMEOUT_MS,
  signal,
}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      onExternalAbort();
    } else {
      signal.addEventListener('abort', onExternalAbort);
    }
  }

  try {
    let response;
    try {
      response = await fetchFn(API_PATH, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new JevError(timedOut ? 'timeout' : 'unreachable');
    }

    if (!response.ok) {
      throw new JevError(errorKindForStatus(response.status));
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new JevError(timedOut ? 'timeout' : 'invalid-answer');
    }

    const zone = payload?.answers?.target?.choice;
    if (!ZONES.includes(zone)) {
      throw new JevError('invalid-answer');
    }
    return zone;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
