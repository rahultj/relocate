// CSV-first bulk-add (section 07). Pure, dependency-free so it can be unit-
// tested and run on either side. Two jobs:
//   1. parseCsv     — text -> rows of cells (handles quotes + escaped quotes)
//   2. mapColumns   — best-effort, transparent header -> field guesses
//   3. rowsToDrafts — apply a mapping to build editable item drafts
//
// "Best-effort, transparent" is the contract: we guess, show the guess, and
// let the seller override before any row is touched.

import {
  parseLooseDate,
  parseCondition,
  parseBool,
  type ItemCondition,
} from "./format";
import { resolveCategory, type Category } from "./category";

// The fields a CSV column can map to. "ignore" = column is dropped.
export type FieldKey =
  | "name"
  | "description"
  | "condition"
  | "price"
  | "boughtDate"
  | "originalPrice"
  | "originalBox"
  | "availableFrom"
  | "category"
  | "venmoHandle"
  | "venmoLink"
  | "ignore";

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Name",
  description: "Description",
  condition: "Condition",
  price: "Listing price",
  boughtDate: "Bought (trust signal)",
  originalPrice: "Originally (trust signal)",
  originalBox: "Box included",
  availableFrom: "Available from",
  category: "Category",
  venmoHandle: "Venmo handle",
  venmoLink: "Venmo link",
  ignore: "Ignore column",
};

// Header alias table. First match wins; checked in declaration order so more
// specific fields (originalPrice) are tested before looser ones (price).
const ALIASES: { field: FieldKey; patterns: RegExp[] }[] = [
  // Venmo link before handle so "Venmo Link" claims the link and plain "Venmo"
  // claims the handle (both scalar, claimed once).
  { field: "venmoLink", patterns: [/venmo.*link/, /venmo.*url/] },
  { field: "venmoHandle", patterns: [/venmo/] },
  { field: "originalPrice", patterns: [/^original/, /msrp/, /retail/, /\bpaid\b/, /bought.*price/] },
  { field: "boughtDate", patterns: [/^bought/, /purchas/, /acquired/] },
  { field: "originalBox", patterns: [/box/, /packaging/] },
  { field: "condition", patterns: [/condition/, /\bstate\b/] },
  { field: "category", patterns: [/category/, /\btype\b/, /\bgroup\b/, /\broom\b/] },
  { field: "availableFrom", patterns: [/available/, /ready/, /pickup/] },
  { field: "price", patterns: [/price/, /asking/, /\bfree\b/, /\bcost\b/] },
  { field: "description", patterns: [/remark/, /note/, /desc/, /comment/, /detail/] },
  { field: "name", patterns: [/name/, /item/, /product/, /title/, /model/, /company/, /thing/] },
];

export interface ParsedCsv {
  headers: string[];
  rows: string[][]; // each row aligned to headers length
}

/** RFC-4180-ish parser: handles quoted fields, escaped "" quotes, CRLF. */
export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRecord();
    } else if (c === "\r") {
      // swallow; \n handles the record break
    } else {
      field += c;
    }
  }
  // trailing field/record (file not ending in newline)
  if (field.length > 0 || record.length > 0) pushRecord();

  // Drop fully-empty trailing records.
  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const [headers, ...rest] = nonEmpty;
  const width = headers.length;
  const rows = rest.map((r) => {
    const padded = [...r];
    while (padded.length < width) padded.push("");
    return padded.slice(0, width);
  });
  return { headers: headers.map((h) => h.trim()), rows };
}

// Fields that can absorb multiple columns, joined at import. Per spec
// (index.html line 2449): "Company/model → name", "Remarks → description".
// Scalar fields (price, dates, condition, box) stay one-column-only.
export const MERGE_FIELDS = new Set<FieldKey>(["name", "description"]);

// How each merge field joins its columns: name reads as one line; description
// joins with " | " so e.g. Company/model and Remarks stay visually separate
// (a raw "\n" collapses to a space in HTML and runs them together).
const MERGE_SEP: Partial<Record<FieldKey, string>> = {
  name: " ",
  description: " | ",
};

