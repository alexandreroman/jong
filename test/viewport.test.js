import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeCanvasSize } from '../src/viewport.js';

describe('computeCanvasSize', () => {
  it('caps the size at 800x400 on a large viewport', () => {
    assert.deepEqual(computeCanvasSize(1920, 1080), { width: 800, height: 400 });
  });

  it('fits the width of a portrait phone', () => {
    assert.deepEqual(computeCanvasSize(375, 812), { width: 375, height: 187.5 });
  });

  it('fits the height of a short viewport', () => {
    assert.deepEqual(computeCanvasSize(700, 300), { width: 600, height: 300 });
  });
});
