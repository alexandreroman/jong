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

export const KEY_FIELD = { x: 200, y: 170, width: 400, height: 44 };
export const START_BUTTON = { x: 330, y: 240, width: 140, height: 40 };
export const CHANGE_KEY_BUTTON = { x: 290, y: 290, width: 220, height: 36 };
export const PAUSE_BUTTON = { x: 750, y: 10, width: 40, height: 30 };
export const QUIT_BUTTON = { x: 330, y: 270, width: 140, height: 40 };

export function hitTest(rect, point) {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** Draws one frame for the given view. */
export function render(ctx, view) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, COURT.width, COURT.height);

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
    drawText(ctx, 'Rotate your device for a better experience', 10, 388, { size: 12, color: DIM, align: 'left' });
  }
}

function drawText(ctx, text, x, y, { size = 16, color = FOREGROUND, align = 'center', bold = false } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawTitle(ctx, y, size) {
  drawText(ctx, 'JONG', CENTER_X, y, { size, bold: true });
}

function drawButton(ctx, rect, label) {
  ctx.strokeStyle = FOREGROUND;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  drawText(ctx, label, rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function dimScreen(ctx) {
  ctx.fillStyle = OVERLAY;
  ctx.fillRect(0, 0, COURT.width, COURT.height);
}

function drawKeyEntry(ctx, { keyLength, message, touchMode }) {
  drawTitle(ctx, 80, 56);
  drawText(ctx, 'Enter your TypeSafe API key', CENTER_X, 140, { size: 18 });

  ctx.strokeStyle = FOREGROUND;
  ctx.lineWidth = 2;
  ctx.strokeRect(KEY_FIELD.x, KEY_FIELD.y, KEY_FIELD.width, KEY_FIELD.height);
  const placeholder = touchMode ? 'Tap here to type' : 'Type or paste your key';
  const fieldText = keyLength > 0 ? '•'.repeat(Math.min(keyLength, 32)) : placeholder;
  drawText(ctx, fieldText, CENTER_X, KEY_FIELD.y + KEY_FIELD.height / 2, { color: keyLength > 0 ? FOREGROUND : DIM });

  drawButton(ctx, START_BUTTON, touchMode ? 'Start' : 'Start (Enter)');
  if (message) {
    drawText(ctx, message, CENTER_X, 310, { color: ERROR });
  }
  drawText(ctx, 'Your key stays in memory and is never stored.', CENTER_X, 350, { size: 12, color: DIM });
}

function drawMenu(ctx, { touchMode, stats }) {
  drawTitle(ctx, 130, 72);
  drawText(ctx, touchMode ? 'Tap to start' : 'Press Space to start', CENTER_X, 220, { size: 20 });
  drawButton(ctx, CHANGE_KEY_BUTTON, touchMode ? 'Change API key' : 'Change API key (K)');
  drawLatency(ctx, stats);
}

function drawCourt(ctx, { match, stats, touchMode }) {
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  // Starts below the score so the line never crosses the HUD text.
  ctx.moveTo(CENTER_X, HUD_BOTTOM);
  ctx.lineTo(CENTER_X, COURT.height);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = FOREGROUND;
  ctx.fillRect(LEFT_PADDLE_X, match.paddles.human - PADDLE.height / 2, PADDLE.width, PADDLE.height);
  ctx.fillRect(RIGHT_PADDLE_X, match.paddles.jev - PADDLE.height / 2, PADDLE.width, PADDLE.height);
  ctx.fillRect(match.ball.x - BALL_SIZE / 2, match.ball.y - BALL_SIZE / 2, BALL_SIZE, BALL_SIZE);

  drawText(ctx, `You ${match.score.human} — ${match.score.jev} Jev`, CENTER_X, 24, { size: 20 });
  drawText(ctx, `Round ${Math.max(match.round, 1)}/${ROUNDS}`, CENTER_X, 46, { size: 14, color: DIM });
  if (touchMode) {
    drawButton(ctx, PAUSE_BUTTON, 'II');
  }
  drawLatency(ctx, stats);
}

function drawLatency(ctx, stats) {
  const right = COURT.width - 10;
  const y = 388;
  const last = stats.last;
  const label = last === null
    ? 'Jev · — ms'
    : `Jev · ${Math.round(last)} ms · avg ${Math.round(stats.average)} ms`;
  drawText(ctx, label, right, y, { size: 12, align: 'right' });

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
    .join('  ·  ');
  drawText(ctx, title, CENTER_X, 120, { size: 48, bold: true });
  drawText(ctx, `You ${match.score.human} — ${match.score.jev} Jev`, CENTER_X, 170, { size: 22 });
  drawText(ctx, rounds, CENTER_X, 205, { size: 14, color: DIM });
  drawText(ctx, touchMode ? 'Tap to play again' : 'Press Space to play again', CENTER_X, 240);
  drawButton(ctx, QUIT_BUTTON, touchMode ? 'Menu' : 'Menu (Q)');
}
