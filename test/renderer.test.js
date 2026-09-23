import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALL_SIZE } from '../src/game.js';
import {
  KEY_FIELD, PAUSE_BUTTON, QUIT_BUTTON, START_BUTTON, canvasToCourtY, caretVisible, hitTest, render,
} from '../src/renderer.js';

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

describe('caretVisible', () => {
  it('blinks on for about 530 ms, then off for the same time', () => {
    assert.equal(caretVisible(1000, 1000), true);
    assert.equal(caretVisible(1529, 1000), true);
    assert.equal(caretVisible(1530, 1000), false);
    assert.equal(caretVisible(2059, 1000), false);
    assert.equal(caretVisible(2060, 1000), true);
  });

  it('shows the caret when the blink restarts in the future of the frame time', () => {
    assert.equal(caretVisible(990, 1000), true);
  });
});

// Records every drawing call and the style in effect, and fakes text metrics: 10 px per character, ink 12 px
// above and 2 px below the baseline.
function recordingContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['clearRect', 'fillRect', 'beginPath', 'roundRect', 'rect', 'clip', 'stroke', 'fill',
    'fillText', 'save', 'restore', 'moveTo', 'lineTo', 'arc', 'setLineDash', 'translate', 'scale', 'strokeRect']) {
    ctx[name] = (...args) => calls.push({ name, args, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle });
  }
  ctx.measureText = (text) => ({ width: text.length * 10, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 2 });
  return ctx;
}

function renderKeyEntry(overrides = {}) {
  const ctx = recordingContext();
  render(ctx, {
    screen: 'key-entry',
    keyLength: 0,
    keyFocused: false,
    keyCaretSince: 0,
    time: 0,
    message: null,
    touchMode: false,
    portrait: false,
    ...overrides,
  });
  return ctx.calls;
}

const isKeyFieldOutline = (call) => call.name === 'roundRect' && call.args[0] === KEY_FIELD.x
  && call.args[1] === KEY_FIELD.y;
const isCaret = (call) => call.name === 'fillRect' && call.args[2] === 2 && call.args[3] === 20;

describe('render key entry', () => {
  const fieldCenterY = KEY_FIELD.y + KEY_FIELD.height / 2;

  it('draws the key field and buttons with rounded corners', () => {
    const calls = renderKeyEntry();
    assert.ok(calls.some(isKeyFieldOutline));
    assert.ok(calls.some((call) => call.name === 'roundRect' && call.args[0] === START_BUTTON.x
      && call.args[4] === 8));
    assert.ok(!calls.some((call) => call.name === 'strokeRect'));
  });

  it('highlights the key field border only while it has focus', () => {
    const outlineColor = (calls) => {
      const outline = calls.findIndex(isKeyFieldOutline);
      return calls.slice(outline).find((call) => call.name === 'stroke').strokeStyle;
    };
    assert.equal(outlineColor(renderKeyEntry({ keyFocused: true })), '#fff');
    assert.equal(outlineColor(renderKeyEntry({ keyFocused: false })), '#888');
  });

  it('draws the caret right after the masked key, centered on the field', () => {
    const calls = renderKeyEntry({ keyLength: 4, keyFocused: true, time: 100 });
    const caret = calls.find(isCaret);
    // Four dots are 40 px wide and centered on x = 400, so the text ends at x = 420.
    assert.deepEqual(caret.args, [423, fieldCenterY - 10, 2, 20]);
  });

  it('draws the caret right after the placeholder when the field is empty', () => {
    const calls = renderKeyEntry({ keyFocused: true, time: 100 });
    const caret = calls.find(isCaret);
    const placeholderWidth = 'Type or paste your key'.length * 10;
    assert.equal(caret.args[0], 400 + placeholderWidth / 2 + 3);
  });

  it('hides the caret during the off phase of the blink and when the field is not focused', () => {
    assert.ok(!renderKeyEntry({ keyLength: 4, keyFocused: true, keyCaretSince: 0, time: 600 }).some(isCaret));
    assert.ok(!renderKeyEntry({ keyLength: 4, keyFocused: false, time: 100 }).some(isCaret));
  });

  it('centers the ink of the field text and button labels vertically', () => {
    const calls = renderKeyEntry({ keyLength: 3 });
    const baselineOf = (text) => calls.find((call) => call.name === 'fillText' && call.args[0] === text).args[2];
    // Ink spans 12 px above and 2 px below the baseline, so the baseline sits 5 px below the center.
    assert.equal(baselineOf('•••'), fieldCenterY + 5);
    assert.equal(baselineOf('Start (Enter)'), START_BUTTON.y + START_BUTTON.height / 2 + 5);
  });
});

