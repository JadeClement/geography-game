import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import {
  getCentroid,
  getCountryVisualCenter,
  getCountryVisibleScreenAnchor,
  getGeographicBoundsFromCountries,
  getLearnFocusMapView,
  getMainlandPolygons,
  RUS_EUROPE_MAX_LNG,
} from "../lib/geometry.js";
import { pointInPolygon } from "../lib/polylabel.js";

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
  assert.ok(maxLng < 50, `Finland+Russia should stay near the border, got maxLng=${maxLng}`);
  assert.ok(maxLng > 32, "should still include a meaningful slice of Russia east of Finland");
});

test("Latvia neighbor teach does not fit all of European Russia", () => {
  const byName = (name) =>
    geojson.features.find((feature) => feature.properties?.name === name);
  const rusFeature = byName("Russia");
  const lvaFeature = byName("Latvia");
  const estFeature = byName("Estonia");
  const ltuFeature = byName("Lithuania");
  const blrFeature = byName("Belarus");
  assert.ok(rusFeature && lvaFeature && estFeature && ltuFeature && blrFeature);

  const cluster = [
    { id: "LVA", feature: lvaFeature, area: 64559 },
    { id: "EST", feature: estFeature, area: 45227 },
    { id: "LTU", feature: ltuFeature, area: 65300 },
    { id: "BLR", feature: blrFeature, area: 207600 },
    { id: "RUS", feature: rusFeature, centroid: [37.6, 55.75], area: 17098242 },
  ];

  const tight = getGeographicBoundsFromCountries(cluster);
  assert.ok(tight);
  const [[minLng, minLat], [maxLng, maxLat]] = tight;
  assert.ok(maxLng < 50, `Latvia cluster must not reach the Urals, got maxLng=${maxLng}`);
  assert.ok(minLat > 45, `Caucasus must not pull the Baltic frame south, got minLat=${minLat}`);
  assert.ok(maxLng - minLng < 35, `lng span should stay regional, got ${maxLng - minLng}`);
  assert.ok(maxLat - minLat < 25, `lat span should stay regional, got ${maxLat - minLat}`);

  const view = getLearnFocusMapView(cluster, { regionId: "europe" });
  assert.ok(view?.bounds);
  const [[, south], [east, north]] = view.bounds;
  assert.ok(east < 60, `expanded camera must stay west of the Urals, got east=${east}`);
  assert.ok(south > 35, `expanded camera must not drop to North Africa, got south=${south}`);
  assert.ok(north < 85, `expanded camera must not go pole-to-pole, got north=${north}`);
});

function featureByIso3(iso3) {
  return geojson.features.find(
    (feature) => feature.properties?.["ISO3166-1-Alpha-3"] === iso3
  );
}

function pointInFeature(lng, lat, feature) {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  return polygons.some((polygon) => pointInPolygon(lng, lat, polygon));
}

const hrvFeature = featureByIso3("HRV");
const bihFeature = featureByIso3("BIH");

test("Croatia visual center sits inside Croatia, not Bosnia", () => {
  assert.ok(hrvFeature && bihFeature, "Croatia and Bosnia features present");

  const visual = getCountryVisualCenter(hrvFeature, "HRV");
  const outlineAverage = getCentroid(hrvFeature);

  assert.ok(visual, "Croatia should have a visual center");
  assert.ok(
    pointInFeature(visual[0], visual[1], hrvFeature),
    `visual center ${visual} must lie inside Croatia`
  );
  assert.equal(
    pointInFeature(visual[0], visual[1], bihFeature),
    false,
    `visual center ${visual} must not lie inside Bosnia`
  );

  const bosniaInterior = getCountryVisualCenter(bihFeature, "BIH");
  const visualDist = Math.hypot(
    visual[0] - bosniaInterior[0],
    visual[1] - bosniaInterior[1]
  );
  const outlineDist = Math.hypot(
    outlineAverage[0] - bosniaInterior[0],
    outlineAverage[1] - bosniaInterior[1]
  );
  assert.ok(
    visualDist > outlineDist,
    `visual center should sit farther from Bosnia than the outline average (visual ${visualDist.toFixed(3)} vs outline ${outlineDist.toFixed(3)})`
  );
});

test("Croatia neighbor-teach anchor uses the visual center, not the Bosnia border", () => {
  assert.ok(hrvFeature, "Croatia feature present");

  const projectLngLat = (lng, lat) => ({
    x: (lng - 13) * 40,
    y: (47.5 - lat) * 40,
  });
  // Balkans frame covering Bosnia and its neighbors (Croatia fully in view).
  const balkansViewport = { left: 0, top: 0, right: 360, bottom: 280 };
  const visual = getCountryVisualCenter(hrvFeature, "HRV");
  const expected = projectLngLat(visual[0], visual[1]);

  const anchor = getCountryVisibleScreenAnchor(
    { id: "HRV", feature: hrvFeature, visualCenter: visual },
    projectLngLat,
    balkansViewport
  );

  assert.ok(anchor, "Croatia should have an on-screen label anchor");
  assert.ok(
    Math.abs(anchor.x - expected.x) < 0.6 && Math.abs(anchor.y - expected.y) < 0.6,
    `expected visual-center projection ${JSON.stringify(expected)}, got ${JSON.stringify(anchor)}`
  );
});

test("Croatia Dalmatia zoom does not pin the label at off-screen Zagreb", () => {
  assert.ok(hrvFeature, "Croatia feature present");

  const projectLngLat = (lng, lat) => ({
    x: (lng - 14) * 80,
    y: (44.2 - lat) * 80,
  });
  // Southern Dalmatia only — Zagreb (~45.8N) is well above this frame.
  const dalmatiaViewport = { left: 0, top: 0, right: 400, bottom: 200 };
  const visual = getCountryVisualCenter(hrvFeature, "HRV");
  const zagreb = projectLngLat(visual[0], visual[1]);

  const anchor = getCountryVisibleScreenAnchor(
    { id: "HRV", feature: hrvFeature, visualCenter: visual },
    projectLngLat,
    dalmatiaViewport
  );

  assert.ok(anchor, "visible Dalmatian land should still get an anchor");
  assert.ok(
    zagreb.y < dalmatiaViewport.top || zagreb.y > dalmatiaViewport.bottom,
    "precondition: Zagreb visual center is off-screen"
  );
  assert.ok(
    anchor.x >= dalmatiaViewport.left &&
      anchor.x <= dalmatiaViewport.right &&
      anchor.y >= dalmatiaViewport.top &&
      anchor.y <= dalmatiaViewport.bottom,
    `clipped-view anchor must stay on-screen, got ${JSON.stringify(anchor)}`
  );
});
