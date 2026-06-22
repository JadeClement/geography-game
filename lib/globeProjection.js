export const GLOBE_MAP_WIDTH = 720;
export const GLOBE_MAP_HEIGHT = 360;

export const OCEANIA_MAP_WIDTH = 480;
export const OCEANIA_MAP_HEIGHT = 300;

/** Map origin — mid-Atlantic on the left edge; world wraps through the Pacific. */
export const PACIFIC_MAP_ORIGIN_LNG = -30;

/** @deprecated Use PACIFIC_MAP_ORIGIN_LNG */
export const PACIFIC_ATLANTIC_CUT_LNG = PACIFIC_MAP_ORIGIN_LNG;

/** @deprecated Use PACIFIC_MAP_ORIGIN_LNG */
export const OCEANIA_LNG_SHIFT_THRESHOLD = PACIFIC_MAP_ORIGIN_LNG;

export function shiftLngForOceania(lng) {
  let rotated = lng - PACIFIC_MAP_ORIGIN_LNG;
  rotated %= 360;
  if (rotated < 0) rotated += 360;
  return rotated;
}

export function rotatedLngDelta(lng1, lng2) {
  return Math.abs(shiftLngForOceania(lng2) - shiftLngForOceania(lng1));
}

export function createPacificMapView({
  width,
  height,
  minLng = 105,
  maxLng = 208,
  minLat = -48,
  maxLat = 11,
}) {
  return {
    id: "pacific",
    width,
    height,
    minLng,
    maxLng,
    minLat,
    maxLat,
    project(lng, lat, w, h) {
      const shifted = shiftLngForOceania(lng);
      if (shifted < minLng || shifted > maxLng || lat < minLat || lat > maxLat) {
        return null;
      }
      const x = ((shifted - minLng) / (maxLng - minLng)) * w;
      const y = ((maxLat - lat) / (maxLat - minLat)) * h;
      return [x, y];
    },
  };
}

/** Tight crop for the region picker on the start screen. */
export const PACIFIC_REGION_PICKER_VIEW = createPacificMapView({
  width: OCEANIA_MAP_WIDTH,
  height: OCEANIA_MAP_HEIGHT,
  minLng: 140,
  maxLng: 242,
  minLat: -44,
  maxLat: 9,
});

/** Full world canvas — Atlantic on left/right edges, Europe/Africa left, Americas right. */
export const PACIFIC_WORLD_VIEW = createPacificMapView({
  width: 2200,
  height: 840,
  minLng: -2,
  maxLng: 362,
  minLat: -58,
  maxLat: 84,
});

export const PACIFIC_GAME_VIEW = PACIFIC_WORLD_VIEW;

export function projectLngLat(lng, lat, width = GLOBE_MAP_WIDTH, height = GLOBE_MAP_HEIGHT) {
  return [((lng + 180) / 360) * width, ((90 - lat) / 180) * height];
}

export const REGION_MAP_VIEWS = {
  world: {
    id: "world",
    width: GLOBE_MAP_WIDTH,
    height: GLOBE_MAP_HEIGHT,
    project(lng, lat, width, height) {
      return projectLngLat(lng, lat, width, height);
    },
  },
  oceania: PACIFIC_REGION_PICKER_VIEW,
};

export function getRegionMapView(regionId) {
  return regionId === "oceania" ? REGION_MAP_VIEWS.oceania : REGION_MAP_VIEWS.world;
}

export function crossesPacificSeam(lng1, lng2) {
  return rotatedLngDelta(lng1, lng2) > 180;
}

/** Split a ring where the Pacific longitude shift would draw a seam-spanning edge. */
export function splitRingAtPacificSeam(ring) {
  if (ring.length < 3) return [ring];

  const closed =
    ring.length > 2 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];

  const vertices = closed ? ring.slice(0, -1) : [...ring];
  if (vertices.length < 3) return [ring];

  const segments = [];
  let current = [vertices[0]];

  for (let i = 1; i < vertices.length; i += 1) {
    const point = vertices[i];
    const prev = vertices[i - 1];

    if (crossesPacificSeam(prev[0], point[0])) {
      if (current.length >= 3) segments.push(current);
      current = [point];
    } else {
      current.push(point);
    }
  }

  if (closed && current.length >= 2) {
    const last = current[current.length - 1];
    const first = current[0];
    if (crossesPacificSeam(last[0], first[0])) {
      if (current.length >= 3) segments.push(current);
    } else if (current.length >= 3) {
      segments.push(current);
    }
  } else if (current.length >= 3) {
    segments.push(current);
  }

  return segments.length > 0 ? segments : [ring];
}

function shouldSplitPacificEdge(mapView, lng1, lat1, lng2, lat2) {
  if (crossesPacificSeam(lng1, lng2)) return true;

  const { width, height } = mapView;
  const p1 = mapView.project(lng1, lat1, width, height);
  const p2 = mapView.project(lng2, lat2, width, height);
  if (!p1 || !p2) return true;

  return Math.abs(p2[0] - p1[0]) > width * 0.2;
}

