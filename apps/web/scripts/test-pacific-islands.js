import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import {
  expandProjectedRing,
  geometryToPathData,
  MIN_PACIFIC_ISLAND_PATH_SPAN,
  PACIFIC_GAME_VIEW,
} from "../lib/globeProjection.js";

const PATH_TOLERANCE = 0.35;
const geojson = JSON.parse(readFileSync("public/data/countries.geojson", "utf8"));

function featureByIso3(iso3) {
  return geojson.features.find(
    (feature) => feature.properties?.["ISO3166-1-Alpha-3"] === iso3
  );
}

function pathSubpathCount(path) {
  return (path.match(/M/g) || []).length;
}

function pathSpan(path) {
  const nums = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
  const xs = [];
  const ys = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  if (xs.length === 0) return 0;
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

test("expandProjectedRing scales tiny rings up to the minimum span", () => {
  const expanded = expandProjectedRing(
    [
      [10, 10],
      [10.4, 10],
      [10.4, 10.2],
      [10, 10.2],
    ],
    2.5
  );
  const xs = expanded.map((point) => point[0]);
  const ys = expanded.map((point) => point[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  assert.ok(Math.abs(span - 2.5) < 1e-9, `expected span 2.5, got ${span}`);
});

test("expandProjectedRing leaves large rings unchanged", () => {
  const ring = [
    [0, 0],
    [8, 0],
    [8, 6],
    [0, 6],
  ];
  assert.equal(expandProjectedRing(ring, 2.5), ring);
});

test("Nauru still produces a Pacific path at the game simplify tolerance", () => {
  const feature = featureByIso3("NRU");
  const path = geometryToPathData(feature.geometry, PATH_TOLERANCE, PACIFIC_GAME_VIEW);
  assert.ok(path, "Nauru must not be simplified away");
  assert.ok(pathSubpathCount(path) >= 1);
});

test("tiny Pacific countries expand to a visible island inside the click ring", () => {
  const feature = featureByIso3("NRU");
  const path = geometryToPathData(feature.geometry, PATH_TOLERANCE, PACIFIC_GAME_VIEW, {
    minIslandSpan: MIN_PACIFIC_ISLAND_PATH_SPAN,
  });
  assert.ok(pathSpan(path) >= MIN_PACIFIC_ISLAND_PATH_SPAN - 0.05);
});

test("FSM keeps its scattered atolls instead of collapsing to a few rings", () => {
  const feature = featureByIso3("FSM");
  const path = geometryToPathData(feature.geometry, PATH_TOLERANCE, PACIFIC_GAME_VIEW, {
    minIslandSpan: MIN_PACIFIC_ISLAND_PATH_SPAN,
  });
  assert.ok(pathSubpathCount(path) >= 15, `expected most of 20 FSM rings, got ${pathSubpathCount(path)}`);
});
