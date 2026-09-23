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

/**
 * Wires keyboard, pointer and key-field listeners. `isControlAt(point)` tells whether a court point lies on a button
 * or field currently on screen; a touch starting there presses the control without grabbing the paddle.
 *
 * The paddle follows `state.pointerY` (a court y) when it is set, and `state.direction` otherwise. The most recent
 * input wins: a dragging finger or a moving mouse sets the pointer target, and any game key hands control back to the
 * keyboard by clearing it until the pointer moves again.
 */
export function createInput({
  canvas,
  keyField,
  target = window,
  initialInputType = 'keyboard',
  isControlAt = () => false,
}) {
  const pressed = new Set();
  const listeners = [];
  // keyCaretSince is the time of the last focus or edit of the key field; the caret blink restarts from it.
  const state = {
    direction: 0,
    pointerY: null,
    lastInputType: initialInputType,
    keyFocused: false,
    keyCaretSince: 0,
  };
  let paddlePointerId = null;

  const emit = (action) => listeners.forEach((listener) => listener(action));
  const hasAny = (keys) => [...keys].some((key) => pressed.has(key));
  const updateDirection = () => {
    state.direction = (hasAny(DOWN_KEYS) ? 1 : 0) - (hasAny(UP_KEYS) ? 1 : 0);
  };
  const pointFrom = (event) => toLogicalPoint(event.clientX, event.clientY, canvas.getBoundingClientRect());

  target.addEventListener('keydown', (event) => {
    const key = (event.key ?? '').toLowerCase();
    // While the player types the API key, only Enter means something to the game.
    if (event.target === keyField) {
      if (key === 'enter') {
        event.preventDefault();
        emit({ type: 'confirm' });
      }
      return;
    }
    state.lastInputType = 'keyboard';
    state.pointerY = null;
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
    pressed.delete((event.key ?? '').toLowerCase());
    updateDirection();
  });

  target.addEventListener('blur', () => {
    pressed.clear();
    updateDirection();
  });

  const restartCaret = () => {
    state.keyCaretSince = performance.now();
  };
  keyField.addEventListener('focus', () => {
    state.keyFocused = true;
    restartCaret();
  });
  keyField.addEventListener('blur', () => {
    state.keyFocused = false;
  });
  keyField.addEventListener('input', () => {
    restartCaret();
    emit({ type: 'key-edited' });
  });

  // Pointer listeners sit on the whole page, not just the canvas, so a finger anywhere on the screen (including the
  // letterbox margins around the court) drives the paddle. Touch pointers are implicitly captured by the element they
  // started on, and their events bubble up here, so a drag keeps being tracked wherever it goes.
  target.addEventListener('pointerdown', (event) => {
    const isTouch = event.pointerType === 'touch';
    const onCanvas = event.target === canvas;
    // Mouse clicks outside the court mean nothing to the game.
    if (!isTouch && !onCanvas) {
      return;
    }
    // Keeps the page from stealing focus back from the key field right after a tap focused it.
    event.preventDefault();
    const point = pointFrom(event);
    state.lastInputType = isTouch ? 'touch' : 'keyboard';
    // A tap on a button must only press it: the finger stays off the paddle.
    if (isTouch && !isControlAt(point)) {
      paddlePointerId = event.pointerId;
      state.pointerY = point.y;
    }
    emit({ type: 'tap', x: point.x, y: point.y });
  });

  // A mouse (or a hovering pen) steers the paddle just by moving, no button needed. It has no release, so the target
  // stays where the pointer was last seen: leaving the window or switching apps leaves the paddle in place.
  target.addEventListener('pointermove', (event) => {
    const isMouseLike = event.pointerType === 'mouse' || event.pointerType === 'pen';
    if (isMouseLike || event.pointerId === paddlePointerId) {
      state.pointerY = pointFrom(event).y;
    }
  });

  for (const type of ['pointerup', 'pointercancel']) {
    target.addEventListener(type, (event) => {
      if (event.pointerId === paddlePointerId) {
        paddlePointerId = null;
        state.pointerY = null;
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
