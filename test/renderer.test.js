import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFx, updateFx } from '../src/fx.js';
import { BALL_SIZE, COURT, LEFT_PADDLE_X, RIGHT_PADDLE_X } from '../src/game.js';
import {
  KEY_FIELD, QUIT_BUTTON, START_BUTTON, canvasToCourtY, caretVisible, hitTest, render,
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
// above and 2 px below the baseline. Linear gradients are plain objects that keep their geometry and color stops.
function recordingContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['clearRect', 'fillRect', 'beginPath', 'roundRect', 'rect', 'clip', 'stroke', 'fill',
    'fillText', 'save', 'restore', 'moveTo', 'lineTo', 'arc', 'setLineDash', 'translate', 'scale']) {
    ctx[name] = (...args) => calls.push({
      name, args, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, textAlign: ctx.textAlign,
      globalAlpha: ctx.globalAlpha,
    });
  }
  ctx.createLinearGradient = (...args) => {
    const gradient = { type: 'linear', args, stops: [] };
    gradient.addColorStop = (offset, color) => gradient.stops.push({ offset, color });
    return gradient;
  };
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

// Relative luminance of a '#rgb' or '#rrggbb' color, enough to compare how bright two background stops are.
function luminance(color) {
  const digits = color.slice(1);
  const fullDigits = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const [r, g, b] = [0, 2, 4].map((start) => parseInt(fullDigits.slice(start, start + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('render background', () => {
  const isFullCourtFill = (call) => call.name === 'fillRect' && call.args[0] === 0 && call.args[1] === 0
    && call.args[2] === COURT.width && call.args[3] === COURT.height;

  it('fills the court with a horizontal gradient that is brighter in the middle than at the edges', () => {
    const background = renderKeyEntry().find(isFullCourtFill);
    const gradient = background.fillStyle;
    assert.equal(gradient.type, 'linear');
    assert.deepEqual(gradient.args, [0, 0, COURT.width, 0]);
    assert.deepEqual(gradient.stops.map((stop) => stop.offset), [0, 0.5, 1]);
    const [left, center, right] = gradient.stops.map((stop) => luminance(stop.color));
    assert.equal(left, right);
    assert.ok(center > left);
  });
});

describe('render key entry', () => {
  const fieldCenterY = KEY_FIELD.y + KEY_FIELD.height / 2;

  it('draws the key field and buttons with rounded corners', () => {
    const calls = renderKeyEntry();
    assert.ok(calls.some(isKeyFieldOutline));
    assert.ok(calls.some((call) => call.name === 'roundRect' && call.args[0] === START_BUTTON.x
      && call.args[4] === 8));
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
    const placeholderWidth = 'Paste your key'.length * 10;
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
  };
  const stats = { last: null, average: 0, samples: [] };

  function renderCourt(screen, apiError = null, touchMode = false, fx = createFx()) {
    const ctx = recordingContext();
    const view = { screen, apiError, resumeIn: 0, match, fx, stats, timer: 1, lastScorer: 'human' };
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

  const hudText = (calls, text) => calls.find((call) => call.name === 'fillText' && call.args[0] === text);
  const HUD_TEXTS = ['You 0', '—', '0 Jev', 'Round 1', 'Best of 3'];

  it('draws the score HUD during play but not on the match-over screen', () => {
    const playing = renderCourt('playing');
    for (const text of HUD_TEXTS) {
      assert.ok(hudText(playing, text), `${text} during play`);
    }
    const matchOver = renderCourt('match-over');
    for (const text of HUD_TEXTS) {
      assert.ok(!hudText(matchOver, text), `${text} on match-over`);
    }
  });

  it('keeps the match-over texts above the Menu button', () => {
    for (const touchMode of [false, true]) {
      const calls = renderCourt('match-over', null, touchMode);
      const prompt = calls.find((call) => call.name === 'fillText' && call.args[0].endsWith('to play again'));
      // Drawn with a 'middle' baseline at 16 px, so the text extends about 8 px below its y.
      assert.ok(prompt.args[2] + 8 < QUIT_BUTTON.y, `prompt above the Menu button (touch: ${touchMode})`);
    }
  });

  it('lays the HUD out in two columns mirrored around the center line', () => {
    const calls = renderCourt('playing');
    const [you, dash, jev, round, bestOf] = HUD_TEXTS.map((text) => hudText(calls, text));
    assert.deepEqual([you.args[1], you.args[2], you.textAlign], [400 - 20, 24, 'right']);
    assert.deepEqual([dash.args[1], dash.args[2], dash.textAlign], [400, 24, 'center']);
    assert.deepEqual([jev.args[1], jev.args[2], jev.textAlign], [400 + 20, 24, 'left']);
    assert.deepEqual([round.args[1], round.args[2], round.textAlign], [400 - 20, 46, 'right']);
    assert.deepEqual([bestOf.args[1], bestOf.args[2], bestOf.textAlign], [400 + 20, 46, 'left']);
  });

  // A trail square is centered on an old ball position and smaller than the ball.
  const isTrailSquare = (call) => call.name === 'fillRect' && call.args[2] < BALL_SIZE && call.args[2] === call.args[3];

  function fxWithTrail() {
    const fx = createFx();
    updateFx(fx, 1 / 60, { ball: { x: 360, y: 180 }, hit: null });
    updateFx(fx, 1 / 60, { ball: { x: 380, y: 190 }, hit: null });
    return fx;
  }

  it('draws the trail behind the ball, older squares smaller and fainter', () => {
    const calls = renderCourt('playing', null, false, fxWithTrail());
    const trail = calls.filter(isTrailSquare);
    assert.equal(trail.length, 2);
    const [older, newer] = trail;
    assert.ok(older.args[2] < newer.args[2]);
    assert.ok(older.globalAlpha < newer.globalAlpha);
    assert.ok(newer.globalAlpha < 1);
    const ball = calls.find(isBall);
    assert.equal(ball.globalAlpha, 1);
    assert.ok(calls.indexOf(newer) < calls.indexOf(ball));
  });

  it('hides the trail whenever the ball is hidden', () => {
    for (const screen of ['round-intro', 'point-scored', 'paused', 'match-over']) {
      assert.ok(!renderCourt(screen, null, false, fxWithTrail()).some(isTrailSquare), `trail on ${screen}`);
    }
  });

  it('pulls a paddle away from the court center while it recoils', () => {
    const paddleXs = (fx) => renderCourt('playing', null, false, fx)
      .filter((call) => call.name === 'fillRect' && call.args[3] === 80)
      .map((call) => call.args[0]);
    assert.deepEqual(paddleXs(createFx()), [LEFT_PADDLE_X, RIGHT_PADDLE_X]);

    const humanHit = createFx();
    updateFx(humanHit, 0, { ball: match.ball, hit: 'human' });
    assert.deepEqual(paddleXs(humanHit), [LEFT_PADDLE_X - 5, RIGHT_PADDLE_X]);

    const jevHit = createFx();
    updateFx(jevHit, 0, { ball: match.ball, hit: 'jev' });
    assert.deepEqual(paddleXs(jevHit), [LEFT_PADDLE_X, RIGHT_PADDLE_X + 5]);
  });

  // Fake ink spans 12 px above and 2 px below the baseline. The banner draws after the HUD, which also shows
  // 'Round 1', so the last matching call is the banner's.
  const inkOf = (calls, text) => {
    const baseline = calls.findLast((call) => call.name === 'fillText' && call.args[0] === text).args[2];
    return { top: baseline - 12, bottom: baseline + 2 };
  };

  it('centers the point-scored title ink on the court', () => {
    const { top, bottom } = inkOf(renderCourt('point-scored'), 'You score!');
    assert.equal((top + bottom) / 2, COURT.height / 2);
  });

  it('centers the round-intro title and subtitle as one block on the court', () => {
    const calls = renderCourt('round-intro');
    const title = inkOf(calls, 'Round 1');
    const subtitle = inkOf(calls, 'Starting in 1');
    assert.ok(title.bottom < subtitle.top);
    assert.equal((title.top + subtitle.bottom) / 2, COURT.height / 2);
  });

  it('draws the portrait hint near the bottom of the court, above the latency label', () => {
    for (const screen of ['key-entry', 'menu', 'playing']) {
      const ctx = recordingContext();
      render(ctx, {
        screen, keyLength: 0, keyFocused: false, keyCaretSince: 0, time: 0, message: null,
        apiError: null, resumeIn: 0, match, fx: createFx(), stats, touchMode: true, portrait: true,
      });
      const hint = ctx.calls.find((call) => call.name === 'fillText' && call.args[0].startsWith('Rotate your device'));
      const hintY = hint.args[2];
      assert.ok(hintY > COURT.height * 0.75, `hint near the bottom on ${screen}`);
      assert.ok(hintY < COURT.height, `hint inside the court on ${screen}`);
      const latencyLabel = ctx.calls.find((call) => call.name === 'fillText' && call.args[0].startsWith('Jev ·'));
      if (latencyLabel) {
        assert.ok(hintY < latencyLabel.args[2], 'hint above the latency label');
      }
    }
  });
});
