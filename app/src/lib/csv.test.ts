import { describe, it, expect } from "vitest";
import {
  parseCsv,
  mapColumns,
  rowsToDrafts,
  describeMapping,
  buildTemplateCsv,
  buildItemsCsv,
  TEMPLATE_HEADERS,
  type FieldKey,
  type CsvExportItem,
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

  it("maps Venmo columns (link before handle) from Mayowa's real CSV", () => {
    expect(
      mapColumns([
        "Listing NO.",
        "Item",
        "Price",
        "Venmo",
        "Venmo Link",
        "Date Acquired",
        "Original Price",
        "Available for Pickup from",
        "Description",
      ]),
    ).toEqual([
      "ignore", // Listing NO. — correctly dropped
      "name",
      "price",
      "venmoHandle",
      "venmoLink",
      "boughtDate",
      "originalPrice",
      "availableFrom",
      "description",
    ]);
  });
});

describe("CSV template", () => {
  it("every template header auto-maps to a real field (no Ignore)", () => {
    const mapped = mapColumns(TEMPLATE_HEADERS);
    expect(mapped).not.toContain("ignore");
    expect(mapped).toEqual([
      "name", // Item
      "price",
      "condition",
      "boughtDate",
      "originalPrice",
      "availableFrom",
      "category",
      "venmoHandle",
      "venmoLink",
      "description",
    ]);
  });

  it("buildTemplateCsv round-trips: re-parsing it maps cleanly", () => {
    const parsed = parseCsv(buildTemplateCsv());
    expect(parsed.headers).toEqual(TEMPLATE_HEADERS);
    expect(mapColumns(parsed.headers)).not.toContain("ignore");
    // The example rows carry a real Venmo handle through to the draft.
    const drafts = rowsToDrafts(parsed, mapColumns(parsed.headers), "");
    expect(drafts[0].venmoHandle).toBe("@you");
    expect(drafts[0].name).toBe("Orange couch");
  });
});

describe("rowsToDrafts — Venmo", () => {
  it("carries the Venmo handle + link onto the draft (data not dropped)", () => {
    const parsed = {
      headers: ["Item", "Venmo", "Venmo Link"],
      rows: [["Couch", "@theMayowa", "venmo.com/theMayowa"]],
    };
    const mapping: FieldKey[] = ["name", "venmoHandle", "venmoLink"];
    const [d] = rowsToDrafts(parsed, mapping, "");
    expect(d.venmoHandle).toBe("@theMayowa");
    expect(d.venmoLink).toBe("venmo.com/theMayowa");
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

describe("buildItemsCsv", () => {
  it("emits the template headers so a downloaded file re-imports cleanly", () => {
    const csv = buildItemsCsv([]);
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(TEMPLATE_HEADERS);
    expect(parsed.rows).toEqual([]);
  });

  it("round-trips items back through the importer (values recovered)", () => {
    const items: CsvExportItem[] = [
      {
        name: "Orange couch",
        priceText: "100",
        condition: "good",
        boughtDate: "2026-04-01",
        originalPriceText: "260",
        availableFrom: "2026-08-02",
        category: "Furniture",
        venmoHandle: "theMayowa", // stored without the @
        venmoLink: "https://venmo.com/u/theMayowa",
        description: "Comfy 3-seater, light wear", // has a comma -> exercises quoting
      },
      {
        name: "Dining table",
        priceText: "Free",
        condition: null,
        boughtDate: null,
        originalPriceText: "",
        availableFrom: "2026-08-22",
        category: null,
        venmoHandle: "",
        venmoLink: "",
        description: "",
      },
    ];

    const parsed = parseCsv(buildItemsCsv(items));
    const mapping = mapColumns(parsed.headers);
    expect(mapping).not.toContain("ignore");
    const drafts = rowsToDrafts(parsed, mapping, "2026-01-01");

    expect(drafts[0]).toMatchObject({
      name: "Orange couch",
      priceText: "100",
      condition: "good",
      boughtDate: "2026-04-01",
      originalPriceText: "260",
      availableFrom: "2026-08-02",
      category: "Furniture",
      venmoHandle: "@theMayowa", // importer keeps the @ (normalized at persist)
      venmoLink: "https://venmo.com/u/theMayowa",
      description: "Comfy 3-seater, light wear",
    });

    // Free / empty item: "Free" price survives, blanks stay blank.
    expect(drafts[1]).toMatchObject({
      name: "Dining table",
      priceText: "Free",
      condition: null,
      venmoHandle: "",
      venmoLink: "",
    });
  });
});

describe("describeMapping", () => {
  it("summarizes mapped columns, skipping ignored ones", () => {
    expect(
      describeMapping(["Item", "junk", "Price"], ["name", "ignore", "price"]),
    ).toBe("Item → Name · Price → Price");
  });
});
