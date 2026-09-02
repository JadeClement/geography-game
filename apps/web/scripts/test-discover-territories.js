/**
 * Territory matching and out-of-region click copy.
 *
 * Run: node --import ./scripts/register-alias.mjs --test scripts/test-discover-territories.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getOutOfRegionClickFeedback,
  matchDiscoverTerritoryNote,
} from "../lib/discoverTerritories.js";

const COUNTRIES = new Map([
  ["GUY", { id: "GUY", name: "Guyana", region: "southAmerica" }],
  ["FRA", { id: "FRA", name: "France", region: "europe" }],
  ["VEN", { id: "VEN", name: "Venezuela", region: "southAmerica" }],
]);

test("Guadeloupe click on France names the overseas department", () => {
  const note = matchDiscoverTerritoryNote({
    countryId: "FRA",
    lngLat: { lng: -61.55, lat: 16.25 },
    regionId: "northAmerica",
  });
  assert.equal(note?.id, "GLP");

  const feedback = getOutOfRegionClickFeedback({
    feature: { properties: { id: "FRA", name: "France" } },
    lngLat: { lng: -61.55, lat: 16.25 },
    regionId: "northAmerica",
    allCountriesById: COUNTRIES,
  });
  assert.equal(feedback.text, "This is Guadeloupe");
  assert.equal(
    feedback.detail,
    "This is not a country — it is the Guadeloupe territory."
  );
});

test("Martinique click on France names the overseas department", () => {
  const note = matchDiscoverTerritoryNote({
    countryId: "FRA",
    lngLat: { lng: -61.0, lat: 14.6 },
    regionId: "northAmerica",
  });
  assert.equal(note?.id, "MTQ");

  const feedback = getOutOfRegionClickFeedback({
    feature: { properties: { id: "FRA", name: "France" } },
    lngLat: { lng: -61.0, lat: 14.6 },
    regionId: "northAmerica",
    allCountriesById: COUNTRIES,
  });
  assert.equal(feedback.text, "This is Martinique");
  assert.equal(
    feedback.detail,
    "This is not a country — it is the Martinique territory."
  );
});

test("French Guiana still matches on South America and North America maps", () => {
  const point = { lng: -53.2, lat: 4.0 };
  assert.equal(
    matchDiscoverTerritoryNote({
      countryId: "FRA",
      lngLat: point,
      regionId: "southAmerica",
    })?.id,
    "GUF"
  );
  assert.equal(
    matchDiscoverTerritoryNote({
      countryId: "FRA",
      lngLat: point,
      regionId: "northAmerica",
    })?.id,
    "GUF"
  );
  assert.equal(
    matchDiscoverTerritoryNote({
      countryId: "FRA",
      lngLat: point,
      regionId: "world",
    })?.id,
    "GUF"
  );
});

test("metropolitan France is not treated as a Caribbean territory", () => {
  const note = matchDiscoverTerritoryNote({
    countryId: "FRA",
    lngLat: { lng: 2.35, lat: 48.86 },
    regionId: "northAmerica",
  });
  assert.equal(note, null);

  const feedback = getOutOfRegionClickFeedback({
    feature: { properties: { id: "FRA", name: "France" } },
    lngLat: { lng: 2.35, lat: 48.86 },
    regionId: "northAmerica",
    allCountriesById: COUNTRIES,
  });
  assert.equal(feedback.text, "This is France");
  assert.equal(feedback.detail, "It's a country in Europe.");
});

test("Aruba and Curaçao are named as territories", () => {
  const aruba = getOutOfRegionClickFeedback({
    feature: { properties: { id: "ABW", name: "Aruba" } },
    regionId: "northAmerica",
  });
  assert.equal(aruba.text, "This is Aruba");
  assert.equal(
    aruba.detail,
    "This is not a country — it is the Aruba territory."
  );

  const curacao = getOutOfRegionClickFeedback({
    feature: { properties: { id: "CUW", name: "Curaçao" } },
    regionId: "northAmerica",
  });
  assert.equal(curacao.text, "This is Curaçao");
  assert.equal(
    curacao.detail,
    "This is not a country — it is the Curaçao territory."
  );
});

test("Guyana is named as a South American country", () => {
  const feedback = getOutOfRegionClickFeedback({
    feature: { properties: { id: "GUY", name: "Guyana" } },
    regionId: "northAmerica",
    allCountriesById: COUNTRIES,
  });
  assert.equal(feedback.text, "This is Guyana");
  assert.equal(feedback.detail, "It's a country in South America.");
});

test("Bonaire click on the Netherlands names the special municipality", () => {
  const feedback = getOutOfRegionClickFeedback({
    feature: { properties: { id: "NLD", name: "Netherlands" } },
    lngLat: { lng: -68.28, lat: 12.18 },
    regionId: "northAmerica",
  });
  assert.equal(feedback.text, "This is Bonaire");
  assert.equal(
    feedback.detail,
    "This is not a country — it is the Bonaire territory."
  );
});

test("British and U.S. Virgin Islands are named as territories", () => {
  const bvi = matchDiscoverTerritoryNote({ countryId: "VGB" });
  assert.equal(bvi?.title, "British Virgin Islands");
  assert.equal(
    bvi?.message,
    "This is not a country — it is the British Virgin Islands territory."
  );

  const usvi = getOutOfRegionClickFeedback({
    feature: { properties: { id: "VIR", name: "United States Virgin Islands" } },
    regionId: "northAmerica",
  });
  assert.equal(usvi.text, "This is United States Virgin Islands");
  assert.equal(
    usvi.detail,
    "This is not a country — it is the United States Virgin Islands territory."
  );
});

test("names that already include territory are not doubled", () => {
  const note = matchDiscoverTerritoryNote({ countryId: "IOT" });
  assert.equal(
    note?.message,
    "This is not a country — it is the British Indian Ocean Territory."
  );
});
