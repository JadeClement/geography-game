import test from "node:test";
import assert from "node:assert/strict";
import { pointInPolygon, polylabel } from "../lib/polylabel.js";

/** C-shape opening to the right — vertex average falls in the gap. */
const C_SHAPE = [
  [
    [0, 0],
    [10, 0],
    [10, 2],
    [3, 2],
    [3, 8],
    [10, 8],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
];

test("polylabel sits in the C stem, not in the gap", () => {
  const [x, y] = polylabel(C_SHAPE, 0.05);
  assert.ok(pointInPolygon(x, y, C_SHAPE), "visual center must be inside the C");
  assert.ok(x < 3, `expected stem (x<3), got ${x}, ${y}`);
  assert.equal(
    x > 3 && y > 2 && y < 8,
    false,
    `must not land in the open gap, got ${x}, ${y}`
  );
});

test("polylabel of a square is near the center", () => {
  const square = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ];
  const [x, y] = polylabel(square, 0.05);
  assert.ok(Math.abs(x - 5) < 0.2, `x=${x}`);
  assert.ok(Math.abs(y - 5) < 0.2, `y=${y}`);
});
