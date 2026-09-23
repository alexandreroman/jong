// Jev API client: builds the paddle decision request, calls the local proxy and maps failures to typed errors.

import { COURT, LEFT_PADDLE_X, PADDLE, RIGHT_PADDLE_X, predictArrivalAtJev } from './game.js';

const API_PATH = '/api/systemone';
const MODEL = 'jev-latest';
const REQUEST_TIMEOUT_MS = 2000;
// Ten 40 px bands, ordered from the top of the court (y 0) to the bottom (y 400).
export const ZONES = [
  'y0-40', 'y40-80', 'y80-120', 'y120-160', 'y160-200',
  'y200-240', 'y240-280', 'y280-320', 'y320-360', 'y360-400',
];
export const ZONE_HEIGHT = COURT.height / ZONES.length;
export const AIMS = ['up', 'straight', 'down'];

const TARGET_INSTRUCTIONS = [
  'You control the right paddle in Pong. y grows downward, from 0 at the top to 400 at the bottom.',
  'Pick the zone containing the ball y at the moment it reaches your paddle.',
  'When ballMovingTowardYou is true, estimate that y as ball.y + ball.vy * timeToReachYou,',
  'then reflect it off the walls: the ball center bounces at y 5 and y 395,',
  'and wallBounces tells how many reflections happen before the ball reaches you.',
  'When the ball moves away, your paddle returns to the middle on its own, so any zone is fine.',
].join(' ');
const ZONE_NOTES = {
  'y0-40': ' (top edge)',
  'y160-200': ' (just above the middle)',
  'y200-240': ' (just below the middle)',
  'y360-400': ' (bottom edge)',
};
const TARGET_CRITERIA = Object.fromEntries(ZONES.map((zone, index) => {
  const top = index * ZONE_HEIGHT;
  const note = ZONE_NOTES[zone] ?? '';
  return [zone, `Ball reaches your paddle at y ${top}-${top + ZONE_HEIGHT}${note}`];
}));

const AIM_INSTRUCTIONS = [
  'Your opponent defends the left side; its paddle center is at opponentPaddle.centerY.',
  'In which direction should you send the ball back to make it hardest for the opponent to return?',
  'Aim away from the opponent paddle.',
].join(' ');
const AIM_CRITERIA = {
  up: 'Send the ball toward the top of the court (y 0), best when the opponent is low',
  straight: 'Send the ball straight back, best when the opponent is far from the ball height',
  down: 'Send the ball toward the bottom of the court (y 400), best when the opponent is high',
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

function errorKindForStatus(status) {
  if (status === 401 || status === 403) {
    return 'auth';
  }
  return status === 429 ? 'rate-limit' : 'server';
}

/** Builds the Jev request for the current match, seen from the right (Jev) paddle. */
export function buildRequestBody(match) {
  const { ball } = match;
  const state = {
    court: { width: COURT.width, height: COURT.height },
    ball: { x: Math.round(ball.x), y: Math.round(ball.y), vx: Math.round(ball.vx), vy: Math.round(ball.vy) },
    yourPaddle: { x: RIGHT_PADDLE_X, centerY: Math.round(match.paddles.jev), height: PADDLE.height },
    opponentPaddle: { x: LEFT_PADDLE_X, centerY: Math.round(match.paddles.human) },
    ballMovingTowardYou: ball.vx > 0,
  };
  // Arrival hints are omitted while the ball moves away: there is nothing to intercept yet.
  const arrival = predictArrivalAtJev(ball);
  if (arrival !== null) {
    state.timeToReachYou = Math.round(arrival.seconds * 100) / 100;
    state.wallBounces = arrival.wallBounces;
  }
  return {
    model: MODEL,
    state,
    questions: {
      target: { type: 'choice', instructions: TARGET_INSTRUCTIONS, criteria: TARGET_CRITERIA },
      aim: { type: 'choice', instructions: AIM_INSTRUCTIONS, criteria: AIM_CRITERIA },
    },
  };
}

/**
 * Asks Jev where its paddle should go and where it wants to send the ball back.
 *
 * @returns {Promise<{ zone: string, aim: string }>} zone is one of ZONES, aim one of AIMS
 * @throws {JevError}
 */
export async function requestDecision({
  apiKey,
  body,
  // Wrapped so the browser's fetch is never called with a foreign `this`.
  fetchFn = (...args) => globalThis.fetch(...args),
  timeoutMs = REQUEST_TIMEOUT_MS,
  signal,
}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response;
  try {
    response = await fetchFn(API_PATH, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch {
    throw new JevError(timeout.aborted ? 'timeout' : 'unreachable');
  }

  if (!response.ok) {
    throw new JevError(errorKindForStatus(response.status));
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new JevError(timeout.aborted ? 'timeout' : 'invalid-answer');
  }

  const zone = payload?.answers?.target?.choice;
  const aim = payload?.answers?.aim?.choice;
  if (!ZONES.includes(zone) || !AIMS.includes(aim)) {
    throw new JevError('invalid-answer');
  }
  return { zone, aim };
}
