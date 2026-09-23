// Pure match logic for Jong: physics, scoring and rounds. No DOM, no clock, no global randomness.

export const COURT = { width: 800, height: 400 };
export const PADDLE = { width: 10, height: 80, margin: 20 };
export const BALL_SIZE = 10;
export const ROUNDS = 3;
export const SERVE_SPEED = 300;
export const MAX_SERVE_ANGLE = Math.PI / 6;
export const SPEED_UP = 1.05;
export const MAX_BALL_SPEED = 700;
export const MAX_BOUNCE_ANGLE = Math.PI / 3;
export const PADDLE_SPEED = { keyboard: 420, touch: 600, jev: 360 };
export const MAX_FRAME_DT = 1 / 30;
export const LEFT_PADDLE_X = PADDLE.margin;
export const RIGHT_PADDLE_X = COURT.width - PADDLE.margin - PADDLE.width;

const MAX_SUBSTEP_PX = 5;
const BALL_HALF = BALL_SIZE / 2;
const PADDLE_HALF = PADDLE.height / 2;

function centeredBall() {
  return { x: COURT.width / 2, y: COURT.height / 2, vx: 0, vy: 0 };
}

function centeredPaddles() {
  return { human: COURT.height / 2, jev: COURT.height / 2 };
}

/** Creates a match before its first round. */
export function createMatch() {
  return {
    round: 0,
    results: [],
    score: { human: 0, jev: 0 },
    ball: centeredBall(),
    paddles: centeredPaddles(),
  };
}

/** Rounds 1 and 3 are served toward the human (left), round 2 toward Jev (right). */
export function serveDirection(round) {
  return round % 2 === 1 ? -1 : 1;
}

/** Starts the next round: recenters everything and serves at a random angle within ±30°. */
export function startRound(match, random = Math.random) {
  match.round += 1;
  const angle = (random() * 2 - 1) * MAX_SERVE_ANGLE;
  const direction = serveDirection(match.round);
  match.ball = {
    x: COURT.width / 2,
    y: COURT.height / 2,
    vx: direction * SERVE_SPEED * Math.cos(angle),
    vy: SERVE_SPEED * Math.sin(angle),
  };
  match.paddles = centeredPaddles();
  return match;
}

/**
 * Advances the match by `dt` seconds (clamped to 1/30 s).
 *
 * @returns {'human' | 'jev' | null} the player who scored during this step, if any
 */
export function step(match, dt, controls) {
  const t = Math.min(dt, MAX_FRAME_DT);
  if (t <= 0) {
    return null;
  }
  movePaddles(match, t, controls);
  return moveBall(match, t);
}

/**
 * Predicts when a ball moving toward Jev reaches the Jev paddle face, and how many times it bounces
 * off the top and bottom walls on the way. Walls reflect the ball center at BALL_SIZE/2 from each
 * edge, as in bounceOffWalls.
 *
 * @returns {{ seconds: number, wallBounces: number } | null} null when the ball is not moving toward Jev
 */
export function predictArrivalAtJev(ball) {
  if (ball.vx <= 0) {
    return null;
  }
  const distance = Math.max(0, RIGHT_PADDLE_X - BALL_HALF - ball.x);
  const seconds = distance / ball.vx;

  // Unfold the reflections: the ball center travels freely along a line where each span of
  // `travel` pixels is one crossing of the court, so the number of spans crossed is the number of bounces.
  const travel = COURT.height - BALL_SIZE;
  const unfoldedY = ball.y - BALL_HALF + ball.vy * seconds;
  const wallBounces = Math.abs(Math.floor(unfoldedY / travel));
  return { seconds, wallBounces };
}

export function isMatchOver(match) {
  return match.results.length >= ROUNDS;
}

export function matchWinner(match) {
  return match.score.human > match.score.jev ? 'human' : 'jev';
}

function movePaddles(match, t, { humanDirection = 0, humanTargetY = null, jevTargetY = COURT.height / 2 }) {
  const human = humanTargetY === null
    ? match.paddles.human + humanDirection * PADDLE_SPEED.keyboard * t
    : moveToward(match.paddles.human, humanTargetY, PADDLE_SPEED.touch * t);
  match.paddles.human = clampPaddle(human);
  match.paddles.jev = clampPaddle(moveToward(match.paddles.jev, jevTargetY, PADDLE_SPEED.jev * t));
}

function moveToward(current, target, maxDelta) {
  const delta = target - current;
  return Math.abs(delta) <= maxDelta ? target : current + Math.sign(delta) * maxDelta;
}

function clampPaddle(y) {
  return Math.min(Math.max(y, PADDLE_HALF), COURT.height - PADDLE_HALF);
}

// Sub-steps keep each move under 5 px, so the ball cannot skip over a 10 px paddle at top speed.
function moveBall(match, t) {
  const { ball } = match;
  const distance = Math.hypot(ball.vx, ball.vy) * t;
  const substeps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP_PX));
  const h = t / substeps;
  for (let i = 0; i < substeps; i++) {
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    bounceOffWalls(ball);
    bounceOffPaddles(match);
    const scorer = scorerOf(ball);
    if (scorer !== null) {
      recordPoint(match, scorer);
      return scorer;
    }
  }
  return null;
}

function bounceOffWalls(ball) {
  if (ball.y - BALL_HALF < 0) {
    ball.y = BALL_HALF;
    ball.vy = Math.abs(ball.vy);
  } else if (ball.y + BALL_HALF > COURT.height) {
    ball.y = COURT.height - BALL_HALF;
    ball.vy = -Math.abs(ball.vy);
  }
}

function bounceOffPaddles(match) {
  const { ball, paddles } = match;
  if (ball.vx < 0 && overlapsPaddle(ball, LEFT_PADDLE_X, paddles.human)) {
    ball.x = LEFT_PADDLE_X + PADDLE.width + BALL_HALF;
    deflect(ball, paddles.human, 1);
  } else if (ball.vx > 0 && overlapsPaddle(ball, RIGHT_PADDLE_X, paddles.jev)) {
    ball.x = RIGHT_PADDLE_X - BALL_HALF;
    deflect(ball, paddles.jev, -1);
  }
}

function overlapsPaddle(ball, paddleX, paddleY) {
  return ball.x + BALL_HALF >= paddleX
    && ball.x - BALL_HALF <= paddleX + PADDLE.width
    && Math.abs(ball.y - paddleY) <= PADDLE_HALF + BALL_HALF;
}

// The outgoing angle grows with the distance from the paddle center: straight at the center, 60° at the edge.
function deflect(ball, paddleY, direction) {
  const offset = Math.max(-1, Math.min(1, (ball.y - paddleY) / (PADDLE_HALF + BALL_HALF)));
  const angle = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(ball.vx, ball.vy) * SPEED_UP, MAX_BALL_SPEED);
  ball.vx = direction * speed * Math.cos(angle);
  ball.vy = speed * Math.sin(angle);
}

function scorerOf(ball) {
  if (ball.x + BALL_HALF < 0) {
    return 'jev';
  }
  if (ball.x - BALL_HALF > COURT.width) {
    return 'human';
  }
  return null;
}

function recordPoint(match, scorer) {
  match.score[scorer] += 1;
  match.results.push(scorer);
  match.ball = centeredBall();
}
