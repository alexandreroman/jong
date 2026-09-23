// Responsive canvas sizing: the game always draws in a fixed logical coordinate system,
// while the on-screen size shrinks to fit the viewport.

export const LOGICAL_WIDTH = 800;
export const LOGICAL_HEIGHT = 400;
// Space kept between the canvas and each viewport edge (CSS px), so the court never touches the screen edges.
export const VIEWPORT_MARGIN = 16;

/**
 * Computes the canvas size in CSS pixels: the largest 2:1 box that fits in the viewport
 * minus VIEWPORT_MARGIN on each side, capped at the logical size. Values are not rounded.
 *
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {{width: number, height: number}}
 */
export function computeCanvasSize(viewportWidth, viewportHeight) {
  // The margin lives in this computation rather than in CSS, because a CSS margin would be ignored here and overflow.
  const availableWidth = Math.max(0, viewportWidth - 2 * VIEWPORT_MARGIN);
  const availableHeight = Math.max(0, viewportHeight - 2 * VIEWPORT_MARGIN);
  const maxWidth = Math.min(LOGICAL_WIDTH, availableWidth);
  const maxHeight = Math.min(LOGICAL_HEIGHT, availableHeight);
  const aspectRatio = LOGICAL_WIDTH / LOGICAL_HEIGHT;

  const width = Math.min(maxWidth, maxHeight * aspectRatio);
  return { width, height: width / aspectRatio };
}

/**
 * Sizes the canvas to the viewport, keeps it sharp on high-density screens,
 * and keeps it up to date on resize and orientation change.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D} a context that draws in logical coordinates
 */
export function setupCanvas(canvas) {
  const context = canvas.getContext('2d');

  function resize() {
    const { width, height } = computeCanvasSize(window.innerWidth, window.innerHeight);
    const pixelRatio = window.devicePixelRatio || 1;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    // Resizing the backing store resets the context state, so the transform must be applied again.
    context.setTransform(canvas.width / LOGICAL_WIDTH, 0, 0, canvas.height / LOGICAL_HEIGHT, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  return context;
}