/**
 * Guess a field for each header. Scalar fields are claimed at most once;
 * merge fields (name, description) can be guessed for several columns so the
 * seller's Company + Model and Description + Remarks combine rather than drop.
 */
export function mapColumns(headers: string[]): FieldKey[] {
  const taken = new Set<FieldKey>();
  return headers.map((h) => {
    const key = h.toLowerCase().trim();
    for (const { field, patterns } of ALIASES) {
      if (taken.has(field)) continue;
      if (patterns.some((p) => p.test(key))) {
        if (!MERGE_FIELDS.has(field)) taken.add(field);
        return field;
      }
    }
    return "ignore";
  });
}

// An editable draft row. `state` is the publish decision (UI-only); it is not
// the item.status enum. Photo is held as a local preview until publish.
export interface ItemDraft {
  id: string; // client-side row key
  name: string;
  description: string;
  condition: ItemCondition | null;
  // Money is held as raw editable text on this surface and parsed at publish.
  // "" or "Free" => free; "$40"/"40" => 4000 cents (see parsePriceToCents).
  priceText: string;
  originalPriceText: string;
  boughtDate: string | null; // ISO
  originalBoxIncluded: boolean | null;
  availableFrom: string; // ISO, defaults to listing pickup_from
  // Canonical category (suggested from name when the CSV omits it); null =>
  // uncategorized, renders under "Other" in the buyer feed.
  category: Category | null;
  // Per-item Venmo (raw seller text; normalized at persist via lib/venmo).
  venmoHandle: string;
  venmoLink: string;
  photoDataUrl: string | null; // local preview; uploaded on publish
  state: "ready" | "draft" | "skip";
}

let draftCounter = 0;
const nextId = () => `draft-${Date.now()}-${draftCounter++}`;

/**
 * Apply a column mapping to parsed rows, producing editable drafts.
 * A row starts as "draft" — the seller decides Ready / Skip per the spec
 * ("every row becomes a draft"). Photos are never the gate.
 */
export function rowsToDrafts(
  parsed: ParsedCsv,
  mapping: FieldKey[],
  defaultAvailableFrom: string,
): ItemDraft[] {
  // Scalar fields: first mapped column wins.
  const col = (row: string[], field: FieldKey): string => {
    const idx = mapping.indexOf(field);
    return idx >= 0 ? (row[idx] ?? "") : "";
  };

  // Merge fields: every column mapped to the field, in header order, joined.
  const merged = (row: string[], field: FieldKey): string =>
    mapping
      .map((f, i) => (f === field ? (row[i] ?? "").trim() : ""))
      .filter((v) => v !== "")
      .join(MERGE_SEP[field] ?? " ");

  return parsed.rows.map((row) => {
    const boxRaw = col(row, "originalBox");
    const name = merged(row, "name");
    return {
      id: nextId(),
      name,
      description: merged(row, "description"),
      condition: parseCondition(col(row, "condition")),
      priceText: col(row, "price").trim(),
      originalPriceText: col(row, "originalPrice").trim(),
      boughtDate: parseLooseDate(col(row, "boughtDate")),
      originalBoxIncluded: boxRaw.trim() === "" ? null : parseBool(boxRaw),
      availableFrom: parseLooseDate(col(row, "availableFrom")) ?? defaultAvailableFrom,
      // Explicit category wins; otherwise suggest from the name.
      category: resolveCategory(col(row, "category"), name),
      venmoHandle: col(row, "venmoHandle").trim(),
      venmoLink: col(row, "venmoLink").trim(),
      photoDataUrl: null,
      state: "draft",
    };
  });
}

/** Human-readable summary of the mapping for the "Mapped: …" line. */
export function describeMapping(headers: string[], mapping: FieldKey[]): string {
  const parts: string[] = [];
  mapping.forEach((field, i) => {
    if (field === "ignore") return;
    parts.push(`${headers[i]} → ${FIELD_LABELS[field]}`);
  });
  return parts.join(" · ");
}
