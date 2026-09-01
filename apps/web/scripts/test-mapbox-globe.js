import test from "node:test";
import assert from "node:assert/strict";
import {
  isLngLatBehindGlobe,
  MAPBOX_DEFAULT_HORIZON_SHIFT,
  setGlobeHorizonShift,
} from "../lib/mapboxGlobe.js";

function mockGlobeMap(centerLng, centerLat) {
  return {
    _showingGlobe: () => true,
    getProjection: () => ({ name: "globe" }),
    getCenter: () => ({ lng: centerLng, lat: centerLat }),
  };
}

test("far-side points are occluded on the globe", () => {
  const map = mockGlobeMap(20, 10); // Africa / Middle East
  assert.equal(isLngLatBehindGlobe(map, -100, 60), true); // Canada
  assert.equal(isLngLatBehindGlobe(map, 20, 10), false); // near center
  assert.equal(isLngLatBehindGlobe(map, 10, 0), false); // nearby
});

test("occlusion is skipped for non-globe projections", () => {
  const map = {
    _showingGlobe: () => false,
    getProjection: () => ({ name: "naturalEarth" }),
    getCenter: () => ({ lng: 20, lat: 10 }),
  };
  assert.equal(isLngLatBehindGlobe(map, -100, 60), false);
});

test("globe horizon shift is cleared so space does not overlay the sphere", () => {
  let repaints = 0;
  const map = {
    transform: { _horizonShift: MAPBOX_DEFAULT_HORIZON_SHIFT },
    triggerRepaint() {
      repaints += 1;
    },
  };
  assert.equal(setGlobeHorizonShift(map, true), true);
  assert.equal(map.transform._horizonShift, 0);
  assert.equal(repaints, 1);
  assert.equal(setGlobeHorizonShift(map, false), true);
  assert.equal(map.transform._horizonShift, MAPBOX_DEFAULT_HORIZON_SHIFT);
});

test("horizon shift is a no-op without a Mapbox transform", () => {
  assert.equal(setGlobeHorizonShift({}, true), false);
  assert.equal(setGlobeHorizonShift(null, true), false);
});
