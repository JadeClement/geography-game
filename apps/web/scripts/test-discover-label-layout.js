/**
 * Collision layout for map titles — especially Learn neighbor-reveal stacks
 * (Latvia's name must never sit under Belarus).
 *
 * Run: node --test scripts/test-discover-label-layout.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  layoutDiscoverLabels,
  rectsOverlap,
} from "../lib/discoverLabelLayout.js";

const SEPARATION = 8;

function assertNoOverlaps(layouts, gap = SEPARATION) {
  const entries = Object.entries(layouts);
  assert.ok(entries.length > 0, "expected laid-out titles");
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [idA, a] = entries[i];
      const [idB, b] = entries[j];
      assert.equal(
        rectsOverlap(a.rect, b.rect, gap),
        false,
        `${idA} overlaps ${idB}: ${JSON.stringify(a.rect)} vs ${JSON.stringify(b.rect)}`
      );
    }
  }
}

test("zoomed-out Baltic neighbor titles never cover each other", () => {
  // Screen-space sketch of the Europe neighbor-reveal that stacked
  // "Belarus" on top of "Latvia" (mobile width, zoomed out enough that
  // Latvia is only ~40px tall).
  const measurements = [
    {
      id: "EST",
      anchor: { x: 188, y: 92 },
      width: 56,
      height: 16,
      lat: 58.6,
      lng: 25.0,
      allowFarOffset: true,
    },
    {
      id: "LVA",
      anchor: { x: 190, y: 112 },
      width: 50,
      height: 18,
      lat: 56.9,
      lng: 24.1,
      priority: 1,
      allowFarOffset: true,
    },
    {
      id: "LTU",
      anchor: { x: 186, y: 132 },
      width: 70,
      height: 16,
      lat: 55.2,
      lng: 23.9,
      allowFarOffset: true,
    },
    {
      id: "BLR",
      anchor: { x: 228, y: 148 },
      width: 62,
      height: 16,
      lat: 53.7,
      lng: 27.5,
      allowFarOffset: true,
    },
    {
      id: "RUS",
      anchor: { x: 310, y: 120 },
      width: 50,
      height: 16,
      lat: 56.0,
      lng: 38.0,
      allowFarOffset: true,
    },
  ];

  const countryBounds = [
    { countryId: "EST", left: 170, top: 78, right: 210, bottom: 104 },
    { countryId: "LVA", left: 168, top: 100, right: 214, bottom: 124 },
    { countryId: "LTU", left: 166, top: 120, right: 212, bottom: 148 },
    { countryId: "BLR", left: 200, top: 128, right: 280, bottom: 200 },
    { countryId: "RUS", left: 250, top: 40, right: 380, bottom: 240 },
  ];

  const layouts = layoutDiscoverLabels(
    measurements,
    { width: 390, height: 720 },
    countryBounds,
    { top: 72 }
  );

  assert.ok(layouts.LVA, "Latvia must keep a title");
  assert.ok(layouts.BLR, "Belarus must keep a title");
  assertNoOverlaps(layouts);
});

test("default attached placements that would stack are pushed apart", () => {
  const measurements = [
    {
      id: "LVA",
      anchor: { x: 120, y: 80 },
      width: 80,
      height: 20,
      lat: 57,
      lng: 24,
      priority: 1,
      allowFarOffset: true,
    },
    {
      id: "BLR",
      anchor: { x: 130, y: 92 },
      width: 80,
      height: 20,
      lat: 53,
      lng: 28,
      allowFarOffset: true,
    },
  ];

  const layouts = layoutDiscoverLabels(measurements, { width: 360, height: 500 });
  assertNoOverlaps(layouts, 0);
});
