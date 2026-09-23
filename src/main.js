// Jong entry point: owns the screen state machine and the animation loop.

import { LatencyStats, createJevController } from './ai.js';
import { buildRequestBody, describeError, requestDecision } from './api.js';
import { createFx, updateFx } from './fx.js';
import { createMatch, isMatchOver, startRound, step } from './game.js';
import { createInput } from './input.js';
import {
  CHANGE_KEY_BUTTON,
  KEY_FIELD,
  QUIT_BUTTON,
  START_BUTTON,
  canvasToCourtY,
  hitTest,
  render,
} from './renderer.js';
import { setupCanvas } from './viewport.js';

const ROUND_INTRO_S = 3;
const POINT_SCORED_S = 1;
const RESUME_S = 1;
const MATCH_OVER_GUARD_S = 0.5;
const MAX_UPDATE_DT = 0.1;

const canvas = document.getElementById('game');
const keyField = document.getElementById('api-key');
const context = setupCanvas(canvas);
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const input = createInput({
  canvas,
  keyField,
  initialTouchMode: coarsePointer,
  isControlAt,
});
const stats = new LatencyStats();

const app = {
  screen: 'key-entry',
  match: createMatch(),
  fx: createFx(),
  message: null,
  apiError: null,
  resumeIn: 0,
  timer: 0,
  lastScorer: null,
};

// Created once the key is accepted; the key itself lives only inside this controller.
let jev = null;

async function submitKey() {
  const apiKey = input.keyValue;
  if (apiKey === '') {
    app.message = 'Please enter your API key';
    return;
  }
  app.screen = 'checking-key';
  app.message = null;
  input.blurKeyField();

  const startedAt = performance.now();
  try {
    await requestDecision({ apiKey, body: buildRequestBody(createMatch()) });
    stats.add(performance.now() - startedAt);
    jev = createJevController({
      apiKey,
      getBody: () => buildRequestBody(app.match),
      stats,
      onError: handleJevError,
      onRecover: () => {
        app.resumeIn = RESUME_S;
      },
    });
    input.clearKeyField();
    app.screen = 'menu';
  } catch (error) {
    app.screen = 'key-entry';
    app.message = describeError(error.kind);
    input.focusKeyField();
  }
}

function handleJevError(error) {
  if (error.kind === 'auth') {
    showKeyEntry(describeError('auth'));
    return;
  }
  app.apiError = describeError(error.kind);
  app.resumeIn = 0;
}

function showKeyEntry(message = null) {
  jev?.stop();
  jev = null;
  input.clearKeyField();
  app.apiError = null;
  app.message = message;
  app.screen = 'key-entry';
  input.focusKeyField();
}

function startMatch() {
  app.match = createMatch();
  app.apiError = null;
  beginRound();
}

function beginRound() {
  startRound(app.match);
  // The ball jumps back to the center, so the old trail would streak across the court.
  app.fx = createFx();
  jev.reset();
  app.timer = ROUND_INTRO_S;
  app.screen = 'round-intro';
}

function pause() {
  jev.stop();
  app.screen = 'paused';
}

function resume() {
  app.screen = 'playing';
  jev.start();
}

function quitToMenu() {
  jev.stop();
  app.apiError = null;
  app.resumeIn = 0;
  app.screen = 'menu';
}

// The controls that react to a tap on the current screen, matching the hit tests in handleAction.
function activeControls() {
  switch (app.screen) {
    case 'key-entry':
      return [KEY_FIELD, START_BUTTON];
    case 'menu':
      return [CHANGE_KEY_BUTTON];
    case 'playing':
      return app.apiError !== null ? [QUIT_BUTTON] : [];
    case 'paused':
    case 'match-over':
      return [QUIT_BUTTON];
    default:
      return [];
  }
}

function isControlAt(point) {
  return activeControls().some((rect) => hitTest(rect, point));
}