describe('render court', () => {
  const match = {
    paddles: { human: 200, jev: 200 },
    ball: { x: 400, y: 200 },
    score: { human: 0, jev: 0 },
    round: 1,
    results: ['human'],
  };
  const stats = { last: null, average: 0, samples: [] };

  function renderCourt(screen, apiError = null, touchMode = false) {
    const ctx = recordingContext();
    const view = { screen, apiError, resumeIn: 0, match, stats, timer: 1, lastScorer: 'human' };
    render(ctx, { ...view, touchMode, portrait: false });
    return ctx.calls;
  }

  const isCenterLine = (call) => call.name === 'setLineDash' && call.args[0].length > 0;
  const isLatencyLabel = (call) => call.name === 'fillText' && call.args[0].startsWith('Jev ·');
  // The ball is the only BALL_SIZE square drawn in court coordinates, centered on match.ball.
  const isBall = (call) => call.name === 'fillRect' && call.args[0] === match.ball.x - BALL_SIZE / 2
    && call.args[1] === match.ball.y - BALL_SIZE / 2 && call.args[2] === BALL_SIZE;

  it('draws the dashed center line, the ball and the latency while the game runs', () => {
    const calls = renderCourt('playing');
    assert.ok(calls.some(isCenterLine));
    assert.ok(calls.some(isBall));
    assert.ok(calls.some(isLatencyLabel));
  });

  it('draws the latency label in the same gray as the sparkline', () => {
    const label = renderCourt('playing').find(isLatencyLabel);
    assert.equal(label.fillStyle, '#888');
  });

  it('hides the center line, the ball and the latency on every other court screen', () => {
    for (const screen of ['round-intro', 'point-scored', 'paused', 'match-over']) {
      const calls = renderCourt(screen);
      assert.ok(!calls.some(isCenterLine), `center line on ${screen}`);
      assert.ok(!calls.some(isBall), `ball on ${screen}`);
      assert.ok(!calls.some(isLatencyLabel), `latency on ${screen}`);
    }
  });

  it('hides the center line, the ball and the latency while a Jev error freezes the game', () => {
    const calls = renderCourt('playing', 'Jev is unreachable');
    assert.ok(!calls.some(isCenterLine));
    assert.ok(!calls.some(isBall));
    assert.ok(!calls.some(isLatencyLabel));
  });

  it('draws the score HUD during play but not on the match-over screen', () => {
    const isRoundHud = (call) => call.name === 'fillText' && call.args[0] === 'Round 1 · Best of 3';
    // The match-over screen draws the score line itself, lower down, so only the HUD position (y = 24) counts.
    const isScoreHud = (call) => call.name === 'fillText' && call.args[0] === 'You 0 — 0 Jev' && call.args[2] === 24;
    const playing = renderCourt('playing');
    assert.ok(playing.some(isScoreHud));
    assert.ok(playing.some(isRoundHud));
    const matchOver = renderCourt('match-over');
    assert.ok(!matchOver.some(isScoreHud));
    assert.ok(!matchOver.some(isRoundHud));
  });

  it('draws the touch pause button during play but not on the match-over screen', () => {
    const isPauseButton = (call) => call.name === 'roundRect' && call.args[0] === PAUSE_BUTTON.x
      && call.args[1] === PAUSE_BUTTON.y;
    assert.ok(renderCourt('playing', null, true).some(isPauseButton));
    assert.ok(!renderCourt('match-over', null, true).some(isPauseButton));
  });

  it('hides the latency indicator on the menu', () => {
    assert.ok(!renderCourt('menu').some(isLatencyLabel));
  });
});
