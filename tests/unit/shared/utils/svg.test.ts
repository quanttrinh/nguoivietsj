import { expect, test } from "vitest";

import { svgDataUri } from "../../../../src/shared/utils/svg";

test("encodes SVG markup as a data URI", () => {
  const uri = svgDataUri('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>');

  expect(uri).toMatch(/^data:image\/svg\+xml,/u);
  expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toContain("<svg");
});
