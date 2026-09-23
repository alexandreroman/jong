// Purely visual effects for Jong: the ball trail and the paddle recoil. No DOM, no clock: main.js feeds the frame
// delta and the physics hit signal, and renderer.js reads the result. Nothing here feeds back into game.js.

/** How long a ball position stays in the trail; about 9 positions at 60 fps. */
export const TRAIL_DURATION_S = 0.15;
/** How far, in court pixels, a paddle pulls back when it hits the ball. */
export const RECOIL_DISTANCE = 5;
export const RECOIL_DURATION_S = 0.15;

/** Creates an empty effects state: call again whenever the ball is re-served so no trail streaks from the old spot. */
export function createFx() {
  return {
    // Oldest first; `age` is the time in seconds since the ball was at that position.
    trail: [],
    // Seconds of recoil left for each paddle.
    recoil: { human: 0, jev: 0 },
  };
}

/**
 * Advances the effects by `dt` seconds, then records the ball position and starts the recoil of the paddle that hit
 * the ball during this frame, if any.
 *
 * @param {{ ball: { x: number, y: number }, hit: 'human' | 'jev' | null }} frame
 */
export function updateFx(fx, dt, { ball, hit }) {
  for (const point of fx.trail) {
    point.age += dt;
  }
  fx.trail = fx.trail.filter((point) => point.age < TRAIL_DURATION_S);
  fx.trail.push({ x: ball.x, y: ball.y, age: 0 });

  fx.recoil.human = Math.max(0, fx.recoil.human - dt);
  fx.recoil.jev = Math.max(0, fx.recoil.jev - dt);
  if (hit !== null) {
    fx.recoil[hit] = RECOIL_DURATION_S;
  }
}

/**
 * Tells how far, in court pixels, a paddle is pulled back from its rest position. The paddle jumps back at once, then
 * eases out on its way home (quadratic), which reads as a strike rather than a slide.
 */
export function recoilOffset(fx, player) {
  const remaining = fx.recoil[player] / RECOIL_DURATION_S;
  return RECOIL_DISTANCE * remaining * remaining;
}
