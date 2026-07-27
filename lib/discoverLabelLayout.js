const LABEL_GAP = 4;
const MAP_EDGE_PADDING = 4;
const WEIGHT_DISTANCE = 3;
const WEIGHT_DISTANCE_OVERFLOW = 0.8;
const WEIGHT_OCCLUSION = 60;
const WEIGHT_OCCLUSION_OVER_LIMIT = 120;
const MAX_SOFT_OCCLUSION = 0.5;
const WEIGHT_OFFSET = 10;
const WEIGHT_LABEL_OVERLAP = 10000;
const WEIGHT_DIRECTION_BLOCK = 20;
const DIRECTION_PROBE_LENGTH = 100;
const MAX_REFINEMENT_ROUNDS = 60;
const MIN_LEADER_DISTANCE = 32;
const MIN_MAX_ANCHOR_DISTANCE = 36;
const MAX_MAX_ANCHOR_DISTANCE = 72;
const ANCHOR_DISTANCE_COUNTRY_SCALE = 0.55;
// Overseas territories can span continents in GeoJSON bboxes (e.g. France).
// Use a compact anchor-local bounds for own-country placement rules.
const COMPACT_OWN_COUNTRY_MAX_SPAN = 96;
const COMPACT_OWN_COUNTRY_RADIUS = 36;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function rectsOverlap(a, b, margin = 0) {
  return !(
    a.right + margin <= b.left ||
    a.left - margin >= b.right ||
    a.bottom + margin <= b.top ||
    a.top - margin >= b.bottom
  );
}

