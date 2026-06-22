import { PACIFIC_WORLD_VIEW } from "@/lib/globeProjection";

export const PACIFIC_MAP_WIDTH = PACIFIC_WORLD_VIEW.width;
export const PACIFIC_MAP_HEIGHT = PACIFIC_WORLD_VIEW.height;

/** Default viewport: zoomed to the Oceania quiz region within the world canvas. */
export const PACIFIC_OCEANIA_FOCUS = {
  x: 836,
  y: 330,
  width: 656,
  height: 491,
};

/** Max zoom in (narrowest viewBox). */
export const PACIFIC_MAX_SCALE = 8;
/** Max zoom out — exactly the full world canvas (all countries visible). */
export const PACIFIC_MIN_SCALE = 1;

export const PACIFIC_OCEAN_PADDING = Math.round(PACIFIC_MAP_WIDTH * 0.12);

export function getDefaultPacificViewBox() {
  return { ...PACIFIC_OCEANIA_FOCUS };
}

function clampViewSize(width, height) {
  const minWidth = PACIFIC_MAP_WIDTH / PACIFIC_MAX_SCALE;
  const maxWidth = PACIFIC_MAP_WIDTH / PACIFIC_MIN_SCALE;
  const minHeight = PACIFIC_MAP_HEIGHT / PACIFIC_MAX_SCALE;
  const maxHeight = PACIFIC_MAP_HEIGHT / PACIFIC_MIN_SCALE;

  return {
    width: Math.min(maxWidth, Math.max(minWidth, width)),
    height: Math.min(maxHeight, Math.max(minHeight, height)),
  };
}

export function zoomPacificViewBox(viewBox, factor, focalX, focalY) {
  const nextSize = clampViewSize(viewBox.width * factor, viewBox.height * factor);
  const scaleX = nextSize.width / viewBox.width;
  const scaleY = nextSize.height / viewBox.height;

  return clampPacificViewBox({
    x: focalX - (focalX - viewBox.x) * scaleX,
    y: focalY - (focalY - viewBox.y) * scaleY,
    width: nextSize.width,
    height: nextSize.height,
  });
}

export function panPacificViewBox(viewBox, deltaX, deltaY) {
  return clampPacificViewBox({
    ...viewBox,
    x: viewBox.x + deltaX,
    y: viewBox.y + deltaY,
  });
}

export function viewBoxToString(viewBox) {
  return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
}

export function clientPointToSvg(svg, clientX, clientY) {
  if (!svg) return { x: 0, y: 0 };

  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM()?.inverse();
  if (!matrix) return { x: 0, y: 0 };

  const transformed = point.matrixTransform(matrix);
  return { x: transformed.x, y: transformed.y };
}

export function getPacificWorldViewBox() {
  return {
    x: 0,
    y: 0,
    width: PACIFIC_MAP_WIDTH,
    height: PACIFIC_MAP_HEIGHT,
  };
}

export function clampPacificViewBox(viewBox) {
  const world = getPacificWorldViewBox();

  if (viewBox.width >= world.width && viewBox.height >= world.height) {
    return { ...world };
  }

  const maxX = world.x + world.width - viewBox.width;
  const maxY = world.y + world.height - viewBox.height;

  return {
    ...viewBox,
    x: Math.max(world.x, Math.min(maxX, viewBox.x)),
    y: Math.max(world.y, Math.min(maxY, viewBox.y)),
  };
}
