import test from "node:test";
import assert from "node:assert/strict";
import {
  hasValidNearbyPlacement,
  isDiscoverLabelVisible,
  labelFitsInsideCountry,
  shouldHideDiscoverLabel,
} from "../lib/discoverLabelVisibility.js";

const bounds = (left, top, right, bottom, countryId = "TST") => ({
  countryId,
  left,
  top,
  right,
  bottom,
});

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

test("labelFitsInsideCountry returns true when label fits with padding", () => {
  assert.equal(labelFitsInsideCountry(40, 16, bounds(0, 0, 100, 80)), true);
});

test("labelFitsInsideCountry returns false when label is wider than country", () => {
  assert.equal(labelFitsInsideCountry(120, 16, bounds(0, 0, 100, 80)), false);
});

test("large countries hide once the label no longer fits inside", () => {
  assert.equal(
    shouldHideDiscoverLabel({
      labelWidth: 80,
      labelHeight: 16,
      countryBounds: bounds(0, 0, 70, 50),
      anchor: { x: 35, y: 25 },
      isSmallCountry: false,
    }),
    true
  );
});

test("large countries stay visible while the label still fits inside", () => {
  assert.equal(
    shouldHideDiscoverLabel({
      labelWidth: 40,
      labelHeight: 16,
      countryBounds: bounds(0, 0, 200, 120),
      anchor: { x: 100, y: 60 },
      isSmallCountry: false,
    }),
    false
  );
});

test("narrow countries show nearby labels that avoid overlap and occlusion", () => {
  const togoBounds = bounds(100, 100, 112, 180, "TGO");
  const nearbyRect = rect(80, 120, 150, 138);

  assert.equal(
    hasValidNearbyPlacement({
      layoutRect: nearbyRect,
      labelWidth: 70,
      labelHeight: 18,
      countryBounds: togoBounds,
      anchor: { x: 106, y: 140 },
      isSmallCountry: false,
      countryId: "TGO",
      otherLabelRects: {
        BEN: rect(200, 120, 280, 138),
      },
      allCountryBounds: [togoBounds, bounds(200, 100, 212, 180, "BEN")],
    }),
    true
  );

  assert.equal(
    shouldHideDiscoverLabel({
      labelWidth: 70,
      labelHeight: 18,
      countryBounds: togoBounds,
      anchor: { x: 106, y: 140 },
      isSmallCountry: false,
      layoutRect: nearbyRect,
      countryId: "TGO",
      otherLabelRects: {},
      allCountryBounds: [togoBounds],
    }),
    false
  );
});

test("nearby labels stay hidden when they overlap another title", () => {
  const nearbyRect = rect(80, 120, 150, 138);

  assert.equal(
    hasValidNearbyPlacement({
      layoutRect: nearbyRect,
      labelWidth: 70,
      labelHeight: 18,
      countryBounds: bounds(100, 100, 112, 180, "TGO"),
      anchor: { x: 106, y: 140 },
      isSmallCountry: false,
      countryId: "TGO",
      otherLabelRects: {
        BEN: rect(90, 118, 160, 136),
      },
      allCountryBounds: [],
    }),
    false
  );
});

test("small countries keep wiggle room until the span is tiny", () => {
  assert.equal(
    shouldHideDiscoverLabel({
      labelWidth: 80,
      labelHeight: 16,
      countryBounds: bounds(0, 0, 50, 40),
      anchor: { x: 25, y: 20 },
      isSmallCountry: true,
    }),
    false
  );

  assert.equal(
    shouldHideDiscoverLabel({
      labelWidth: 80,
      labelHeight: 16,
      countryBounds: bounds(0, 0, 20, 16),
      anchor: { x: 10, y: 8 },
      isSmallCountry: true,
    }),
    true
  );
});

test("hover reveals hidden labels", () => {
  assert.equal(
    isDiscoverLabelVisible({
      labelWidth: 80,
      labelHeight: 16,
      countryBounds: bounds(0, 0, 70, 50),
      anchor: { x: 35, y: 25 },
      isSmallCountry: false,
      countryId: "RUS",
      hoveredCountryId: "RUS",
      isAnimating: false,
    }),
    true
  );
});

test("animating labels stay visible", () => {
  assert.equal(
    isDiscoverLabelVisible({
      labelWidth: 80,
      labelHeight: 16,
      countryBounds: bounds(0, 0, 20, 16),
      anchor: { x: 10, y: 8 },
      isSmallCountry: true,
      countryId: "LUX",
      hoveredCountryId: null,
      isAnimating: true,
    }),
    true
  );
});
