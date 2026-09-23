import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { QUIT_BUTTON, canvasToCourtY, hitTest } from '../src/renderer.js';

describe('hitTest', () => {
  const rect = { x: 100, y: 50, width: 40, height: 20 };

  it('accepts points inside the box, edges included', () => {
    assert.equal(hitTest(rect, { x: 120, y: 60 }), true);
    assert.equal(hitTest(rect, { x: 100, y: 50 }), true);
    assert.equal(hitTest(rect, { x: 140, y: 70 }), true);
  });

  it('rejects points outside the box', () => {
    assert.equal(hitTest(rect, { x: 99, y: 60 }), false);
    assert.equal(hitTest(rect, { x: 120, y: 71 }), false);
  });

  it('keeps buttons inside the court', () => {
    assert.ok(QUIT_BUTTON.x >= 0 && QUIT_BUTTON.x + QUIT_BUTTON.width <= 800);
    assert.ok(QUIT_BUTTON.y >= 0 && QUIT_BUTTON.y + QUIT_BUTTON.height <= 400);
  });
});

describe('canvasToCourtY', () => {
  it('maps the edges of the padded play field to the court edges', () => {
    assert.equal(canvasToCourtY(10), 0);
    assert.equal(canvasToCourtY(390), 400);
  });

  it('keeps the vertical center in place', () => {
    assert.equal(canvasToCourtY(200), 200);
  });

  it('maps the border area outside the court', () => {
    assert.ok(canvasToCourtY(2) < 0);
    assert.ok(canvasToCourtY(398) > 400);
  });
});
