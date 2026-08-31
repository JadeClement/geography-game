/**
 * Pole of inaccessibility — the point inside a polygon farthest from the
 * boundary (largest inscribed circle). Used as a map-label visual center.
 *
 * Same algorithm as @mapbox/polylabel (BSD-2-Clause).
 * `polygon` is GeoJSON-style rings: [exterior, ...holes], each ring [lng, lat][].
 */

function signedDistanceToPolygon(x, y, polygon) {
  let inside = false;
  let minDistSq = Infinity;

  for (const ring of polygon) {
    if (!Array.isArray(ring) || ring.length < 2) continue;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i];
      const b = ring[j];
      if (!a || !b || a.length < 2 || b.length < 2) continue;

      const ax = a[0];
      const ay = a[1];
      const bx = b[0];
      const by = b[1];

      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
        inside = !inside;
      }

      minDistSq = Math.min(minDistSq, segmentDistanceSq(x, y, ax, ay, bx, by));
    }
  }

  if (!Number.isFinite(minDistSq)) return 0;
  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function segmentDistanceSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const ex = px - (ax + dx * t);
  const ey = py - (ay + dy * t);
  return ex * ex + ey * ey;
}

function ringAreaCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    cx += (a[0] + b[0]) * cross;
    cy += (a[1] + b[1]) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) return null;
  return [cx / (6 * area), cy / (6 * area), Math.abs(area)];
}

function makeCell(x, y, h, polygon) {
  const d = signedDistanceToPolygon(x, y, polygon);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

class CellQueue {
  constructor() {
    this.data = [];
  }

  get length() {
    return this.data.length;
  }

  push(cell) {
    this.data.push(cell);
    bubbleUp(this.data, this.data.length - 1);
  }

  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      bubbleDown(this.data, 0);
    }
    return top;
  }
}

function bubbleUp(data, index) {
  const cell = data[index];
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (data[parent].max >= cell.max) break;
    data[index] = data[parent];
    index = parent;
  }
  data[index] = cell;
}

function bubbleDown(data, index) {
  const length = data.length;
  const cell = data[index];
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let next = index;
    if (left < length && data[left].max > data[next].max) next = left;
    if (right < length && data[right].max > data[next].max) next = right;
    if (next === index) break;
    data[index] = data[next];
    index = next;
  }
  data[index] = cell;
}

/**
 * @param {number[][][]} polygon GeoJSON polygon rings
 * @param {number} [precision]
 * @returns {[number, number] & { distance: number }}
 */
export function polylabel(polygon, precision = 1) {
  const ring = polygon?.[0];
  if (!Array.isArray(ring) || ring.length < 3) {
    const empty = [0, 0];
    empty.distance = 0;
    return empty;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  let h = cellSize / 2;

  if (!(cellSize > 0) || !Number.isFinite(cellSize)) {
    const fallback = [minX, minY];
    fallback.distance = 0;
    return fallback;
  }

  const centroid = ringAreaCentroid(ring);
  let best = centroid
    ? makeCell(centroid[0], centroid[1], 0, polygon)
    : makeCell(minX + width / 2, minY + height / 2, 0, polygon);

  const bboxCell = makeCell(minX + width / 2, minY + height / 2, 0, polygon);
  if (bboxCell.d > best.d) best = bboxCell;

  const queue = new CellQueue();
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(makeCell(x + h, y + h, h, polygon));
    }
  }

  while (queue.length > 0) {
    const cell = queue.pop();
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;

    h = cell.h / 2;
    queue.push(makeCell(cell.x - h, cell.y - h, h, polygon));
    queue.push(makeCell(cell.x + h, cell.y - h, h, polygon));
    queue.push(makeCell(cell.x - h, cell.y + h, h, polygon));
    queue.push(makeCell(cell.x + h, cell.y + h, h, polygon));
  }

  const result = [best.x, best.y];
  result.distance = best.d;
  return result;
}

export function pointInPolygon(x, y, polygon) {
  return signedDistanceToPolygon(x, y, polygon) > 0;
}

export { signedDistanceToPolygon };
