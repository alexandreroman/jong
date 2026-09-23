import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeCanvasSize } from '../src/viewport.js';

describe('computeCanvasSize', () => {
  it('caps the size at 800x400 on a large viewport', () => {
    assert.deepEqual(computeCanvasSize(1920, 1080), { width: 800, height: 400 });
  });

  it('keeps the 800x400 cap when the viewport is just large enough for the margins', () => {
    assert.deepEqual(computeCanvasSize(832, 432), { width: 800, height: 400 });
  });

  it('fits the width of a portrait phone, inside the margins', () => {
    // 375 - 2 * 16 = 343 px available.
    assert.deepEqual(computeCanvasSize(375, 812), { width: 343, height: 171.5 });
  });

  it('fits the height of a short viewport, inside the margins', () => {
    // 300 - 2 * 16 = 268 px available.
    assert.deepEqual(computeCanvasSize(700, 300), { width: 536, height: 268 });
  });

  it('never returns a negative size on a viewport smaller than the margins', () => {
    assert.deepEqual(computeCanvasSize(20, 10), { width: 0, height: 0 });
  });
});
