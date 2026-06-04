"use client";

// Manage editor for /manage/[id]. Edit listing details, edit existing items,
// append items (CSV match-and-update or by hand), and soft-unlist. Reuses the
// pure CSV helpers (lib/csv), formatters (lib/format), and the in-browser image
// downscaler (lib/image).

import { useMemo, useRef, useState } from "react";
import {
  parseCsv,
  mapColumns,
  rowsToDrafts,
  describeMapping,
  FIELD_LABELS,
  type FieldKey,
  type ParsedCsv,
  type ItemDraft,
} from "@/lib/csv";
import {
  parsePriceToCents,
  parseLooseDate,
  formatMonthYear,
  CONDITION_LABELS,
  type ItemCondition,
} from "@/lib/format";
import { uploadPhoto } from "@/lib/photo-upload";
import { setItemPhoto } from "@/app/seller/photo-actions";
import { updateListing, type UpdateResult } from "./actions";

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const FIELD_ORDER: FieldKey[] = [
  "name",
  "description",
  "condition",
  "price",
  "boughtDate",
  "originalPrice",
  "originalBox",
  "availableFrom",
  "ignore",
];

export interface EditorItem {
  itemId: string | null; // existing item id; null = new
  slug: string | null; // existing item slug (for its public link)
  name: string;
  description: string;
  condition: ItemCondition | null;
  priceText: string;
  originalPriceText: string;
  boughtDate: string | null;
  originalBoxIncluded: boolean | null;
  availableFrom: string;
  photoUrl: string | null; // already-uploaded URL
  photoDataUrl: string | null; // new/replacement preview
  listed: boolean;
}

type Row = EditorItem & {
  rowKey: string;
  uploading?: "up" | "done" | "err"; // transient photo-upload status
};

interface PhotoMatch {
  id: string;
  file: File;
  previewUrl: string;
  rowKey: string; // "" = skip
}

interface ListingMeta {
  id: string;
  slug: string;
  title: string;
  city: string;
  neighborhood: string;
  pickupFrom: string;
  pickupTo: string;
}

