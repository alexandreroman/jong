import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COURT,
  createMatch,
  isMatchOver,
  matchWinner,
  predictArrivalAtJev,
  serveDirection,
  startRound,
  step,
} from '../src/game.js';

const FRAME = 1 / 30;
const speedOf = (ball) => Math.hypot(ball.vx, ball.vy);

function matchWithBall(ball, paddles = {}) {
  const match = createMatch();
  match.ball = { ...ball };
  match.paddles = { human: 200, jev: 200, ...paddles };
  return match;
}

function scorePoint(match, scorer) {
  match.ball = scorer === 'human'
    ? { x: COURT.width + 100, y: 200, vx: 1, vy: 0 }
    : { x: -100, y: 200, vx: -1, vy: 0 };
  return step(match, 1 / 60, {}).scorer;
}

describe('createMatch', () => {
  it('starts before round 1 with a centered, still ball', () => {
    assert.deepEqual(createMatch(), {
      round: 0,
      results: [],
      score: { human: 0, jev: 0 },
      ball: { x: 400, y: 200, vx: 0, vy: 0 },
      paddles: { human: 200, jev: 200 },
    });
  });
});

describe('startRound', () => {
  it('alternates the serve: human, Jev, human', () => {
    assert.equal(serveDirection(1), -1);
    assert.equal(serveDirection(2), 1);
    assert.equal(serveDirection(3), -1);

    const match = createMatch();
    const straight = () => 0.5;
    assert.equal(startRound(match, straight).ball.vx, -300);
    assert.equal(startRound(match, straight).ball.vx, 300);
    assert.equal(startRound(match, straight).ball.vx, -300);
    assert.equal(match.round, 3);
  });

  it('serves within ±30° at 300 px/s from the center', () => {
    const match = startRound(createMatch(), () => 0);
    assert.equal(match.ball.x, 400);
    assert.equal(match.ball.y, 200);
    assert.ok(Math.abs(match.ball.vy - -150) < 1e-9);
    assert.ok(Math.abs(speedOf(match.ball) - 300) < 1e-9);
  });

  it('recenters both paddles', () => {
    const match = createMatch();
    match.paddles = { human: 50, jev: 350 };
    startRound(match, () => 0.5);
    assert.deepEqual(match.paddles, { human: 200, jev: 200 });
  });
});

describe('step: ball', () => {
  it('bounces off the top wall', () => {
    const match = matchWithBall({ x: 400, y: 8, vx: 0, vy: -300 });
    step(match, FRAME, {});
    assert.ok(match.ball.vy > 0);
    assert.ok(match.ball.y >= 5);
  });

  it('bounces off the bottom wall', () => {
    const match = matchWithBall({ x: 400, y: 392, vx: 0, vy: 300 });
    step(match, FRAME, {});
    assert.ok(match.ball.vy < 0);
    assert.ok(match.ball.y <= 395);
  });

  it('returns a center hit straight back, 5% faster', () => {
    const match = matchWithBall({ x: 40, y: 200, vx: -300, vy: 0 });
    assert.deepEqual(step(match, FRAME, {}), { scorer: null, hit: 'human' });
    assert.ok(match.ball.vx > 0);
    assert.ok(Math.abs(match.ball.vy) < 1e-9);
    assert.ok(Math.abs(speedOf(match.ball) - 315) < 1e-9);
  });

  it('deflects an edge hit by 60°', () => {
    const match = matchWithBall({ x: 40, y: 245, vx: -300, vy: 0 });
    step(match, FRAME, {});
    assert.ok(Math.abs(match.ball.vy - 315 * Math.sin(Math.PI / 3)) < 1e-9);
    assert.ok(match.ball.vx > 0);
  });

  it('bounces off the Jev paddle toward the human', () => {
    const match = matchWithBall({ x: 760, y: 200, vx: 300, vy: 0 });
    assert.equal(step(match, FRAME, { jevTargetY: 200 }).hit, 'jev');
    assert.ok(match.ball.vx < 0);
  });

  it('caps the ball speed at 700 px/s', () => {
    const match = matchWithBall({ x: 40, y: 200, vx: -690, vy: 0 });
    step(match, FRAME, {});
    assert.ok(Math.abs(speedOf(match.ball) - 700) < 1e-9);
  });

  it('never tunnels through a paddle at top speed', () => {
    const match = matchWithBall({ x: 60, y: 200, vx: -700, vy: 0 });
    for (let i = 0; i < 10 && match.ball.vx < 0; i++) {
      assert.equal(step(match, FRAME, {}).scorer, null);
    }
    assert.ok(match.ball.vx > 0);
  });

  it('reports no hit while the ball flies or bounces off a wall', () => {
    assert.equal(step(matchWithBall({ x: 400, y: 200, vx: 300, vy: 0 }), FRAME, {}).hit, null);
    assert.equal(step(matchWithBall({ x: 400, y: 8, vx: 0, vy: -300 }), FRAME, {}).hit, null);
  });

  it('reports neither a hit nor a point for an empty frame', () => {
    assert.deepEqual(step(matchWithBall({ x: 40, y: 200, vx: -300, vy: 0 }), 0, {}), { scorer: null, hit: null });
  });

  it('clamps a long frame to 1/30 s', () => {
    const match = matchWithBall({ x: 400, y: 200, vx: 300, vy: 0 });
    step(match, 1, { jevTargetY: 200 });
    assert.ok(Math.abs(match.ball.x - 410) < 1e-9);
  });
});

