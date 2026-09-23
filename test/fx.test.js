import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RECOIL_DISTANCE, RECOIL_DURATION_S, TRAIL_DURATION_S, createFx, recoilOffset, updateFx,
} from '../src/fx.js';

const FRAME = 1 / 60;
const ball = { x: 400, y: 200 };

function advance(fx, seconds, frame = FRAME) {
  for (let elapsed = 0; elapsed < seconds; elapsed += frame) {
    updateFx(fx, frame, { ball, hit: null });
  }
}

describe('createFx', () => {
  it('starts with no trail and both paddles at rest', () => {
    const fx = createFx();
    assert.deepEqual(fx, { trail: [], recoil: { human: 0, jev: 0 } });
    assert.equal(recoilOffset(fx, 'human'), 0);
    assert.equal(recoilOffset(fx, 'jev'), 0);
  });
});

describe('updateFx: trail', () => {
  it('records the ball positions, oldest first, aged by the frame time', () => {
    const fx = createFx();
    updateFx(fx, FRAME, { ball: { x: 100, y: 50 }, hit: null });
    updateFx(fx, FRAME, { ball: { x: 110, y: 55 }, hit: null });
    assert.deepEqual(fx.trail, [
      { x: 100, y: 50, age: FRAME },
      { x: 110, y: 55, age: 0 },
    ]);
  });

  it('copies the position so later ball moves do not bend the trail', () => {
    const fx = createFx();
    const moving = { x: 100, y: 50 };
    updateFx(fx, FRAME, { ball: moving, hit: null });
    moving.x = 300;
    assert.equal(fx.trail[0].x, 100);
  });

  it('drops positions older than the trail duration', () => {
    const fx = createFx();
    advance(fx, 1);
    assert.ok(fx.trail.every((point) => point.age < TRAIL_DURATION_S));
    // About 9 positions at 60 fps.
    assert.ok(fx.trail.length >= 8 && fx.trail.length <= 10, `${fx.trail.length} positions`);
  });

  it('spans the same time at any frame rate', () => {
    const at60 = createFx();
    const at144 = createFx();
    advance(at60, 1, 1 / 60);
    advance(at144, 1, 1 / 144);
    const span = (fx) => fx.trail[0].age;
    assert.ok(Math.abs(span(at60) - span(at144)) < 1 / 60);
  });
});

describe('updateFx: recoil', () => {
  it('kicks the hitting paddle back by the full distance', () => {
    const fx = createFx();
    updateFx(fx, FRAME, { ball, hit: 'jev' });
    assert.equal(recoilOffset(fx, 'jev'), RECOIL_DISTANCE);
    assert.equal(recoilOffset(fx, 'human'), 0);
  });

  it('eases back to rest, quickly at first, then slowly', () => {
    const fx = createFx();
    updateFx(fx, 0, { ball, hit: 'human' });
    updateFx(fx, RECOIL_DURATION_S / 2, { ball, hit: null });
    // Halfway through the duration, a quadratic ease-out leaves a quarter of the distance.
    assert.ok(Math.abs(recoilOffset(fx, 'human') - RECOIL_DISTANCE / 4) < 1e-9);
    updateFx(fx, RECOIL_DURATION_S, { ball, hit: null });
    assert.equal(recoilOffset(fx, 'human'), 0);
    assert.equal(fx.recoil.human, 0);
  });

  it('restarts the recoil on a new hit', () => {
    const fx = createFx();
    updateFx(fx, 0, { ball, hit: 'human' });
    updateFx(fx, RECOIL_DURATION_S / 2, { ball, hit: 'human' });
    assert.equal(recoilOffset(fx, 'human'), RECOIL_DISTANCE);
  });

  it('keeps the recoil over an empty frame', () => {
    const fx = createFx();
    updateFx(fx, 0, { ball, hit: 'jev' });
    updateFx(fx, FRAME, { ball, hit: null });
    const offset = recoilOffset(fx, 'jev');
    updateFx(fx, 0, { ball, hit: null });
    assert.equal(recoilOffset(fx, 'jev'), offset);
  });
});
