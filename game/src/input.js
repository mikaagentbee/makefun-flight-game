// Keyboard and mouse, read as one stick. Arrows or WASD fly the plane, Shift
// and Ctrl (or the mouse wheel) work the throttle, G drops the flaps, B is the
// airbrake, and the mouse itself steers when it moves: the stick follows how far
// the pointer sits from the middle of the screen.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_FLAPS = 4;
export const ACTION_BRAKE = 8;
export const ACTION_MISSION_1 = 16;
export const ACTION_MISSION_2 = 32;
export const ACTION_MISSION_3 = 64;
export const ACTION_RESTART = 128;

/** The keys the game listens to, so the help line and the handler agree. */
const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  ' ': ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  p: ACTION_PAUSE,
  P: ACTION_PAUSE,
  g: ACTION_FLAPS,
  G: ACTION_FLAPS,
  b: ACTION_BRAKE,
  B: ACTION_BRAKE,
  1: ACTION_MISSION_1,
  2: ACTION_MISSION_2,
  3: ACTION_MISSION_3,
  r: ACTION_RESTART,
  R: ACTION_RESTART,
};

/** Create the input for a canvas. Keys are tracked by their `key` value. */
export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let wheelDelta = 0;
  let pointer = { x: 0, y: 0, active: false };
  let pointerDown = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.key);
    const action = KEY_ACTIONS[event.key];
    if (action) actions |= action;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.key);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointer = {
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
      active: true,
    };
  }

  function onPointerDown(event) {
    pointerDown = true;
    onPointerMove(event);
  }

  function onPointerUp() {
    pointerDown = false;
  }

  function onWheel(event) {
    wheelDelta += event.deltaY;
    event.preventDefault();
  }

  function onBlur() {
    keys.clear();
    pointer.active = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  /** The stick the plane flies with this frame: pitch and roll in [-1, 1]. */
  function stick() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) roll += 1;
    // The mouse steers too, when it is off-centre and no arrow key is held.
    if (pointer.active && pitch === 0 && roll === 0) {
      pitch = Math.max(-1, Math.min(1, -pointer.y * 3));
      roll = Math.max(-1, Math.min(1, pointer.x * 3));
    }
    return { pitch, roll };
  }

  /** The throttle nudge since the last call: Shift up, Ctrl down, wheel either way. */
  function throttleDelta(dt) {
    let delta = 0;
    if (keys.has('Shift')) delta += 0.9 * dt;
    if (keys.has('Control')) delta -= 0.9 * dt;
    if (wheelDelta !== 0) {
      delta += Math.max(-0.2, Math.min(0.2, -wheelDelta * 0.0004));
      wheelDelta = 0;
    }
    return delta;
  }

  /** Take and clear the one-shot actions pressed since the last call. */
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  /** Whether the mouse button is held: a click confirms, like Enter. */
  function clicked() {
    if (!pointerDown) return false;
    pointerDown = false;
    return true;
  }

  return { stick, throttleDelta, takeActions, clicked };
}
