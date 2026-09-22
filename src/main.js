// Starter entry point: draws a placeholder court until the real game is implemented.

import { LOGICAL_HEIGHT, LOGICAL_WIDTH, setupCanvas } from './viewport.js';

const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const PADDLE_MARGIN = 20;
const BALL_SIZE = 10;
const BALL_X = 460;
const BALL_Y = 260;
const FOREGROUND = '#fff';

const canvas = document.getElementById('game');
const context = setupCanvas(canvas);

function drawCourt() {
  context.fillStyle = '#000';
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  context.strokeStyle = FOREGROUND;
  context.lineWidth = 2;
  context.setLineDash([10, 10]);
  context.beginPath();
  context.moveTo(LOGICAL_WIDTH / 2, 0);
  context.lineTo(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT);
  context.stroke();
  context.setLineDash([]);

  const paddleY = (LOGICAL_HEIGHT - PADDLE_HEIGHT) / 2;
  context.fillStyle = FOREGROUND;
  context.fillRect(PADDLE_MARGIN, paddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
  context.fillRect(LOGICAL_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH, paddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
  context.fillRect(BALL_X, BALL_Y, BALL_SIZE, BALL_SIZE);
}

function drawTitle() {
  context.fillStyle = FOREGROUND;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.font = 'bold 72px monospace';
  context.fillText('JONG', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 40);

  context.font = '20px monospace';
  context.fillText('Coming soon — play against Jev', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 20);
}

function frame() {
  drawCourt();
  drawTitle();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
