// Keyboard, pointer and hidden key-field input. Emits high-level actions and exposes the paddle controls.

import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './viewport.js';

const UP_KEYS = new Set(['arrowup', 'w']);
const DOWN_KEYS = new Set(['arrowdown', 's']);
const ACTION_KEYS = {
  ' ': 'confirm',
  enter: 'confirm',
  escape: 'pause',
  p: 'pause',
  q: 'quit',
  k: 'change-key',
};

/** Converts a client (CSS pixel) position to court coordinates. */
export function toLogicalPoint(clientX, clientY, rect) {
  return {
    x: ((clientX - rect.left) * LOGICAL_WIDTH) / rect.width,
    y: ((clientY - rect.top) * LOGICAL_HEIGHT) / rect.height,
  };
}

export function createInput({ canvas, keyField, target = window, initialInputType = 'keyboard' }) {
  const pressed = new Set();
  const listeners = [];
  const state = { direction: 0, touchY: null, lastInputType: initialInputType };
  let paddlePointerId = null;

  const emit = (action) => listeners.forEach((listener) => listener(action));
  const hasAny = (keys) => [...keys].some((key) => pressed.has(key));
  const updateDirection = () => {
    state.direction = (hasAny(DOWN_KEYS) ? 1 : 0) - (hasAny(UP_KEYS) ? 1 : 0);
  };
  const pointFrom = (event) => toLogicalPoint(event.clientX, event.clientY, canvas.getBoundingClientRect());

  target.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    // While the player types the API key, only Enter means something to the game.
    if (event.target === keyField) {
      if (key === 'enter') {
        event.preventDefault();
        emit({ type: 'confirm' });
      }
      return;
    }
    state.lastInputType = 'keyboard';
    if (UP_KEYS.has(key) || DOWN_KEYS.has(key)) {
      event.preventDefault();
      pressed.add(key);
      updateDirection();
      return;
    }
    const type = ACTION_KEYS[key];
    if (type !== undefined && !event.repeat) {
      event.preventDefault();
      emit({ type });
    }
  });

  target.addEventListener('keyup', (event) => {
    pressed.delete(event.key.toLowerCase());
    updateDirection();
  });

  target.addEventListener('blur', () => {
    pressed.clear();
    updateDirection();
  });

  canvas.addEventListener('pointerdown', (event) => {
    // Keeps the canvas from stealing focus back from the key field right after a tap focused it.
    event.preventDefault();
    const point = pointFrom(event);
    state.lastInputType = event.pointerType === 'touch' ? 'touch' : 'keyboard';
    if (event.pointerType === 'touch' && point.x < LOGICAL_WIDTH / 2) {
      paddlePointerId = event.pointerId;
      state.touchY = point.y;
      canvas.setPointerCapture(event.pointerId);
    }
    emit({ type: 'tap', x: point.x, y: point.y });
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId === paddlePointerId) {
      state.touchY = pointFrom(event).y;
    }
  });

  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerId === paddlePointerId) {
        paddlePointerId = null;
        state.touchY = null;
      }
    });
  }

  return {
    state,
    onAction(listener) {
      listeners.push(listener);
    },
    get keyValue() {
      return keyField.value.trim();
    },
    focusKeyField() {
      keyField.focus();
    },
    blurKeyField() {
      keyField.blur();
    },
    clearKeyField() {
      keyField.value = '';
    },
  };
}
