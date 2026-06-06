import { describe, it, expect } from "vitest";
import {
  parseCsv,
  mapColumns,
  rowsToDrafts,
  describeMapping,
  type FieldKey,
} from "./csv";

describe("parseCsv", () => {
  it("parses headers + rows, trimming headers", () => {
    const { headers, rows } = parseCsv("name, price\nChair,40\nLamp,15");
    expect(headers).toEqual(["name", "price"]);
    expect(rows).toEqual([
      ["Chair", "40"],
      ["Lamp", "15"],
    ]);
  });

  it("handles quoted fields, escaped quotes, and commas inside quotes", () => {
    const { rows } = parseCsv('name,note\n"Sofa, blue","Says ""hi"""');
    expect(rows).toEqual([["Sofa, blue", 'Says "hi"']]);
  });

  it("handles CRLF line endings", () => {
    const { headers, rows } = parseCsv("a,b\r\n1,2\r\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([["1", "2"]]);
  });

  it("pads short rows and truncates long rows to header width", () => {
    const { rows } = parseCsv("a,b,c\n1\n1,2,3,4");
    expect(rows).toEqual([
      ["1", "", ""],
      ["1", "2", "3"],
    ]);
  });

  it("returns empty for all-blank input", () => {
    expect(parseCsv("\n,\n")).toEqual({ headers: [], rows: [] });
  });
});

describe("mapColumns", () => {
  it("guesses fields and claims scalar fields at most once", () => {
    const m = mapColumns(["Item", "Asking price", "Price"]);
    expect(m[0]).toBe("name");
    expect(m[1]).toBe("price");
    expect(m[2]).toBe("ignore"); // price already claimed
  });

  it("checks originalPrice before the looser price alias", () => {
    expect(mapColumns(["Original price", "Price"])).toEqual([
      "originalPrice",
      "price",
    ]);
  });

  it("lets merge fields (name, description) claim multiple columns", () => {
    expect(mapColumns(["Company", "Model", "Remarks", "Notes"])).toEqual([
      "name",
      "name",
      "description",
      "description",
    ]);
  });

  it("maps unknown headers to ignore", () => {
    expect(mapColumns(["whatsit"])).toEqual(["ignore"]);
  });
});

describe("rowsToDrafts", () => {
  it("merges name/description columns and parses scalars", () => {
    const parsed = {
      headers: ["Company", "Model", "Price", "Condition", "Bought"],
      rows: [["IKEA", "Poäng", "$40", "good", "May 2020"]],
    };
    const mapping: FieldKey[] = [
      "name",
      "name",
      "price",
      "condition",
      "boughtDate",
    ];
    const [d] = rowsToDrafts(parsed, mapping, "2026-06-01");
    expect(d.name).toBe("IKEA Poäng");
    expect(d.priceText).toBe("$40");
    expect(d.condition).toBe("good");
    expect(d.boughtDate).toBe("2020-05-01");
    expect(d.state).toBe("draft");
  });

  it("joins multiple description columns with ' | '", () => {
    const parsed = {
      headers: ["Item", "Model", "Remarks"],
      rows: [["Humidifier", "Vornado EV100, White", "New filter"]],
    };
    const mapping: FieldKey[] = ["name", "description", "description"];
    const [d] = rowsToDrafts(parsed, mapping, "2026-06-01");
    expect(d.description).toBe("Vornado EV100, White | New filter");
  });

  it("skips blank columns when joining a description", () => {
    const parsed = {
      headers: ["Item", "Model", "Remarks"],
      rows: [["Lamp", "West Elm", ""]],
    };
    const mapping: FieldKey[] = ["name", "description", "description"];
    const [d] = rowsToDrafts(parsed, mapping, "2026-06-01");
    expect(d.description).toBe("West Elm"); // no trailing " | "
  });

  it("falls back to defaultAvailableFrom when no date column", () => {
    const parsed = { headers: ["Item"], rows: [["Lamp"]] };
    const [d] = rowsToDrafts(parsed, ["name"], "2026-06-01");
    expect(d.availableFrom).toBe("2026-06-01");
  });

  it("leaves originalBoxIncluded null when the cell is blank", () => {
    const parsed = { headers: ["Item", "Box"], rows: [["Lamp", ""]] };
    const [d] = rowsToDrafts(parsed, ["name", "originalBox"], "2026-06-01");
    expect(d.originalBoxIncluded).toBeNull();
  });
});

describe("describeMapping", () => {
  it("summarizes mapped columns, skipping ignored ones", () => {
    expect(
      describeMapping(["Item", "junk", "Price"], ["name", "ignore", "price"]),
    ).toBe("Item → Name · Price → Listing price");
  });
});
