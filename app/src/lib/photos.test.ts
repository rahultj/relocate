import { describe, it, expect } from "vitest";
import { photoColumns, photoList, MAX_PHOTOS } from "./photos";

describe("photoColumns", () => {
  it("syncs the cover to the first url", () => {
    expect(photoColumns(["a", "b", "c"])).toEqual({
      photoUrls: ["a", "b", "c"],
      photoUrl: "a",
    });
  });
  it("trims, drops blanks, and null-covers an empty set", () => {
    expect(photoColumns([" a ", "", "  "])).toEqual({
      photoUrls: ["a"],
      photoUrl: "a",
    });
    expect(photoColumns([])).toEqual({ photoUrls: [], photoUrl: null });
  });
  it("caps at MAX_PHOTOS", () => {
    const many = Array.from({ length: MAX_PHOTOS + 3 }, (_, i) => `p${i}`);
    expect(photoColumns(many).photoUrls).toHaveLength(MAX_PHOTOS);
  });
});

describe("photoList", () => {
  it("prefers the array, falls back to the legacy single photoUrl", () => {
    expect(photoList({ photoUrls: ["a", "b"] })).toEqual(["a", "b"]);
    expect(photoList({ photoUrls: [], photoUrl: "legacy" })).toEqual(["legacy"]);
    expect(photoList({ photoUrls: null, photoUrl: null })).toEqual([]);
  });
});
