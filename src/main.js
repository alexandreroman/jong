// Jong entry point: owns the screen state machine and the animation loop.

import { LatencyStats, createJevController } from './ai.js';
import { buildRequestBody, describeError, requestZone } from './api.js';
import { createMatch, isMatchOver, startRound, step } from './game.js';
import { createInput } from './input.js';
import {
  CHANGE_KEY_BUTTON,
  KEY_FIELD,
  PAUSE_BUTTON,
  QUIT_BUTTON,
  START_BUTTON,
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
const input = createInput({ canvas, keyField, initialInputType: coarsePointer ? 'touch' : 'keyboard' });
const stats = new LatencyStats();

const app = {
  screen: 'key-entry',
  match: createMatch(),
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
    await requestZone({ apiKey, body: buildRequestBody(createMatch()) });
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

function handleAction(action) {
  const tap = action.type === 'tap' ? action : null;
  const tapped = (rect) => tap !== null && hitTest(rect, tap);

  switch (app.screen) {
    case 'key-entry':
      if (tapped(KEY_FIELD)) {
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
      } else if (action.type === 'pause' || tapped(PAUSE_BUTTON)) {
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
        // A stray tap while the winner is still steering must not skip the results.
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
  const scorer = step(app.match, dt, {
    humanDirection: input.state.direction,
    humanTargetY: input.state.touchY,
    jevTargetY: jev.targetY,
  });
  if (scorer !== null) {
    jev.stop();
    app.lastScorer = scorer;
    app.timer = POINT_SCORED_S;
    app.screen = 'point-scored';
  }
}

function buildView() {
  const touchMode = input.state.lastInputType === 'touch';
  return {
    screen: app.screen,
    match: app.match,
    stats,
    keyLength: input.keyValue.length,
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
  render(context, buildView());
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
