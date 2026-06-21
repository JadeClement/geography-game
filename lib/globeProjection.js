export const GLOBE_MAP_WIDTH = 720;
export const GLOBE_MAP_HEIGHT = 360;

export function projectLngLat(lng, lat, width = GLOBE_MAP_WIDTH, height = GLOBE_MAP_HEIGHT) {
  return [((lng + 180) / 360) * width, ((90 - lat) / 180) * height];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }

  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(x - projX, y - projY);
}

export function simplifyRing(ring, tolerance) {
  if (ring.length <= 3) return ring;

  const projected = ring.map(([lng, lat]) => projectLngLat(lng, lat));
  const keep = new Array(projected.length).fill(false);
  keep[0] = true;
  keep[projected.length - 1] = true;

  function simplifySection(start, end) {
    let maxDistance = 0;
    let index = 0;

    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(
        projected[i],
        projected[start],
        projected[end]
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (maxDistance > tolerance) {
      keep[index] = true;
      simplifySection(start, index);
      simplifySection(index, end);
    }
  }

  simplifySection(0, projected.length - 1);
  return ring.filter((_, index) => keep[index]);
}

export function ringToPath(ring, width = GLOBE_MAP_WIDTH, height = GLOBE_MAP_HEIGHT) {
  if (ring.length < 2) return "";

  return (
    ring
      .map(([lng, lat], index) => {
        const [x, y] = projectLngLat(lng, lat, width, height);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

export function geometryToPathData(geometry, tolerance, width, height) {
  const rings =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates.flat()
        : [];

  const parts = rings
    .map((ring) => simplifyRing(ring, tolerance))
    .filter((ring) => ring.length >= 3)
    .map((ring) => ringToPath(ring, width, height))
    .filter(Boolean);

  return parts.join(" ");
}
