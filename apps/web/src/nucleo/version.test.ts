import { describe, expect, it } from "vitest";
import { partesDeVersion } from "./version.ts";

describe("partesDeVersion", () => {
  it("separa X.Y.Z", () => {
    expect(partesDeVersion("0.2.0")).toEqual([0, 2, 0]);
  });
  it("rechaza lo que no es X.Y.Z", () => {
    expect(partesDeVersion("0.2")).toBeNull();
    expect(partesDeVersion("v0.2.0")).toBeNull();
  });
});