function overlapArea(a, b) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function rectArea(rect) {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

export function getCountryOcclusionRatio(labelRect, countryRect) {
  const countryArea = rectArea(countryRect);
  if (countryArea <= 0) return 0;
  return overlapArea(labelRect, countryRect) / countryArea;
}

function clampRect(rect, bounds) {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const left = clamp(rect.left, bounds.left, bounds.right - width);
  const top = clamp(rect.top, bounds.top, bounds.bottom - height);
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

function fitsInBounds(rect, bounds) {
  return (
    rect.left >= bounds.left &&
    rect.top >= bounds.top &&
    rect.right <= bounds.right &&
    rect.bottom <= bounds.bottom
  );
}

export function nearestPointOnRect(point, rect) {
  if (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  ) {
    const distances = [
      { x: rect.left, y: point.y, d: point.x - rect.left },
      { x: rect.right, y: point.y, d: rect.right - point.x },
      { x: point.x, y: rect.top, d: point.y - rect.top },
      { x: point.x, y: rect.bottom, d: rect.bottom - point.y },
    ];
    distances.sort((a, b) => a.d - b.d);
    return { x: distances[0].x, y: distances[0].y };
  }

  return {
    x: clamp(point.x, rect.left, rect.right),
    y: clamp(point.y, rect.top, rect.bottom),
  };
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function buildPlacementCandidates(anchor, width, height) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const attached = [
    { left: anchor.x - halfWidth, top: anchor.y - height - LABEL_GAP, offset: false },
    { left: anchor.x - halfWidth, top: anchor.y + LABEL_GAP, offset: false },
    { left: anchor.x + LABEL_GAP, top: anchor.y - halfHeight, offset: false },
    { left: anchor.x - width - LABEL_GAP, top: anchor.y - halfHeight, offset: false },
  ];

  const offset = [];
  const distances = [12, 20, 28, 40, 52, 64, 80, 96, 112];
  const angles = [270, 300, 330, 0, 30, 60, 90, 135, 180, 225];

  for (const distance of distances) {
    for (const angle of angles) {
      const radians = (angle * Math.PI) / 180;
      offset.push({
        left: anchor.x + Math.cos(radians) * distance - halfWidth,
        top: anchor.y + Math.sin(radians) * distance - halfHeight,
        offset: true,
      });
    }
  }

  return [...attached, ...offset];
}

function toRect(candidate, width, height) {
  return {
    left: candidate.left,
    top: candidate.top,
    right: candidate.left + width,
    bottom: candidate.top + height,
  };
}

function labelCenter(rect) {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

function getOwnCountryBounds(ownCountryId, countryBounds) {
  return countryBounds.find((country) => country.countryId === ownCountryId) ?? null;
}

export function getLayoutOwnCountryBounds(ownCountryId, countryBounds, anchor) {
  const full = getOwnCountryBounds(ownCountryId, countryBounds);
  if (!full || !anchor) return full;

  const span = Math.max(full.right - full.left, full.bottom - full.top);
  if (span <= COMPACT_OWN_COUNTRY_MAX_SPAN) return full;

  return {
    countryId: ownCountryId,
    left: anchor.x - COMPACT_OWN_COUNTRY_RADIUS,
    top: anchor.y - COMPACT_OWN_COUNTRY_RADIUS,
    right: anchor.x + COMPACT_OWN_COUNTRY_RADIUS,
    bottom: anchor.y + COMPACT_OWN_COUNTRY_RADIUS,
  };
}

function maxAnchorDistance(ownCountryId, countryBounds, anchor) {
  const own = getLayoutOwnCountryBounds(ownCountryId, countryBounds, anchor);
  if (!own) return 56;

  const span = Math.max(own.right - own.left, own.bottom - own.top);
  return clamp(
    span * ANCHOR_DISTANCE_COUNTRY_SCALE,
    MIN_MAX_ANCHOR_DISTANCE,
    MAX_MAX_ANCHOR_DISTANCE
  );
}

function isCenterInOwnCountry(rect, ownCountryId, countryBounds, anchor) {
  const own = getLayoutOwnCountryBounds(ownCountryId, countryBounds, anchor);
  if (!own) return distanceToAnchor(anchor, rect) <= MIN_MAX_ANCHOR_DISTANCE;

  const center = labelCenter(rect);
  return pointInRect(center.x, center.y, own);
}

function distanceCost(anchor, rect, ownCountryId, countryBounds) {
  const distance = distanceToAnchor(anchor, rect);
  const maxDistance = maxAnchorDistance(ownCountryId, countryBounds, anchor);
  const softLimit = maxDistance * 0.45;
  let cost = distance * WEIGHT_DISTANCE;

  if (distance > softLimit) {
    cost += (distance - softLimit) ** 2 * WEIGHT_DISTANCE_OVERFLOW;
  }

  if (!isCenterInOwnCountry(rect, ownCountryId, countryBounds, anchor)) {
    cost += 40;
  }

  return cost;
}

function distanceToAnchor(anchor, rect) {
  const center = labelCenter(rect);
  return Math.hypot(center.x - anchor.x, center.y - anchor.y);
}

function occlusionPenalty(rect, ownCountryId, countryBounds) {
  let penalty = 0;

  for (const country of countryBounds) {
    if (country.countryId === ownCountryId) continue;

    const ratio = getCountryOcclusionRatio(rect, country);
    if (ratio <= 0) continue;

    if (ratio > MAX_SOFT_OCCLUSION) {
      penalty +=
        MAX_SOFT_OCCLUSION * WEIGHT_OCCLUSION +
        (ratio - MAX_SOFT_OCCLUSION) * WEIGHT_OCCLUSION_OVER_LIMIT;
    } else {
      penalty += ratio * ratio * WEIGHT_OCCLUSION;
    }
  }

  return penalty;
}

function directionBlockage(anchor, rect, ownCountryId, countryBounds) {
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const dx = centerX - anchor.x;
  const dy = centerY - anchor.y;
  const length = Math.hypot(dx, dy) || 1;
  const stepX = (dx / length) * (DIRECTION_PROBE_LENGTH / 10);
  const stepY = (dy / length) * (DIRECTION_PROBE_LENGTH / 10);

  let blockage = 0;
  for (let step = 1; step <= 10; step += 1) {
    const x = anchor.x + stepX * step;
    const y = anchor.y + stepY * step;

    for (const country of countryBounds) {
      if (country.countryId === ownCountryId) continue;
      if (pointInRect(x, y, country)) {
        blockage += 1;
      }
    }
  }

  return blockage * WEIGHT_DIRECTION_BLOCK;
}

function candidateCost(measurement, candidate, rect, countryBounds) {
  return (
    distanceCost(measurement.anchor, rect, measurement.id, countryBounds) +
    occlusionPenalty(rect, measurement.id, countryBounds) +
    directionBlockage(measurement.anchor, rect, measurement.id, countryBounds) +
    (candidate.offset ? WEIGHT_OFFSET : 0)
  );
}

function labelOverlapPenalty(assignments) {
  const entries = Object.values(assignments);
  let penalty = 0;

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      penalty += overlapArea(entries[i].rect, entries[j].rect) * WEIGHT_LABEL_OVERLAP;
    }
  }

  return penalty;
}

function assignmentCost(assignments, measurements, countryBounds) {
  let cost = 0;

  for (const measurement of measurements) {
    const assignment = assignments[measurement.id];
    if (!assignment) continue;
    cost += candidateCost(
      measurement,
      assignment.candidate,
      assignment.rect,
      countryBounds
    );
  }

  cost += labelOverlapPenalty(assignments);
  return cost;
}

function overlapsOtherLabels(rect, measurementId, assignments) {
  for (const [id, assignment] of Object.entries(assignments)) {
    if (id === measurementId) continue;
    if (overlapArea(rect, assignment.rect) > 0) return true;
  }
  return false;
}

function buildValidCandidates(measurement, bounds, assignments, countryBounds) {
  const skipId = measurement.id;
  const others = { ...assignments };
  delete others[skipId];

  const candidates = [];

  for (const candidate of buildPlacementCandidates(
    measurement.anchor,
    measurement.width,
    measurement.height
  )) {
    const rect = clampRect(
      toRect(candidate, measurement.width, measurement.height),
      bounds
    );
    if (!fitsInBounds(rect, bounds)) continue;
    if (distanceToAnchor(measurement.anchor, rect) > maxAnchorDistance(measurement.id, countryBounds, measurement.anchor)) {
      continue;
    }
    if (overlapsOtherLabels(rect, skipId, others)) continue;

    candidates.push({
      candidate,
      rect,
      cost: candidateCost(measurement, candidate, rect, countryBounds),
    });
  }

  return candidates;
}

function shouldShowLeader(anchor, rect, candidate, ownCountryId, countryBounds) {
  if (distanceToAnchor(anchor, rect) >= MIN_LEADER_DISTANCE) return true;
  if (!isCenterInOwnCountry(rect, ownCountryId, countryBounds, anchor)) return true;
  return candidate.offset && distanceToAnchor(anchor, rect) >= MIN_LEADER_DISTANCE * 0.75;
}

function buildAssignment(measurement, choice, countryBounds) {
  const showLeader = shouldShowLeader(
    measurement.anchor,
    choice.rect,
    choice.candidate,
    measurement.id,
    countryBounds
  );

  return {
    left: choice.rect.left,
    top: choice.rect.top,
    rect: choice.rect,
    anchor: measurement.anchor,
    candidate: choice.candidate,
    showLeader,
    leader: showLeader ? nearestPointOnRect(measurement.anchor, choice.rect) : null,
  };
}

function optimizeAssignments(measurements, bounds, countryBounds) {
  const assignments = {};

  for (const measurement of measurements) {
    const candidates = buildValidCandidates(measurement, bounds, assignments, countryBounds);
    const choice =
      candidates.sort((a, b) => a.cost - b.cost)[0] ??
      buildValidCandidates(measurement, bounds, {}, countryBounds)[0];

    if (choice) {
      assignments[measurement.id] = buildAssignment(measurement, choice, countryBounds);
    }
  }

  for (let round = 0; round < MAX_REFINEMENT_ROUNDS; round += 1) {
    let improved = false;

    for (const measurement of measurements) {
      const current = assignments[measurement.id];
      if (!current) continue;

      const candidates = buildValidCandidates(
        measurement,
        bounds,
        assignments,
        countryBounds
      );
      if (candidates.length === 0) continue;

      const currentGlobalCost = assignmentCost(assignments, measurements, countryBounds);
      let bestChoice = null;
      let bestGlobalCost = currentGlobalCost;

      for (const choice of candidates) {
        const trial = {
          ...assignments,
          [measurement.id]: buildAssignment(measurement, choice, countryBounds),
        };
        const globalCost = assignmentCost(trial, measurements, countryBounds);

        if (globalCost < bestGlobalCost) {
          bestGlobalCost = globalCost;
          bestChoice = choice;
        }
      }

      if (bestChoice && bestGlobalCost < currentGlobalCost) {
        assignments[measurement.id] = buildAssignment(measurement, bestChoice, countryBounds);
        improved = true;
      }
    }

    if (!improved) break;
  }

  return assignments;
}

function sortMeasurements(measurements) {
  return [...measurements].sort((a, b) => {
    const latA = a.lat ?? 0;
    const latB = b.lat ?? 0;
    if (latA !== latB) return latB - latA;

    const lngA = a.lng ?? 0;
    const lngB = b.lng ?? 0;
    if (lngA !== lngB) return lngA - lngB;

    return a.id.localeCompare(b.id);
  });
}

export function layoutDiscoverLabels(
  measurements,
  containerSize,
  countryBounds = [],
  layoutInsets = {}
) {
  const bounds = {
    left: MAP_EDGE_PADDING + (layoutInsets.left ?? 0),
    top: MAP_EDGE_PADDING + (layoutInsets.top ?? 0),
    right: containerSize.width - MAP_EDGE_PADDING - (layoutInsets.right ?? 0),
    bottom: containerSize.height - MAP_EDGE_PADDING - (layoutInsets.bottom ?? 0),
  };

  const sorted = sortMeasurements(measurements);
  const assignments = optimizeAssignments(sorted, bounds, countryBounds);

  const layouts = {};
  for (const measurement of sorted) {
    if (assignments[measurement.id]) {
      layouts[measurement.id] = assignments[measurement.id];
    }
  }

  return layouts;
}

export function layoutDiscoverLabelsFromElements({
  labelsById,
  positions,
  labelElements,
  containerRect,
  countriesById,
  projectCountryBounds,
  layoutInsets = {},
}) {
  const measurements = [];

  for (const [id, label] of Object.entries(labelsById)) {
    const anchor = positions[id];
    const element = labelElements[id];
    if (!anchor || !element) continue;

    const rect = element.getBoundingClientRect();
    const centroid = countriesById[id]?.centroid;
    measurements.push({
      id,
      label,
      anchor,
      width: rect.width,
      height: rect.height,
      lng: centroid?.[0],
      lat: centroid?.[1],
    });
  }

  if (measurements.length === 0) return {};

  const countryBounds = [];
  if (projectCountryBounds) {
    for (const country of Object.values(countriesById)) {
      const bounds = projectCountryBounds(country);
      if (bounds) countryBounds.push(bounds);
    }
  }

  return layoutDiscoverLabels(
    measurements,
    {
      width: containerRect.width,
      height: containerRect.height,
    },
    countryBounds,
    layoutInsets
  );
}

// Kept for tests / callers that checked the old hard-limit helper.
export function exceedsCountryOcclusionLimit(labelRect, ownCountryId, countryBounds, maxRatio) {
  for (const country of countryBounds) {
    if (country.countryId === ownCountryId) continue;
    if (getCountryOcclusionRatio(labelRect, country) > (maxRatio ?? MAX_SOFT_OCCLUSION)) {
      return true;
    }
  }
  return false;
}