function handleAction(action) {
  const tap = action.type === 'tap' ? action : null;
  const tapped = (rect) => tap !== null && hitTest(rect, tap);

  switch (app.screen) {
    case 'key-entry':
      if (action.type === 'key-edited') {
        // Any edit answers the error message, so it would only be stale from here on.
        app.message = null;
      } else if (tapped(KEY_FIELD)) {
        input.focusKeyField();
      } else if (action.type === 'confirm' || tapped(START_BUTTON)) {
        submitKey();
      }
      break;
    case 'menu':
      if (action.type === 'change-key' || tapped(CHANGE_KEY_BUTTON)) {
        showKeyEntry();
      } else if (action.type === 'confirm' || tap !== null) {
        startMatch();
      }
      break;
    case 'playing':
      // While Jev is unreachable the game is frozen: quitting is the only way out.
      if (app.apiError !== null) {
        if (action.type === 'quit' || tapped(QUIT_BUTTON)) {
          quitToMenu();
        }
      } else if (action.type === 'pause') {
        pause();
      }
      break;
    case 'paused':
      if (action.type === 'quit' || tapped(QUIT_BUTTON)) {
        quitToMenu();
      } else if (action.type === 'pause' || action.type === 'confirm' || tap !== null) {
        resume();
      }
      break;
    case 'match-over':
      if (tap !== null && app.timer > 0) {
        // A finger still resting on the screen from the last point must not skip the match-over screen.
        break;
      }
      if (action.type === 'quit' || tapped(QUIT_BUTTON)) {
        quitToMenu();
      } else if (action.type === 'confirm' || tap !== null) {
        startMatch();
      }
      break;
  }
}

function update(dt) {
  switch (app.screen) {
    case 'round-intro':
      app.timer -= dt;
      if (app.timer <= 0) {
        app.screen = 'playing';
        jev.start();
      }
      break;
    case 'playing':
      updatePlaying(dt);
      break;
    case 'point-scored':
      app.timer -= dt;
      if (app.timer <= 0) {
        if (isMatchOver(app.match)) {
          app.screen = 'match-over';
          app.timer = MATCH_OVER_GUARD_S;
        } else {
          beginRound();
        }
      }
      break;
    case 'match-over':
      app.timer -= dt;
      break;
  }
}

function updatePlaying(dt) {
  if (app.apiError !== null) {
    if (app.resumeIn > 0) {
      app.resumeIn -= dt;
      if (app.resumeIn <= 0) {
        app.apiError = null;
      }
    }
    return;
  }
  const { pointerY } = input.state;
  const { scorer, hit } = step(app.match, dt, {
    humanDirection: input.state.direction,
    // The pointer is tracked in canvas coordinates, but the paddle is drawn inside the padded play field.
    humanTargetY: pointerY === null ? null : canvasToCourtY(pointerY),
    jevTargetY: jev.targetY,
  });
  if (scorer !== null) {
    jev.stop();
    app.lastScorer = scorer;
    app.timer = POINT_SCORED_S;
    app.screen = 'point-scored';
    return;
  }
  // Effects only advance here, so they freeze with the game while paused or while a Jev error holds play.
  updateFx(app.fx, dt, { ball: app.match.ball, hit });
}

// The mouse steers the paddle during a rally, so its cursor would only hide part of the court. It comes back on every
// other screen, and while a Jev error shows the Quit button.
function updateCursor() {
  const ballInPlay = app.screen === 'playing' && app.apiError === null;
  document.body.classList.toggle('hide-cursor', ballInPlay);
}

function buildView(time) {
  const { touchMode } = input.state;
  return {
    screen: app.screen,
    match: app.match,
    fx: app.fx,
    stats,
    keyLength: input.keyValue.length,
    keyFocused: input.state.keyFocused,
    keyCaretSince: input.state.keyCaretSince,
    time,
    message: app.message,
    apiError: app.apiError,
    resumeIn: app.resumeIn,
    timer: app.timer,
    lastScorer: app.lastScorer,
    touchMode,
    portrait: touchMode && window.innerHeight > window.innerWidth,
  };
}

let lastTime = performance.now();

function frame(time) {
  const dt = Math.min(Math.max(0, (time - lastTime) / 1000), MAX_UPDATE_DT);
  lastTime = time;
  update(dt);
  updateCursor();
  render(context, buildView(time));
  requestAnimationFrame(frame);
}

input.onAction(handleAction);
document.addEventListener('visibilitychange', () => {
  if (app.screen !== 'playing') {
    return;
  }
  if (document.hidden) {
    if (app.apiError === null) {
      pause();
    } else {
      jev.stop();
    }
  } else if (app.apiError !== null) {
    jev.start();
  }
});

if (!coarsePointer) {
  input.focusKeyField();
}
requestAnimationFrame(frame);