/** Split rings at Pacific seams and clipped projection gaps before simplify/path build. */
export function splitRingForPacificProjection(ring, mapView) {
  if (mapView.id !== "pacific" || ring.length < 3) return [ring];

  const closed =
    ring.length > 2 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];

  const vertices = closed ? ring.slice(0, -1) : [...ring];
  if (vertices.length < 3) return [ring];

  const segments = [];
  let current = [];

  for (let i = 0; i < vertices.length; i += 1) {
    const point = vertices[i];
    const prev = i > 0 ? vertices[i - 1] : null;
    const proj = mapView.project(point[0], point[1], mapView.width, mapView.height);

    if (prev && shouldSplitPacificEdge(mapView, prev[0], prev[1], point[0], point[1])) {
      if (current.length >= 3) segments.push(current);
      current = [];
    }

    if (proj) {
      current.push(point);
    } else if (current.length >= 3) {
      segments.push(current);
      current = [];
    }
  }

  if (current.length >= 3) segments.push(current);
  return segments.length > 0 ? segments : splitRingAtPacificSeam(ring);
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

function resolveMapView(widthOrView, height) {
  if (typeof widthOrView === "object" && widthOrView?.project) {
    return widthOrView;
  }
  return REGION_MAP_VIEWS.world;
}

function resolveDimensions(mapView, widthOrView, height) {
  if (typeof widthOrView === "number") {
    return { width: widthOrView, height };
  }
  return { width: mapView.width, height: mapView.height };
}

export function simplifyRing(ring, tolerance, mapView = REGION_MAP_VIEWS.world) {
  const { width, height } = mapView;
  const isPacific = mapView.id === "pacific";
  const maxEdgeDx = isPacific ? width * 0.2 : width;
  const points = [];

  for (const [lng, lat] of ring) {
    const proj = mapView.project(lng, lat, width, height);
    if (proj) {
      points.push({ lng, lat, proj });
    }
  }

  if (points.length < 3) return [];

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  function simplifySection(start, end) {
    if (end - start <= 1) return;

    if (isPacific) {
      const spanDx = Math.abs(points[end].proj[0] - points[start].proj[0]);
      if (spanDx > maxEdgeDx) {
        const mid = Math.floor((start + end) / 2);
        keep[mid] = true;
        simplifySection(start, mid);
        simplifySection(mid, end);
        return;
      }
    }

    let maxDistance = 0;
    let index = 0;

    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(
        points[i].proj,
        points[start].proj,
        points[end].proj
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

  simplifySection(0, points.length - 1);
  return points.filter((_, index) => keep[index]).map((point) => [point.lng, point.lat]);
}

export function ringToPath(ring, mapView = REGION_MAP_VIEWS.world) {
  if (ring.length < 2) return "";

  const { width, height } = mapView;
  const isPacific = mapView.id === "pacific";
  const maxEdgeDx = isPacific ? width * 0.2 : width;
  const subpaths = [];
  let commands = [];
  let prevPoint = null;
  let prevLng = null;

  const flush = () => {
    if (commands.length < 3) {
      commands = [];
      prevPoint = null;
      prevLng = null;
      return;
    }

    const parts = commands.map((point, index) =>
      `${index === 0 ? "M" : "L"}${point[0].toFixed(1)},${point[1].toFixed(1)}`
    );
    subpaths.push(`${parts.join(" ")} Z`);
    commands = [];
    prevPoint = null;
    prevLng = null;
  };

  for (const [lng, lat] of ring) {
    const point = mapView.project(lng, lat, width, height);
    if (!point) {
      flush();
      continue;
    }

    const [x, y] = point;

    if (prevPoint) {
      const dx = Math.abs(x - prevPoint[0]);
      const seamCross = isPacific && crossesPacificSeam(prevLng, lng);
      if (dx > maxEdgeDx || seamCross) {
        flush();
      }
    }

    commands.push([x, y]);
    prevPoint = [x, y];
    prevLng = lng;
  }

  flush();
  return subpaths.join(" ");
}

export function geometryToPathData(geometry, tolerance, widthOrView, height) {
  const mapView = resolveMapView(widthOrView, height);
  const { width, height: mapHeight } = resolveDimensions(mapView, widthOrView, height);

  const rings =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates.flat()
        : [];

  const parts = rings
    .flatMap((ring) =>
      mapView.id === "pacific" ? splitRingForPacificProjection(ring, mapView) : [ring]
    )
    .map((ring) => simplifyRing(ring, tolerance, mapView))
    .filter((ring) => ring.length >= 3)
    .map((ring) => ringToPath(ring, mapView))
    .filter(Boolean);

  return parts.join(" ");
}
