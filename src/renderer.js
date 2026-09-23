// All Canvas drawing for Jong. Reads the view built by main.js and never mutates game or AI state.

import { LATENCY_WINDOW, latencyLevel } from './ai.js';
import { BALL_SIZE, COURT, LEFT_PADDLE_X, PADDLE, RIGHT_PADDLE_X, ROUNDS, matchWinner } from './game.js';

const FOREGROUND = '#fff';
const BACKGROUND = '#000';
const DIM = '#888';
const ERROR = '#f55';
const OVERLAY = 'rgba(0, 0, 0, 0.75)';
const FONT = 'monospace';
const LEVEL_COLORS = { good: '#3c3', fair: '#f90', poor: '#e33' };
const CENTER_X = COURT.width / 2;
const HUD_BOTTOM = 60;
// Horizontal space between the center line and each HUD column, wide enough to fit the score dash between them.
const HUD_GAP = 20;
const HUD_TOP_Y = 24;
const HUD_BOTTOM_Y = 46;
const HUD_TOP_STYLE = { size: 20, color: FOREGROUND };
const HUD_BOTTOM_STYLE = { size: 14, color: DIM };
const BORDER_WIDTH = 2;
const BORDER_RADIUS = 12;
// Shared by every button and the key field so all controls have the same shape.
const CONTROL_RADIUS = 8;
// Matches the usual system text caret blink: about 530 ms on, 530 ms off.
const CARET_BLINK_MS = 530;
const CARET_WIDTH = 2;
const CARET_HEIGHT = 20;
const CARET_GAP = 3;
// Gap above and below the play field so paddles and ball, at their extreme positions, stay clear of the border.
const COURT_PADDING = 10;
// The court is scaled uniformly (not squashed) to fit between the paddings, then centered horizontally.
const FIELD_SCALE = (COURT.height - 2 * COURT_PADDING) / COURT.height;
const FIELD = {
  x: (COURT.width * (1 - FIELD_SCALE)) / 2,
  y: COURT_PADDING,
  width: COURT.width * FIELD_SCALE,
  height: COURT.height * FIELD_SCALE,
};

export const KEY_FIELD = { x: 200, y: 170, width: 400, height: 44 };
export const START_BUTTON = { x: 330, y: 240, width: 140, height: 40 };
export const CHANGE_KEY_BUTTON = { x: 290, y: 290, width: 220, height: 36 };
export const PAUSE_BUTTON = { x: 750, y: 10, width: 40, height: 30 };
export const QUIT_BUTTON = { x: 330, y: 270, width: 140, height: 40 };

export function hitTest(rect, point) {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** Tells whether the blinking caret is visible at `time`, given the time its blink cycle started (both in ms). */
export function caretVisible(time, since) {
  const phase = Math.floor(Math.max(0, time - since) / CARET_BLINK_MS);
  return phase % 2 === 0;
}

/** Converts a canvas y coordinate to a court y coordinate by undoing the play field transform. */
export function canvasToCourtY(y) {
  return (y - FIELD.y) / FIELD_SCALE;
}

/** Draws one frame for the given view. */
export function render(ctx, view) {
  // Clear rather than fill so the corners outside the rounded border stay transparent and show the page.
  ctx.clearRect(0, 0, COURT.width, COURT.height);
  ctx.save();
  // Clipping to the border's outer edge keeps full-canvas fills (background, dim overlays) inside the rounded court.
  ctx.beginPath();
  ctx.roundRect(0, 0, COURT.width, COURT.height, BORDER_RADIUS + BORDER_WIDTH / 2);
  ctx.clip();
  try {
    drawFrame(ctx, view);
  } finally {
    ctx.restore();
  }
}

function drawFrame(ctx, view) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, COURT.width, COURT.height);
  // Drawn before any content so dim overlays darken it the same way they darken the rest of the court.
  drawCourtBorder(ctx);

  switch (view.screen) {
    case 'key-entry':
      drawKeyEntry(ctx, view);
      break;
    case 'checking-key':
      drawTitle(ctx, 130, 72);
      drawText(ctx, 'Checking key…', CENTER_X, 230, { size: 20 });
      break;
    case 'menu':
      drawMenu(ctx, view);
      break;
    case 'match-over':
      drawCourt(ctx, view);
      drawMatchOver(ctx, view);
      break;
    default:
      drawCourt(ctx, view);
      drawPlayOverlay(ctx, view);
  }

  if (view.portrait) {
    ctx.fillStyle = OVERLAY;
    // Inset so the band stays inside the border instead of hiding its sides.
    ctx.fillRect(BORDER_WIDTH, 62, COURT.width - 2 * BORDER_WIDTH, 36);
    drawText(ctx, 'Rotate your device for a better experience', CENTER_X, 80, { size: 24, color: FOREGROUND });
  }
}

