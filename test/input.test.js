import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { createInput, toLogicalPoint } from '../src/input.js';

// Own properties shadow read-only Event getters such as `target`, which Object.assign cannot set.
function event(type, props = {}) {
  const result = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(props)) {
    Object.defineProperty(result, name, { value });
  }
  return result;
}

function keyEvent(type, key, props = {}) {
  return event(type, { key, repeat: false, ...props });
}

describe('toLogicalPoint', () => {
  it('maps a point on a half-size canvas to court coordinates', () => {
    const rect = { left: 10, top: 20, width: 400, height: 200 };
    assert.deepEqual(toLogicalPoint(210, 120, rect), { x: 400, y: 200 });
  });
});

describe('createInput', () => {
  let window;
  let canvas;
  let keyField;
  let input;
  let actions;

  beforeEach(() => {
    window = new EventTarget();
    canvas = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }),
      setPointerCapture() {},
    });
    keyField = Object.assign(new EventTarget(), { value: '', focus() {}, blur() {} });
    input = createInput({ canvas, keyField, target: window });
    actions = [];
    input.onAction((action) => actions.push(action));
  });

  it('turns W/S and arrow keys into a paddle direction', () => {
    window.dispatchEvent(keyEvent('keydown', 's'));
    assert.equal(input.state.direction, 1);
    window.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    assert.equal(input.state.direction, 0);
    window.dispatchEvent(keyEvent('keyup', 's'));
    assert.equal(input.state.direction, -1);
    window.dispatchEvent(keyEvent('keyup', 'ArrowUp'));
    assert.equal(input.state.direction, 0);
  });

  it('matches letter keys regardless of case', () => {
    window.dispatchEvent(keyEvent('keydown', 'W'));
    assert.equal(input.state.direction, -1);
    window.dispatchEvent(keyEvent('keyup', 'w'));
    assert.equal(input.state.direction, 0);
  });

  it('emits actions for Space, Enter, Esc, P, Q and K', () => {
    for (const key of [' ', 'Enter', 'Escape', 'p', 'Q', 'k']) {
      window.dispatchEvent(keyEvent('keydown', key));
    }
    assert.deepEqual(actions.map((action) => action.type),
      ['confirm', 'confirm', 'pause', 'pause', 'quit', 'change-key']);
  });

  it('ignores auto-repeated action keys', () => {
    window.dispatchEvent(keyEvent('keydown', ' ', { repeat: true }));
    assert.equal(actions.length, 0);
  });

  it('only reacts to Enter while the key field has focus', () => {
    window.dispatchEvent(keyEvent('keydown', 'q', { target: keyField }));
    window.dispatchEvent(keyEvent('keydown', 's', { target: keyField }));
    assert.equal(actions.length, 0);
    assert.equal(input.state.direction, 0);
    window.dispatchEvent(keyEvent('keydown', 'Enter', { target: keyField }));
    assert.deepEqual(actions, [{ type: 'confirm' }]);
  });

  it('tracks a finger on the left half and emits a tap', () => {
    canvas.dispatchEvent(event('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 50, clientY: 60 }));
    assert.equal(input.state.touchY, 120);
    assert.equal(input.state.lastInputType, 'touch');
    assert.deepEqual(actions, [{ type: 'tap', x: 100, y: 120 }]);

    canvas.dispatchEvent(event('pointermove', { pointerId: 1, clientX: 50, clientY: 100 }));
    assert.equal(input.state.touchY, 200);
    canvas.dispatchEvent(event('pointerup', { pointerId: 1 }));
    assert.equal(input.state.touchY, null);
  });

  it('does not move the paddle for a tap on the right half or a mouse click', () => {
    canvas.dispatchEvent(event('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 300, clientY: 60 }));
    canvas.dispatchEvent(event('pointerdown', { pointerType: 'mouse', pointerId: 3, clientX: 50, clientY: 60 }));
    assert.equal(input.state.touchY, null);
    assert.equal(input.state.lastInputType, 'keyboard');
    assert.equal(actions.length, 2);
  });

  it('reads and clears the key field', () => {
    keyField.value = '  sk-123  ';
    assert.equal(input.keyValue, 'sk-123');
    input.clearKeyField();
    assert.equal(input.keyValue, '');
  });

  it('starts in the given input mode', () => {
    const touchInput = createInput({ canvas, keyField, target: window, initialInputType: 'touch' });
    assert.equal(touchInput.state.lastInputType, 'touch');
  });

  it('ignores keydown and keyup events with no key', () => {
    assert.doesNotThrow(() => {
      window.dispatchEvent(event('keydown', { repeat: false }));
      window.dispatchEvent(event('keyup', {}));
    });
    assert.equal(actions.length, 0);
  });
});