describe('step: scoring', () => {
  it('gives Jev the point when the ball leaves on the left', () => {
    const match = matchWithBall({ x: 30, y: 300, vx: -300, vy: 0 }, { human: 40 });
    let scorer = null;
    for (let i = 0; i < 10 && scorer === null; i++) {
      scorer = step(match, FRAME, {}).scorer;
    }
    assert.equal(scorer, 'jev');
    assert.deepEqual(match.score, { human: 0, jev: 1 });
    assert.deepEqual(match.results, ['jev']);
    assert.deepEqual(match.ball, { x: 400, y: 200, vx: 0, vy: 0 });
  });

  it('gives the human the point when the ball leaves on the right', () => {
    const match = createMatch();
    assert.equal(scorePoint(match, 'human'), 'human');
    assert.deepEqual(match.score, { human: 1, jev: 0 });
  });

  it('ends the match at 2-0 without a third round', () => {
    const match = createMatch();
    scorePoint(match, 'human');
    assert.equal(isMatchOver(match), false);
    scorePoint(match, 'human');
    assert.equal(isMatchOver(match), true);
    assert.equal(matchWinner(match), 'human');
    assert.deepEqual(match.results, ['human', 'human']);
  });

  it('plays a deciding third round at 1-1', () => {
    const match = createMatch();
    scorePoint(match, 'jev');
    scorePoint(match, 'human');
    assert.equal(isMatchOver(match), false);
    scorePoint(match, 'jev');
    assert.equal(isMatchOver(match), true);
    assert.equal(matchWinner(match), 'jev');
    assert.deepEqual(match.results, ['jev', 'human', 'jev']);
  });
});

describe('step: paddles', () => {
  it('moves the human paddle at 420 px/s with the keyboard', () => {
    const match = matchWithBall({ x: 400, y: 200, vx: 0, vy: 0 });
    step(match, FRAME, { humanDirection: 1 });
    assert.ok(Math.abs(match.paddles.human - 214) < 1e-9);
  });

  it('moves the human paddle toward the finger at 600 px/s', () => {
    const match = matchWithBall({ x: 400, y: 200, vx: 0, vy: 0 });
    step(match, FRAME, { humanTargetY: 300 });
    assert.ok(Math.abs(match.paddles.human - 220) < 1e-9);
  });

  it('stops exactly on a close touch target', () => {
    const match = matchWithBall({ x: 400, y: 200, vx: 0, vy: 0 });
    step(match, FRAME, { humanTargetY: 205 });
    assert.equal(match.paddles.human, 205);
  });

  it('moves the Jev paddle toward its target at 360 px/s', () => {
    const match = matchWithBall({ x: 400, y: 200, vx: 0, vy: 0 });
    step(match, FRAME, { jevTargetY: 360 });
    assert.ok(Math.abs(match.paddles.jev - 212) < 1e-9);
  });

  it('keeps paddles inside the court', () => {
    const match = matchWithBall({ x: 400, y: 200, vx: 0, vy: 0 }, { human: 355, jev: 45 });
    step(match, FRAME, { humanDirection: 1, jevTargetY: 0 });
    assert.equal(match.paddles.human, 360);
    assert.equal(match.paddles.jev, 40);
  });
});

describe('predictArrivalAtJev', () => {
  it('is null while the ball moves away from Jev or stands still', () => {
    assert.equal(predictArrivalAtJev({ x: 400, y: 200, vx: -300, vy: 50 }), null);
    assert.equal(predictArrivalAtJev({ x: 400, y: 200, vx: 0, vy: 0 }), null);
  });

  it('times the ball edge reaching the paddle face', () => {
    // The ball edge meets x 770 when its center is at 765.
    assert.deepEqual(predictArrivalAtJev({ x: 465, y: 200, vx: 300, vy: 0 }), { seconds: 1, wallBounces: 0 });
  });

  it('counts no bounce when the ball center stops short of a wall', () => {
    // Ends at y 394, just above the 395 limit of the ball center.
    assert.deepEqual(predictArrivalAtJev({ x: 465, y: 200, vx: 300, vy: 194 }), { seconds: 1, wallBounces: 0 });
  });

  it('counts bounces off the top and bottom walls, accounting for the ball size', () => {
    assert.equal(predictArrivalAtJev({ x: 465, y: 200, vx: 300, vy: 196 }).wallBounces, 1);
    assert.equal(predictArrivalAtJev({ x: 465, y: 200, vx: 300, vy: -196 }).wallBounces, 1);
    // 200 + 600 = 800 unfolded: past the bottom limit (395), then past the top one (5).
    assert.equal(predictArrivalAtJev({ x: 465, y: 200, vx: 300, vy: 600 }).wallBounces, 2);
    assert.equal(predictArrivalAtJev({ x: 465, y: 200, vx: 300, vy: -600 }).wallBounces, 2);
  });

  it('agrees with the simulated wall bounces', () => {
    const ball = { x: 100, y: 120, vx: 250, vy: -420 };
    const { seconds, wallBounces } = predictArrivalAtJev(ball);
    // Paddles out of the way, so only the walls deflect the ball.
    const match = matchWithBall(ball, { human: 360, jev: 360 });
    let bounces = 0;
    let elapsed = 0;
    while (elapsed + 1 / 600 <= seconds) {
      const vyBefore = match.ball.vy;
      step(match, 1 / 600, { jevTargetY: 360 });
      if (Math.sign(match.ball.vy) !== Math.sign(vyBefore)) {
        bounces += 1;
      }
      elapsed += 1 / 600;
    }
    assert.equal(bounces, wallBounces);
  });
});