function drawText(ctx, text, x, y, { size = 16, color = FOREGROUND, align = 'center', bold = false } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// Centers the glyphs' actual ink on centerY: the 'middle' baseline sits visibly off-center with monospace fonts.
function drawCenteredText(ctx, text, x, centerY, { color = FOREGROUND } = {}) {
  ctx.fillStyle = color;
  ctx.font = `16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(text);
  const baselineY = centerY + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  ctx.fillText(text, x, baselineY);
}

function drawTitle(ctx, y, size) {
  drawText(ctx, 'JONG', CENTER_X, y, { size, bold: true });
}

function strokeControl(ctx, rect, color = FOREGROUND) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, CONTROL_RADIUS);
  ctx.stroke();
}

function drawButton(ctx, rect, label) {
  strokeControl(ctx, rect);
  drawCenteredText(ctx, label, rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function dimScreen(ctx) {
  ctx.fillStyle = OVERLAY;
  ctx.fillRect(0, 0, COURT.width, COURT.height);
}

function drawKeyEntry(ctx, view) {
  const { message, touchMode } = view;
  drawTitle(ctx, 80, 56);
  drawText(ctx, 'Enter your TypeSafe API key:', CENTER_X, 140, { size: 18 });
  drawKeyField(ctx, view);
  drawButton(ctx, START_BUTTON, touchMode ? 'Start' : 'Start (Enter)');
  if (message) {
    drawText(ctx, message, CENTER_X, 310, { color: ERROR });
  }
  drawText(ctx, 'Your key stays in memory and is never stored.', CENTER_X, 350, { size: 12, color: DIM });
}

function drawKeyField(ctx, { keyLength, keyFocused, keyCaretSince, time, touchMode }) {
  strokeControl(ctx, KEY_FIELD, keyFocused ? FOREGROUND : DIM);
  const placeholder = touchMode ? 'Tap here to type' : 'Type or paste your key';
  const hasKey = keyLength > 0;
  const fieldText = hasKey ? '•'.repeat(Math.min(keyLength, 32)) : placeholder;
  const centerY = KEY_FIELD.y + KEY_FIELD.height / 2;
  drawCenteredText(ctx, fieldText, CENTER_X, centerY, { color: hasKey ? FOREGROUND : DIM });

  if (!keyFocused || !caretVisible(time, keyCaretSince)) {
    return;
  }
  // The text is centered, so its right edge is half its measured width past the center.
  const caretX = CENTER_X + ctx.measureText(fieldText).width / 2 + CARET_GAP;
  ctx.fillStyle = FOREGROUND;
  ctx.fillRect(caretX, centerY - CARET_HEIGHT / 2, CARET_WIDTH, CARET_HEIGHT);
}

function drawMenu(ctx, { touchMode }) {
  drawTitle(ctx, 130, 72);
  drawText(ctx, touchMode ? 'Tap to start' : 'Press Space to start', CENTER_X, 220, { size: 20 });
  drawButton(ctx, CHANGE_KEY_BUTTON, touchMode ? 'Change API key' : 'Change API key (K)');
}

function drawCourt(ctx, { screen, apiError, match, stats, touchMode }) {
  // The center line, the ball and the latency indicator only show while the game runs (not frozen by a Jev error),
  // so banners and overlays sit on a quieter court.
  const active = screen === 'playing' && !apiError;
  if (active) {
    drawCenterLine(ctx);
    // Drawn before the field so the Jev paddle passes over the indicator instead of disappearing beneath it.
    drawLatency(ctx, stats);
  }
  drawField(ctx, match, { showBall: active });

  // The match-over screen already shows the final score and every round's result, and a finished match can't be paused.
  const showHud = screen !== 'match-over';
  if (showHud) {
    drawHud(ctx, match);
  }
  if (showHud && touchMode) {
    drawButton(ctx, PAUSE_BUTTON, 'II');
  }
}

// Two columns mirrored around the center line: the human's side on the left, Jev's on the right. Both columns hug the
// center, so the top line reads 'You 1 — 0 Jev' with the dash on the center line.
function drawHud(ctx, match) {
  const leftX = CENTER_X - HUD_GAP;
  const rightX = CENTER_X + HUD_GAP;
  drawText(ctx, `You ${match.score.human}`, leftX, HUD_TOP_Y, { ...HUD_TOP_STYLE, align: 'right' });
  drawText(ctx, '—', CENTER_X, HUD_TOP_Y, HUD_TOP_STYLE);
  drawText(ctx, `${match.score.jev} Jev`, rightX, HUD_TOP_Y, { ...HUD_TOP_STYLE, align: 'left' });
  drawText(ctx, `Round ${match.round}`, leftX, HUD_BOTTOM_Y, { ...HUD_BOTTOM_STYLE, align: 'right' });
  drawText(ctx, `Best of ${ROUNDS}`, rightX, HUD_BOTTOM_Y, { ...HUD_BOTTOM_STYLE, align: 'left' });
}

function drawCenterLine(ctx) {
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  // Starts below the HUD so the line never runs between its two text columns, and stops at the bottom of the field.
  ctx.moveTo(CENTER_X, HUD_BOTTOM);
  ctx.lineTo(CENTER_X, FIELD.y + FIELD.height);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Paddles and ball live in court coordinates; the transform maps them into the padded play field.
function drawField(ctx, match, { showBall }) {
  ctx.save();
  // Clipping makes a scoring ball vanish at the field's side edge instead of drifting into the padding.
  ctx.beginPath();
  ctx.rect(FIELD.x, FIELD.y, FIELD.width, FIELD.height);
  ctx.clip();
  ctx.translate(FIELD.x, FIELD.y);
  ctx.scale(FIELD_SCALE, FIELD_SCALE);
  ctx.fillStyle = FOREGROUND;
  ctx.fillRect(LEFT_PADDLE_X, match.paddles.human - PADDLE.height / 2, PADDLE.width, PADDLE.height);
  ctx.fillRect(RIGHT_PADDLE_X, match.paddles.jev - PADDLE.height / 2, PADDLE.width, PADDLE.height);
  if (showBall) {
    ctx.fillRect(match.ball.x - BALL_SIZE / 2, match.ball.y - BALL_SIZE / 2, BALL_SIZE, BALL_SIZE);
  }
  ctx.restore();
}

// Inset by half the line width so the whole stroke stays inside the canvas.
function drawCourtBorder(ctx) {
  const inset = BORDER_WIDTH / 2;
  ctx.strokeStyle = DIM;
  ctx.lineWidth = BORDER_WIDTH;
  ctx.beginPath();
  ctx.roundRect(inset, inset, COURT.width - BORDER_WIDTH, COURT.height - BORDER_WIDTH, BORDER_RADIUS);
  ctx.stroke();
}

function drawLatency(ctx, stats) {
  const right = COURT.width - 10;
  const y = 388;
  const last = stats.last;
  const label = last === null
    ? 'Jev · — ms'
    : `Jev · ${Math.round(last)} ms · avg ${Math.round(stats.average)} ms`;
  drawText(ctx, label, right, y, { size: 12, align: 'right', color: DIM });

  const labelWidth = ctx.measureText(label).width;
  ctx.fillStyle = last === null ? DIM : LEVEL_COLORS[latencyLevel(last)];
  ctx.beginPath();
  ctx.arc(right - labelWidth - 10, y, 4, 0, Math.PI * 2);
  ctx.fill();

  drawSparkline(ctx, stats.samples, { x: right - 180, y: 350, width: 180, height: 22 });
}

// Newest sample on the right; the vertical scale covers at least 300 ms so small jitter stays flat.
function drawSparkline(ctx, samples, box) {
  if (samples.length < 2) {
    return;
  }
  const max = Math.max(300, ...samples);
  const spacing = box.width / (LATENCY_WINDOW - 1);
  const offset = LATENCY_WINDOW - samples.length;
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  samples.forEach((ms, i) => {
    const x = box.x + (offset + i) * spacing;
    const y = box.y + box.height - (ms / max) * box.height;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

function drawBanner(ctx, title, subtitle) {
  ctx.fillStyle = OVERLAY;
  ctx.fillRect(200, 140, 400, 110);
  drawText(ctx, title, CENTER_X, 180, { size: 40, bold: true });
  if (subtitle) {
    drawText(ctx, subtitle, CENTER_X, 225);
  }
}

function drawPlayOverlay(ctx, view) {
  const { screen, match, touchMode } = view;
  if (screen === 'round-intro') {
    drawBanner(ctx, `Round ${match.round}`, `Starting in ${Math.max(1, Math.ceil(view.timer))}`);
  } else if (screen === 'point-scored') {
    drawBanner(ctx, view.lastScorer === 'human' ? 'You score!' : 'Jev scores!');
  } else if (screen === 'paused') {
    dimScreen(ctx);
    drawText(ctx, 'Paused', CENTER_X, 170, { size: 40, bold: true });
    drawText(ctx, touchMode ? 'Tap to resume' : 'Press Esc to resume', CENTER_X, 220);
    drawButton(ctx, QUIT_BUTTON, touchMode ? 'Quit' : 'Quit (Q)');
  } else if (screen === 'playing' && view.apiError) {
    dimScreen(ctx);
    if (view.resumeIn > 0) {
      drawText(ctx, 'Resuming…', CENTER_X, 190, { size: 24 });
    } else {
      drawText(ctx, `${view.apiError} — retrying…`, CENTER_X, 190, { size: 20, color: ERROR });
    }
    drawButton(ctx, QUIT_BUTTON, touchMode ? 'Quit' : 'Quit (Q)');
  }
}

function drawMatchOver(ctx, { match, touchMode }) {
  dimScreen(ctx);
  const title = matchWinner(match) === 'human' ? 'You win' : 'Jev wins';
  const rounds = match.results
    .map((winner, i) => `Round ${i + 1}: ${winner === 'human' ? 'You' : 'Jev'}`)
    .join('    ');
  drawText(ctx, title, CENTER_X, 120, { size: 48, bold: true });
  drawText(ctx, `You ${match.score.human} — ${match.score.jev} Jev`, CENTER_X, 170, { size: 22 });
  drawText(ctx, rounds, CENTER_X, 205, { size: 14, color: DIM });
  drawText(ctx, touchMode ? 'Tap to play again' : 'Press Space to play again', CENTER_X, 240);
  drawButton(ctx, QUIT_BUTTON, touchMode ? 'Menu' : 'Menu (Q)');
}
