import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import {
  getCountryVisibleScreenAnchor,
  getGeographicBoundsFromCountries,
  getMainlandPolygons,
  RUS_EUROPE_MAX_LNG,
} from "../lib/geometry.js";

const geojson = JSON.parse(readFileSync("public/data/countries.geojson", "utf8"));
const rusFeature = geojson.features.find(
  (feature) => feature.properties?.["ISO3166-1-Alpha-3"] === "RUS"
);
const fraFeature = geojson.features.find(
  (feature) => feature.properties?.name === "France"
);
const espFeature = geojson.features.find(
  (feature) => feature.properties?.["ISO3166-1-Alpha-3"] === "ESP"
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

test("visible anchor is null when no country geometry is on-screen", () => {
  const projectLngLat = () => ({ x: 500, y: 500 });

  const anchor = getCountryVisibleScreenAnchor(mockCountry, projectLngLat, {
    left: 0,
    top: 0,
    right: 200,
    bottom: 200,
  });

  assert.equal(anchor, null);
});

test("France mainland polygons exclude French Guiana", () => {
  assert.ok(fraFeature, "France feature present in countries.geojson");
  const mainland = getMainlandPolygons(fraFeature.geometry, "FRA");
  assert.equal(mainland.length, 1, "only metropolitan France should remain");

  let minLng = Infinity;
  for (const polygon of mainland) {
    for (const ring of polygon) {
      for (const [lng] of ring) {
        minLng = Math.min(minLng, lng);
      }
    }
  }
  assert.ok(minLng > -20, "Guiana (~53°W) must not remain in mainland polygons");
});

test("France visible anchor stays over Europe when Guiana is also on-screen", () => {
  assert.ok(fraFeature && espFeature);

  // Equirectangular project of a wide frame that includes Europe + NE South America.
  const projectLngLat = (lng, lat) => ({
    x: (lng + 80) * (800 / 120),
    y: (70 - lat) * (500 / 70),
  });
  const viewport = { left: 0, top: 0, right: 800, bottom: 500 };

  const fraAnchor = getCountryVisibleScreenAnchor(
    {
      id: "FRA",
      centroid: [2.3522, 48.8566],
      feature: fraFeature,
    },
    projectLngLat,
    viewport
  );
  const espAnchor = getCountryVisibleScreenAnchor(
    {
      id: "ESP",
      centroid: [-3.7038, 40.4168],
      feature: espFeature,
    },
    projectLngLat,
    viewport
  );

  assert.ok(fraAnchor, "France should have an on-screen mainland anchor");
  assert.ok(espAnchor, "Spain should have an on-screen mainland anchor");
  assert.ok(
    fraAnchor.y < espAnchor.y,
    "France label must sit north of Spain, not be pulled over Iberia by Guiana"
  );
  // Paris projects near y≈151; Guiana-skewed anchors land near y≈207.
  assert.ok(fraAnchor.y < 180, "France anchor should stay near metropolitan Europe");
});

test("neighbor focus bounds ignore French overseas territories", () => {
  assert.ok(fraFeature, "France feature present in countries.geojson");
  const luxFeature = geojson.features.find(
    (feature) => feature.properties?.name === "Luxembourg"
  );
  const belFeature = geojson.features.find(
    (feature) => feature.properties?.name === "Belgium"
  );
  const deuFeature = geojson.features.find(
    (feature) => feature.properties?.name === "Germany"
  );
  assert.ok(luxFeature && belFeature && deuFeature);

  const bounds = getGeographicBoundsFromCountries([
    { id: "LUX", feature: luxFeature },
    { id: "BEL", feature: belFeature },
    { id: "FRA", feature: fraFeature, centroid: [2.3522, 48.8566] },
    { id: "DEU", feature: deuFeature },
  ]);

  assert.ok(bounds);
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  assert.ok(minLng > -20, "French Guiana must not pull western bound");
  assert.ok(minLat > 30, "Réunion must not pull southern bound");
  assert.ok(maxLng - minLng < 40, "cluster should stay continental Europe scale");
  assert.ok(maxLat - minLat < 25, "cluster should stay continental Europe scale");
});

test("Russia focus bounds stop near the Urals for European neighbors", () => {
  const rusFeature = geojson.features.find(
    (feature) => feature.properties?.name === "Russia"
  );
  const finFeature = geojson.features.find(
    (feature) => feature.properties?.name === "Finland"
  );
  assert.ok(rusFeature && finFeature);

  const rusAlone = getGeographicBoundsFromCountries([
    { id: "RUS", feature: rusFeature, centroid: [37.6, 55.75] },
  ]);
  assert.ok(rusAlone);
  assert.ok(
    rusAlone[1][0] <= RUS_EUROPE_MAX_LNG + 0.01,
    `alone Russia east bound should be at Urals, got ${rusAlone[1][0]}`
  );

  const withFinland = getGeographicBoundsFromCountries([
    { id: "FIN", feature: finFeature },
    { id: "RUS", feature: rusFeature, centroid: [37.6, 55.75] },
  ]);
  assert.ok(withFinland);
  const [[, ], [maxLng]] = withFinland;
  assert.ok(maxLng < 80, `Finland+Russia should not reach Siberia, got maxLng=${maxLng}`);
  assert.ok(maxLng > 40, "should still include a meaningful slice of Russia east of Finland");
});