let rowCounter = 0;
const nextKey = () => `row-${Date.now()}-${rowCounter++}`;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function ListingEditor({
  listing,
  initialItems,
}: {
  listing: ListingMeta;
  initialItems: EditorItem[];
}) {
  const [title, setTitle] = useState(listing.title);
  const [city, setCity] = useState(listing.city);
  const [neighborhood, setNeighborhood] = useState(listing.neighborhood);
  const [pickupFrom, setPickupFrom] = useState(listing.pickupFrom);
  const [pickupTo, setPickupTo] = useState(listing.pickupTo);

  const [rows, setRows] = useState<Row[]>(() =>
    initialItems.map((it) => ({ ...it, rowKey: it.itemId ?? nextKey() })),
  );

  // CSV import staging.
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<FieldKey[]>([]);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const bulkPhotoRef = useRef<HTMLInputElement>(null);
  const [photoMatches, setPhotoMatches] = useState<PhotoMatch[]>([]);
  const defaultAvailableFrom = pickupFrom || TODAY_ISO;

  // ---------- Row editing ----------

  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.rowKey === key ? { ...r, ...p } : r)));

  const removeRow = (key: string) =>
    setRows((rs) => rs.filter((r) => r.rowKey !== key));

  const setAllListed = (listed: boolean) =>
    setRows((rs) => rs.map((r) => ({ ...r, listed })));

  const addBlankRow = () =>
    setRows((rs) => [
      ...rs,
      {
        rowKey: nextKey(),
        itemId: null,
        slug: null,
        name: "",
        description: "",
        condition: null,
        priceText: "",
        originalPriceText: "",
        boughtDate: null,
        originalBoxIncluded: null,
        availableFrom: defaultAvailableFrom,
        photoUrl: null,
        photoDataUrl: null,
        listed: true,
      },
    ]);

  // Upload one photo straight to Storage and attach it. Existing items
  // auto-save immediately; new rows keep the URL until the next Save (a tiny
  // string payload). No image bytes ever go through a server-action body.
  const uploadAndSet = async (
    rowKey: string,
    itemId: string | null,
    file: File,
  ) => {
    patch(rowKey, { uploading: "up" });
    try {
      const url = await uploadPhoto(file);
      patch(rowKey, { photoUrl: url, photoDataUrl: null, uploading: "done" });
      if (itemId) await setItemPhoto(listing.id, itemId, url);
    } catch {
      patch(rowKey, { uploading: "err" });
    }
  };

  const attachPhoto = (key: string, itemId: string | null, file: File) =>
    void uploadAndSet(key, itemId, file);

  // ---------- Bulk photos (drop a folder, match by filename) ----------

  const onBulkPhotoFiles = (files: FileList) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setPhotoMatches(
      list.map((file, i) => ({
        id: `${file.name}-${file.size}-${i}`,
        file,
        previewUrl: URL.createObjectURL(file),
        rowKey: suggestRow(normLabel(file.name, true), rows),
      })),
    );
  };

  const setMatchRow = (id: string, rowKey: string) =>
    setPhotoMatches((ms) =>
      ms.map((m) => (m.id === id ? { ...m, rowKey } : m)),
    );

  const applyPhotoMatches = async () => {
    const assigned = photoMatches.filter((m) => m.rowKey);
    const itemIdByKey = new Map(rows.map((r) => [r.rowKey, r.itemId] as const));
    photoMatches.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    setPhotoMatches([]);
    // Upload with a small concurrency pool so progress shows per-row and we
    // don't open dozens of connections at once.
    let i = 0;
    const worker = async () => {
      while (i < assigned.length) {
        const m = assigned[i++];
        await uploadAndSet(m.rowKey, itemIdByKey.get(m.rowKey) ?? null, m.file);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  };

  const cancelPhotoMatches = () => {
    photoMatches.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    setPhotoMatches([]);
  };

  // ---------- CSV intake ----------

  const ingestText = (text: string) => {
    const p = parseCsv(text);
    if (p.headers.length === 0) {
      setResult({ ok: false, error: "That file had no readable rows." });
      return;
    }
    setParsed(p);
    setMapping(mapColumns(p.headers));
    setResult(null);
    setImportSummary(null);
  };

  const onCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) file.text().then(ingestText);
  };

  // Match incoming rows to existing items by normalized name. Matched rows
  // overwrite only the CSV fields that carry a value (so blank cells never wipe
  // existing data, and photos are never touched); unmatched rows are appended.
  const applyImport = () => {
    if (!parsed) return;
    // Empty defaultAvailableFrom so "no date in CSV" stays blank (not defaulted).
    const incoming = rowsToDrafts(parsed, mapping, "");
    setRows((prev) => {
      const next = [...prev];
      const byName = new Map<string, number>();
      next.forEach((r, i) => {
        const k = norm(r.name);
        if (k && !byName.has(k)) byName.set(k, i);
      });
      let updated = 0;
      let added = 0;
      for (const d of incoming) {
        const k = norm(d.name);
        const idx = k ? byName.get(k) : undefined;
        if (idx != null) {
          next[idx] = mergeDraft(next[idx], d);
          updated++;
        } else {
          next.push(draftToRow(d, defaultAvailableFrom));
          if (k) byName.set(k, next.length - 1);
          added++;
        }
      }
      const untouched = prev.length - updated;
      setImportSummary(
        `${updated} updated · ${added} new (added as Unlisted) · ${untouched} untouched`,
      );
      return next;
    });
    setParsed(null);
    setMapping([]);
    setPasteText("");
    setPasteMode(false);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const cancelImport = () => {
    setParsed(null);
    setMapping([]);
    setPasteText("");
    setPasteMode(false);
  };

  // ---------- Save ----------

  const counts = useMemo(() => {
    const c = { listed: 0, unlisted: 0 };
    rows.forEach((r) => (r.listed ? c.listed++ : c.unlisted++));
    return c;
  }, [rows]);

  const onSave = async () => {
    setSaving(true);
    setResult(null);
    const res = await updateListing({
      id: listing.id,
      title,
      city: city.trim() || null,
      neighborhood: neighborhood.trim() || null,
      pickupFrom: pickupFrom || null,
      pickupTo: pickupTo || null,
      items: rows.map((r) => {
        const free =
          r.priceText.trim().toLowerCase() === "free" ||
          r.priceText.trim() === "";
        return {
          itemId: r.itemId,
          name: r.name,
          description: r.description.trim() || null,
          condition: r.condition,
          priceCents: free ? null : parsePriceToCents(r.priceText),
          isFree: free,
          boughtDate: r.boughtDate,
          originalPriceCents: parsePriceToCents(r.originalPriceText),
          originalBoxIncluded: r.originalBoxIncluded,
          availableFrom: r.availableFrom || null,
          listed: r.listed,
          photoDataUrl: r.photoDataUrl,
          photoUrl: r.photoUrl,
        };
      }),
    });
    setResult(res);
    setSaving(false);
    // Reload so new items pick up their real ids (avoids re-inserting on a
    // second save) and buyer-facing state is in sync.
    if (res.ok) setTimeout(() => window.location.reload(), 900);
  };

  // ============================================================ render

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
        Manage listing
      </p>
      <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight text-text-primary">
        {title || "Untitled listing"}
      </h1>
      <p className="mt-3 max-w-xl text-text-secondary">
        Add items, fix details, or take something down — your link{" "}
        <code className="font-mono text-sm">/r/{listing.slug}</code> and existing
        item links stay the same. Re-import your CSV anytime: matching rows update
        in place.
      </p>

      {/* Listing details */}
      <section className="mt-8 rounded-xl border border-border-weave bg-bg-card p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Listing details
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="City">
            <input
              className={inputCls}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </Field>
          <Field label="Neighborhood">
            <input
              className={inputCls}
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
            />
          </Field>
          <Field label="Pickup from">
            <input
              type="date"
              className={inputCls}
              value={pickupFrom}
              onChange={(e) => setPickupFrom(e.target.value)}
            />
          </Field>
          <Field label="Pickup to">
            <input
              type="date"
              className={inputCls}
              value={pickupTo}
              onChange={(e) => setPickupTo(e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* Import / add */}
      <section className="mt-6">
        {parsed ? (
          <div className="rounded-xl border border-border-weave bg-bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="font-medium text-text-primary">
                {parsed.rows.length} rows · check the column mapping
              </p>
              <button
                className="text-sm text-text-muted hover:text-brand"
                onClick={cancelImport}
              >
                Cancel
              </button>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              Rows matching an existing item (by name) update it; the rest are
              added. Blank cells won&apos;t overwrite, and photos are untouched.
            </p>
            <div className="mt-4 space-y-2">
              {parsed.headers.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg bg-bg-main px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">
                    {h || <em className="text-text-muted">(unnamed)</em>}
                    <span className="ml-2 text-text-muted">
                      e.g. {parsed.rows[0]?.[i] || "—"}
                    </span>
                  </span>
                  <span className="text-text-muted">→</span>
                  <select
                    className="rounded-md border border-border-weave bg-bg-card px-2 py-1 text-sm text-text-primary"
                    value={mapping[i]}
                    onChange={(e) => {
                      const next = [...mapping];
                      next[i] = e.target.value as FieldKey;
                      setMapping(next);
                    }}
                  >
                    {FIELD_ORDER.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
              onClick={applyImport}
            >
              Merge {parsed.rows.length} rows · {describeMapping(parsed.headers, mapping)}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={addBlankRow}
              className="rounded-lg border border-border-alt px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover"
            >
              + Add item
            </button>
            <button
              onClick={() => csvInputRef.current?.click()}
              className="rounded-lg border border-border-alt px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover"
            >
              Import / re-import CSV
            </button>
            <button
              onClick={() => bulkPhotoRef.current?.click()}
              className="rounded-lg border border-border-alt px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover"
            >
              Bulk add photos
            </button>
            <button
              onClick={() => setPasteMode((v) => !v)}
              className="text-sm text-brand underline-offset-4 hover:underline"
            >
              {pasteMode ? "Hide paste box" : "…or paste rows"}
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={onCsvFile}
            />
            <input
              ref={bulkPhotoRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => e.target.files && onBulkPhotoFiles(e.target.files)}
            />
          </div>
        )}

        {pasteMode && !parsed && (
          <div className="mt-3">
            <textarea
              className={`${inputCls} h-32 font-mono text-xs`}
              placeholder={"name,price,bought,original price,remarks\nIKEA Poäng chair,40,May 2020,79,Good"}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <button
              className="mt-2 rounded-lg border border-border-alt px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-50"
              onClick={() => ingestText(pasteText)}
              disabled={!pasteText.trim()}
            >
              Parse rows
            </button>
          </div>
        )}

        {importSummary && (
          <p className="mt-3 rounded-lg border border-forest/30 bg-forest/5 px-3 py-2 text-sm text-forest">
            Imported · {importSummary}. Review below, then Save changes.
          </p>
        )}
      </section>

      {/* Bulk photo match review */}
      {photoMatches.length > 0 && (
        <section className="mt-4 rounded-xl border border-border-weave bg-bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium text-text-primary">
              Match {photoMatches.length} photos
            </p>
            <button
              className="text-sm text-text-muted hover:text-brand"
              onClick={cancelPhotoMatches}
            >
              Cancel
            </button>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Each photo is matched to an item by filename — fix any wrong ones and
            set duplicates to Skip, then attach.
          </p>
          <div className="mt-3 space-y-2">
            {photoMatches.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.previewUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-md border border-border-weave object-cover"
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">
                  {m.file.name}
                </span>
                <span className="text-text-muted">→</span>
                <select
                  value={m.rowKey}
                  onChange={(e) => setMatchRow(m.id, e.target.value)}
                  className={`max-w-[45%] rounded-md border bg-bg-main px-2 py-1 text-sm ${
                    m.rowKey
                      ? "border-border-weave text-text-primary"
                      : "border-ochre/40 text-text-muted"
                  }`}
                >
                  <option value="">— Skip —</option>
                  {rows.map((r) => (
                    <option key={r.rowKey} value={r.rowKey}>
                      {r.name || "(unnamed)"}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button
            onClick={applyPhotoMatches}
            className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Attach {photoMatches.filter((m) => m.rowKey).length} photos
          </button>
        </section>
      )}

      {/* Bulk list toggle */}
      {rows.length > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            {rows.length} items
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setAllListed(true)}
              className="rounded-md border border-border-alt px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-bg-hover"
            >
              List all
            </button>
            <button
              onClick={() => setAllListed(false)}
              className="rounded-md border border-border-alt px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-bg-hover"
            >
              Unlist all
            </button>
          </div>
        </div>
      )}

      {/* Rows */}
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <EditRow
            key={r.rowKey}
            row={r}
            listingSlug={listing.slug}
            onPatch={patch}
            onRemove={removeRow}
            onAttachPhoto={attachPhoto}
          />
        ))}
        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-border-alt bg-bg-card px-4 py-8 text-center text-sm text-text-muted">
            No items yet. Add one or import a CSV.
          </p>
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 mt-5 flex flex-col gap-3 rounded-xl border border-border-weave bg-bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-secondary">
          <strong className="text-forest">{counts.listed}</strong> listed ·{" "}
          <strong className="text-text-muted">{counts.unlisted}</strong> unlisted
        </p>
        <a
          href={`/r/${listing.slug}`}
          target="_blank"
          className="text-sm text-brand underline-offset-4 hover:underline sm:order-first sm:mr-auto"
        >
          View public listing ↗
        </a>
        <button
          onClick={onSave}
          disabled={saving || !title.trim()}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${
            result.ok
              ? "border-forest/30 bg-forest/5 text-forest"
              : "border-crimson/30 bg-crimson/5 text-crimson"
          }`}
        >
          {result.ok ? <p>Saved. Refreshing…</p> : <p>{result.error}</p>}
        </div>
      )}
    </div>
  );
}

// ---------- Merge helpers (CSV match-and-update) ----------

function mergeDraft(row: Row, d: ItemDraft): Row {
  return {
    ...row,
    name: d.name || row.name,
    description: d.description || row.description,
    condition: d.condition ?? row.condition,
    priceText: d.priceText || row.priceText,
    originalPriceText: d.originalPriceText || row.originalPriceText,
    boughtDate: d.boughtDate ?? row.boughtDate,
    originalBoxIncluded: d.originalBoxIncluded ?? row.originalBoxIncluded,
    availableFrom: d.availableFrom || row.availableFrom,
    // itemId, slug, photoUrl, photoDataUrl, listed, rowKey preserved.
  };
}

function draftToRow(d: ItemDraft, defaultAvailableFrom: string): Row {
  return {
    rowKey: nextKey(),
    itemId: null,
    slug: null,
    name: d.name,
    description: d.description,
    condition: d.condition,
    priceText: d.priceText,
    originalPriceText: d.originalPriceText,
    boughtDate: d.boughtDate,
    originalBoxIncluded: d.originalBoxIncluded,
    availableFrom: d.availableFrom || defaultAvailableFrom,
    photoUrl: null,
    photoDataUrl: null,
    // Imported items stage as Unlisted — the seller lists them when ready, so a
    // re-import never silently publishes everything (matches first-publish's
    // Draft gate).
    listed: false,
  };
}

// ---------- Photo filename matching ----------

// Normalize a label for matching: lowercase, drop extension (filenames),
// treat - and _ as spaces, collapse whitespace.
function normLabel(s: string, stripExt = false): string {
  let x = s.toLowerCase();
  if (stripExt) x = x.replace(/\.[a-z0-9]+$/, "");
  return x.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

// Best-guess item rowKey for a normalized filename. Prefers an exact name
// match, then the longest item name that the filename starts with (so
// "ladder shelf 1" → "Ladder shelf"), then any containment. "" if no guess.
function suggestRow(fn: string, rows: Row[]): string {
  const cands = rows
    .map((r) => ({ key: r.rowKey, n: normLabel(r.name) }))
    .filter((c) => c.n);
  const exact = cands.find((c) => c.n === fn);
  if (exact) return exact.key;
  const prefix = cands
    .filter((c) => fn === c.n || fn.startsWith(c.n + " "))
    .sort((a, b) => b.n.length - a.n.length);
  if (prefix.length) return prefix[0].key;
  const part = cands
    .filter((c) => c.n.startsWith(fn) || c.n.includes(fn) || fn.includes(c.n))
    .sort((a, b) => b.n.length - a.n.length);
  return part.length ? part[0].key : "";
}

// ---------- Subcomponents ----------

const inputCls =
  "w-full rounded-lg border border-border-weave bg-bg-main px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-light focus:ring-3 focus:ring-ring/40";

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function trustMeta(r: Row): string {
  const parts: string[] = [];
  if (r.boughtDate) parts.push(`Bought ${formatMonthYear(r.boughtDate)}`);
  const orig = parsePriceToCents(r.originalPriceText);
  if (orig != null) parts.push(`Originally $${orig / 100}`);
  if (r.originalBoxIncluded) parts.push("Box ✓");
  return parts.join(" · ");
}

function EditRow({
  row: r,
  listingSlug,
  onPatch,
  onRemove,
  onAttachPhoto,
}: {
  row: Row;
  listingSlug: string;
  onPatch: (key: string, p: Partial<Row>) => void;
  onRemove: (key: string) => void;
  onAttachPhoto: (key: string, itemId: string | null, file: File) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const meta = trustMeta(r);
  const photoSrc = r.photoDataUrl ?? r.photoUrl;
  const priceTrimmed = r.priceText.trim();
  const showDollar =
    priceTrimmed !== "" &&
    priceTrimmed.toLowerCase() !== "free" &&
    !priceTrimmed.startsWith("$");

  return (
    <div
      className={`relative flex flex-wrap items-start gap-3 rounded-xl border border-border-weave bg-bg-card p-3 sm:grid sm:grid-cols-[4rem_minmax(0,1fr)_5rem_9rem_auto_auto] sm:items-center sm:gap-x-3 sm:gap-y-2 ${
        r.listed ? "" : "opacity-60"
      }`}
    >
      {/* Photo */}
      <button
        onClick={() => photoRef.current?.click()}
        className={`grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-bg-main text-center text-[9px] leading-tight sm:row-span-2 sm:self-start ${
          r.uploading === "err"
            ? "border-crimson/50 text-crimson"
            : "border-border-weave text-text-muted"
        }`}
      >
        {r.uploading === "up" ? (
          "Uploading…"
        ) : r.uploading === "err" ? (
          "Failed · retry"
        ) : photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc} alt={r.name} className="size-full object-cover" />
        ) : (
          "+ Photo"
        )}
      </button>
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) =>
          e.target.files?.[0] && onAttachPhoto(r.rowKey, r.itemId, e.target.files[0])
        }
      />

      {/* Name + condition */}
      <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto sm:col-start-2 sm:row-start-1">
        <input
          className="min-w-0 flex-1 bg-transparent font-medium text-text-primary outline-none"
          value={r.name}
          placeholder="Item name"
          onChange={(e) => onPatch(r.rowKey, { name: e.target.value })}
        />
        <select
          className="rounded-md border border-border-weave bg-bg-main px-1.5 py-0.5 text-xs text-text-secondary"
          value={r.condition ?? ""}
          onChange={(e) =>
            onPatch(r.rowKey, {
              condition: (e.target.value || null) as ItemCondition | null,
            })
          }
        >
          <option value="">Condition…</option>
          {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {/* Price */}
      <div className="relative w-20 sm:w-full sm:col-start-3 sm:row-start-1">
        {showDollar && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-text-muted">
            $
          </span>
        )}
        <input
          className={`w-full rounded-md border border-border-weave bg-bg-main py-1 text-sm text-text-primary outline-none ${
            showDollar ? "pl-5 pr-2" : "px-2"
          }`}
          value={r.priceText}
          placeholder="$ or Free"
          onChange={(e) => onPatch(r.rowKey, { priceText: e.target.value })}
        />
      </div>

      {/* Available from */}
      <input
        type="date"
        className="w-36 rounded-md border border-border-weave bg-bg-main px-2 py-1 text-sm text-text-primary outline-none sm:w-full sm:col-start-4 sm:row-start-1"
        value={r.availableFrom}
        onChange={(e) =>
          onPatch(r.rowKey, {
            availableFrom: parseLooseDate(e.target.value) ?? e.target.value,
          })
        }
      />

      {/* Listed / Unlisted toggle */}
      <button
        onClick={() => onPatch(r.rowKey, { listed: !r.listed })}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:col-start-5 sm:row-start-1 ${
          r.listed
            ? "bg-forest/10 text-forest"
            : "bg-bg-hover text-text-muted"
        }`}
        title="Toggle listed / unlisted"
      >
        <span className="size-1.5 rounded-full bg-current" />
        {r.listed ? "Listed" : "Unlisted"}
      </button>

      {/* Remove (new unsaved rows only — saved items use Unlisted instead) */}
      <div className="sm:col-start-6 sm:row-start-1">
        {r.itemId ? (
          <a
            href={`/r/${listingSlug}/${r.slug}`}
            target="_blank"
            className="font-mono text-[10px] text-text-muted underline-offset-2 hover:text-brand hover:underline"
            title="Open item page"
          >
            /{r.slug}
          </a>
        ) : (
          <button
            onClick={() => onRemove(r.rowKey)}
            className="text-text-muted hover:text-crimson"
            aria-label="Remove row"
          >
            ×
          </button>
        )}
      </div>

      {/* Trust meta + description */}
      <div className="w-full basis-full sm:col-start-2 sm:col-end-[-1] sm:row-start-2">
        {meta && <p className="text-xs text-text-muted">{meta}</p>}
        <textarea
          className="mt-1 w-full resize-none bg-transparent text-sm leading-snug text-text-secondary outline-none placeholder:text-text-muted"
          rows={r.description.includes("\n") ? 2 : 1}
          value={r.description}
          placeholder="Details / remarks…"
          onChange={(e) => onPatch(r.rowKey, { description: e.target.value })}
        />
      </div>
    </div>
  );
}
