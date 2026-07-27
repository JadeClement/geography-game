import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { getCountryVisibleScreenAnchor } from "../lib/geometry.js";

const geojson = JSON.parse(readFileSync("public/data/countries.geojson", "utf8"));
const rusFeature = geojson.features.find(
  (feature) => feature.properties?.["ISO3166-1-Alpha-3"] === "RUS"
);

const mockCountry = {
  id: "RUS",
  centroid: [86.4, 63.7],
  feature: rusFeature,
};

test("visible anchor averages geometry inside the viewport", () => {
  const projectLngLat = (lng, lat) => ({
    x: lng * 2,
    y: (90 - lat) * 2,
  });

  const europeViewport = {
    left: 20,
    top: 20,
    right: 180,
    bottom: 160,
  };

  const anchor = getCountryVisibleScreenAnchor(
    mockCountry,
    projectLngLat,
    europeViewport
  );

  assert.ok(anchor);
  assert.ok(anchor.x < 140, "Russia anchor should sit in the visible west, not Siberia");
  assert.ok(anchor.y > 40 && anchor.y < 140);
});

test("visible anchor falls back to clipped bounds when no vertices are visible", () => {
  const projectLngLat = () => ({ x: 500, y: 500 });

  const anchor = getCountryVisibleScreenAnchor(mockCountry, projectLngLat, {
    left: 0,
    top: 0,
    right: 600,
    bottom: 400,
  });

  assert.deepEqual(anchor, { x: 500, y: 500 });
});
