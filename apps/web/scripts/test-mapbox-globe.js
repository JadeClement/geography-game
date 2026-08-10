import test from "node:test";
import assert from "node:assert/strict";
import { isLngLatBehindGlobe } from "../lib/mapboxGlobe.js";

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
