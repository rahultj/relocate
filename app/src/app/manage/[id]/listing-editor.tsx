"use client";

// Manage editor for /manage/[id]. Edits auto-save — there is no Save button.
//
//   text/price/date/condition  → debounced patchItem (existing rows)
//   a new row                   → createItem on first blur, then patchItem
//   listing details             → debounced patchListingDetails
//   Listed/Unlisted + bulk      → setItemsListed (instant; bulk gets an undo toast)
//   photos                      → upload straight to Storage, then setItemPhoto
//   CSV import-merge            → still the bulk updateListing path (+ reload)
//
// A single top-right pill ("All changes saved / Saving… / Couldn't save") is the
// only save signal. See use-listing-save.ts for the engine.

import { useEffect, useMemo, useRef, useState } from "react";
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
import { parsePriceField, groupByListed } from "@/lib/item-save";
import { CATEGORIES } from "@/lib/category";
import { toVanitySlug } from "@/lib/slug";
import { uploadPhoto } from "@/lib/photo-upload";
import { setItemPhoto } from "@/app/seller/photo-actions";
import {
  updateListing,
  setListingSlug,
  type UpdateResult,
  type ItemFields,
} from "./actions";
import { useListingSave, type SaveStatus } from "./use-listing-save";

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
  "category",
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
  category: string | null;
  photoUrl: string | null; // already-uploaded URL
  photoDataUrl: string | null; // new/replacement preview
  listed: boolean;
  // Soft-claim info (read-only); present once a buyer has claimed this item.
  claim?: { name: string; contact: string; claimedAt: string } | null;
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

// Shared mapper: editor row → already-parsed item fields. Used for both the
// create and the patch payload, so the free/price logic lives in one place.
function rowToFields(r: Row): ItemFields {
  const { isFree, priceCents } = parsePriceField(r.priceText);
  return {
    name: r.name,
    description: r.description.trim() || null,
    condition: r.condition,
    priceCents,
    isFree,
    boughtDate: r.boughtDate,
    originalPriceCents: parsePriceToCents(r.originalPriceText),
    originalBoxIncluded: r.originalBoxIncluded,
    availableFrom: r.availableFrom || null,
    category: r.category,
    photoUrl: r.photoUrl,
  };
}

export function ListingEditor({
  listing,
  initialItems,
}: {
  listing: ListingMeta;
  initialItems: EditorItem[];
}) {
  const save = useListingSave(listing.id);

  const [title, setTitle] = useState(listing.title);
  const [city, setCity] = useState(listing.city);
  const [neighborhood, setNeighborhood] = useState(listing.neighborhood);
  const [pickupFrom, setPickupFrom] = useState(listing.pickupFrom);
  const [pickupTo, setPickupTo] = useState(listing.pickupTo);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Public slug — deliberate URL change (explicit Update, not autosaved).
  const [slug, setSlug] = useState(listing.slug);
  const [slugInput, setSlugInput] = useState(listing.slug);
  const [slugBusy, setSlugBusy] = useState(false);
  const [slugMsg, setSlugMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const applySlug = async () => {
    setSlugBusy(true);
    setSlugMsg(null);
    const res = await setListingSlug(listing.id, slugInput);
    setSlugBusy(false);
    if (res.ok) {
      setSlug(res.slug);
      setSlugInput(res.slug);
      setSlugMsg({ ok: true, text: `Live at /r/${res.slug}` });
    } else {
      setSlugMsg({ ok: false, text: res.error });
    }
  };

  const [rows, setRows] = useState<Row[]>(() =>
    initialItems.map((it) => ({ ...it, rowKey: it.itemId ?? nextKey() })),
  );
  // Latest rows for event handlers (blur/toggle/bulk read this, not stale state).
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // CSV import staging.
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<FieldKey[]>([]);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const bulkPhotoRef = useRef<HTMLInputElement>(null);
  const [photoMatches, setPhotoMatches] = useState<PhotoMatch[]>([]);
  const defaultAvailableFrom = pickupFrom || TODAY_ISO;

  // Undo toast for bulk list/unlist.
  const [toast, setToast] = useState<{ msg: string; undo: () => void } | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string, undo: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  };

  // ---------- Row editing (local state + auto-save) ----------

  // Patch a row locally and queue a save (existing rows only — new rows persist
  // on blur via createRow).
  const patch = (key: string, p: Partial<Row>) => {
    const next = rowsRef.current.map((r) =>
      r.rowKey === key ? { ...r, ...p } : r,
    );
    const row = next.find((r) => r.rowKey === key);
    if (row?.itemId) save.queueItem(key, row.itemId, rowToFields(row));
    setRows(next);
  };

  // Fold the real id/slug back into a row after createItem (no reload).
  const setRowIds = (key: string, itemId: string, slug: string) =>
    setRows((rs) =>
      rs.map((r) => (r.rowKey === key ? { ...r, itemId, slug } : r)),
    );

  // On blur of a new row: create it server-side once it has a name.
  const handleRowBlur = async (key: string) => {
    const row = rowsRef.current.find((r) => r.rowKey === key);
    if (!row || row.itemId || !row.name.trim()) return;
    const res = await save.createRow(key, rowToFields(row), row.listed);
    if (res) setRowIds(key, res.itemId, res.slug);
  };

  const removeRow = (key: string) =>
    setRows((rs) => rs.filter((r) => r.rowKey !== key));

  const toggleListed = (key: string) => {
    const next = rowsRef.current.map((r) =>
      r.rowKey === key ? { ...r, listed: !r.listed } : r,
    );
    const row = next.find((r) => r.rowKey === key);
    if (row?.itemId) save.setListed([row.itemId], row.listed);
    setRows(next);
  };

  const setAllListed = (listed: boolean) => {
    const prev = rowsRef.current.map((r) => ({
      rowKey: r.rowKey,
      itemId: r.itemId,
      listed: r.listed,
    }));
    const changed = prev.filter((p) => p.listed !== listed && p.itemId);
    if (changed.length === 0 && prev.every((p) => p.listed === listed)) return;

    setRows((rs) => rs.map((r) => ({ ...r, listed })));
    save.setListed(
      prev.filter((p) => p.itemId).map((p) => p.itemId as string),
      listed,
    );

    showToast(`${listed ? "Listed" : "Unlisted"} ${prev.length} items`, () => {
      // Restore exact prior state, then re-save the two groups.
      setRows((rs) =>
        rs.map((r) => {
          const p = prev.find((x) => x.rowKey === r.rowKey);
          return p ? { ...r, listed: p.listed } : r;
        }),
      );
      const { relist, unlist } = groupByListed(prev);
      save.setListed(relist, true);
      save.setListed(unlist, false);
      setToast(null);
    });
  };

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
        category: null,
        photoUrl: null,
        photoDataUrl: null,
        listed: true,
      },
    ]);

  // Upload one photo straight to Storage and attach it. Existing items
  // auto-save immediately; new rows keep the URL until they're created on blur.
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

  // ---------- Listing details (debounced auto-save) ----------

  const pushDetails = (over: Partial<ListingMeta>) => {
    save.saveDetails({
      title: over.title ?? title,
      city: (over.city ?? city).trim() || null,
      neighborhood: (over.neighborhood ?? neighborhood).trim() || null,
      pickupFrom: (over.pickupFrom ?? pickupFrom) || null,
      pickupTo: (over.pickupTo ?? pickupTo) || null,
    });
  };

  const detailsSummary = useMemo(() => {
    const parts = [city.trim(), neighborhood.trim()].filter(Boolean);
    if (pickupFrom)
      parts.push(`Pickup from ${formatMonthYear(pickupFrom) || pickupFrom}`);
    return parts.join(" · ") || "No location or pickup set";
  }, [city, neighborhood, pickupFrom]);

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

  // ---------- CSV intake (bulk import-merge → updateListing + reload) ----------

  const ingestText = (text: string) => {
    const p = parseCsv(text);
    if (p.headers.length === 0) {
      setResult({ ok: false, error: "That file had no readable rows." });
      return;
    }
    setParsed(p);
    setMapping(mapColumns(p.headers));
    setResult(null);
  };

  const onCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) file.text().then(ingestText);
  };

  // Merge incoming rows into local state by normalized name, then persist the
  // whole listing in one transactional upsert and reload (the import-merge is a
  // deliberate bulk op, so a reload to pick up new ids is fine here).
  const applyImport = async () => {
    if (!parsed) return;
    const incoming = rowsToDrafts(parsed, mapping, "");
    const prev = rowsRef.current;
    const next = [...prev];
    const byName = new Map<string, number>();
    next.forEach((r, i) => {
      const k = norm(r.name);
      if (k && !byName.has(k)) byName.set(k, i);
    });
    for (const d of incoming) {
      const k = norm(d.name);
      const idx = k ? byName.get(k) : undefined;
      if (idx != null) next[idx] = mergeDraft(next[idx], d);
      else {
        next.push(draftToRow(d, defaultAvailableFrom));
        if (k) byName.set(k, next.length - 1);
      }
    }

    setParsed(null);
    setMapping([]);
    setPasteText("");
    setPasteMode(false);
    if (csvInputRef.current) csvInputRef.current.value = "";

    setImporting(true);
    const res = await updateListing({
      id: listing.id,
      title,
      city: city.trim() || null,
      neighborhood: neighborhood.trim() || null,
      pickupFrom: pickupFrom || null,
      pickupTo: pickupTo || null,
      items: next.map((r) => {
        const f = rowToFields(r);
        return {
          itemId: r.itemId,
          name: f.name,
          description: f.description,
          condition: f.condition,
          priceCents: f.priceCents,
          isFree: f.isFree,
          boughtDate: f.boughtDate,
          originalPriceCents: f.originalPriceCents,
          originalBoxIncluded: f.originalBoxIncluded,
          availableFrom: f.availableFrom,
          category: f.category,
          listed: r.listed,
          photoDataUrl: r.photoDataUrl,
          photoUrl: r.photoUrl,
        };
      }),
    });
    setResult(res);
    setImporting(false);
    if (res.ok) setTimeout(() => window.location.reload(), 700);
  };

  const cancelImport = () => {
    setParsed(null);
    setMapping([]);
    setPasteText("");
    setPasteMode(false);
  };

  // ---------- Derived ----------

  const counts = useMemo(() => {
    const c = { listed: 0, unlisted: 0 };
    rows.forEach((r) => (r.listed ? c.listed++ : c.unlisted++));
    return c;
  }, [rows]);

  // ============================================================ render

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      {/* Header + save status */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            Manage listing
          </p>
          <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight text-text-primary">
            {title || "Untitled listing"}
          </h1>
        </div>
        <SavePill status={save.status} />
      </div>
      <p className="mt-3 max-w-xl text-text-secondary">
        Edits save as you go. Your link{" "}
        <code className="font-mono text-sm">/r/{slug}</code> and existing
        item links stay the same. Re-import your CSV anytime: matching rows
        update in place.
      </p>

      {/* Listing details — collapsed by default */}
      <section className="mt-8 rounded-xl border border-border-weave bg-bg-card">
        <button
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          aria-expanded={detailsOpen}
        >
          <span className="min-w-0">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
              Listing details
            </span>
            {!detailsOpen && (
              <span className="mt-0.5 block truncate text-sm text-text-secondary">
                {detailsSummary}
              </span>
            )}
          </span>
          <span className="shrink-0 text-sm font-medium text-brand">
            {detailsOpen ? "Done ▴" : "Edit ▾"}
          </span>
        </button>
        {detailsOpen && (
          <>
          <div className="grid grid-cols-1 gap-3 px-5 pb-3 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2">
              <input
                className={inputCls}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  pushDetails({ title: e.target.value });
                }}
              />
            </Field>
            <Field label="City">
              <input
                className={inputCls}
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  pushDetails({ city: e.target.value });
                }}
              />
            </Field>
            <Field label="Neighborhood">
              <input
                className={inputCls}
                value={neighborhood}
                onChange={(e) => {
                  setNeighborhood(e.target.value);
                  pushDetails({ neighborhood: e.target.value });
                }}
              />
            </Field>
            <Field label="Pickup from">
              <input
                type="date"
                className={inputCls}
                value={pickupFrom}
                onChange={(e) => {
                  setPickupFrom(e.target.value);
                  pushDetails({ pickupFrom: e.target.value });
                }}
              />
            </Field>
            <Field label="Pickup to">
              <input
                type="date"
                className={inputCls}
                value={pickupTo}
                onChange={(e) => {
                  setPickupTo(e.target.value);
                  pushDetails({ pickupTo: e.target.value });
                }}
              />
            </Field>
          </div>

          {/* Public link — deliberate URL change, explicit Update */}
          <div className="border-t border-border-weave px-5 py-4">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
              Public link
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-text-muted">/r/</span>
              <input
                className={`${inputCls} max-w-[16rem] flex-1`}
                value={slugInput}
                onChange={(e) => {
                  setSlugInput(toVanitySlug(e.target.value));
                  setSlugMsg(null);
                }}
                placeholder="ghar-waapsi"
                spellCheck={false}
                autoCapitalize="off"
              />
              <button
                onClick={applySlug}
                disabled={slugBusy || slugInput === slug || !slugInput}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {slugBusy ? "Updating…" : "Update URL"}
              </button>
            </div>
            {slugMsg ? (
              <p
                className={`mt-1.5 text-xs ${slugMsg.ok ? "text-forest" : "text-crimson"}`}
              >
                {slugMsg.text}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-text-muted">
                Letters, numbers, hyphens. Your old link keeps working.
              </p>
            )}
          </div>
          </>
        )}
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
              className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              onClick={applyImport}
              disabled={importing}
            >
              {importing
                ? "Importing…"
                : `Merge ${parsed.rows.length} rows · ${describeMapping(parsed.headers, mapping)}`}
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

        {result && !result.ok && (
          <p className="mt-3 rounded-lg border border-crimson/30 bg-crimson/5 px-3 py-2 text-sm text-crimson">
            {result.error}
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

      {/* List header: counts + bulk toggle, paired above the rows */}
      {rows.length > 0 && (
        <div className="mt-8 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            {rows.length} items · <span className="text-forest">{counts.listed} listed</span>
            {counts.unlisted > 0 && <> · {counts.unlisted} unlisted</>}
          </p>
          <div className="flex items-center gap-3">
            <a
              href={`/r/${slug}`}
              target="_blank"
              className="text-sm text-brand underline-offset-4 hover:underline"
            >
              View ↗
            </a>
            <div className="inline-flex overflow-hidden rounded-lg border border-border-alt">
              <button
                onClick={() => setAllListed(true)}
                className="px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-hover"
              >
                List all
              </button>
              <button
                onClick={() => setAllListed(false)}
                className="border-l border-border-alt px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-hover"
              >
                Unlist all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rows */}
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <EditRow
            key={r.rowKey}
            row={r}
            listingSlug={slug}
            hasError={save.errorKeys.has(r.rowKey)}
            onPatch={patch}
            onBlurRow={handleRowBlur}
            onToggleListed={toggleListed}
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

      {/* Undo toast (bulk list/unlist) */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-full border border-border-weave bg-text-primary px-5 py-2.5 text-sm text-white shadow-lg">
            <span>{toast.msg}</span>
            <button
              onClick={toast.undo}
              className="font-medium text-white underline underline-offset-4 hover:text-bg-main"
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Save status pill ----------

function SavePill({ status }: { status: SaveStatus }) {
  const map: Record<SaveStatus, { label: string; cls: string }> = {
    saved: {
      label: "All changes saved",
      cls: "border-forest/25 bg-forest/8 text-forest",
    },
    saving: {
      label: "Saving…",
      cls: "border-ochre/30 bg-ochre/10 text-ochre",
    },
    error: {
      label: "Couldn’t save — retrying",
      cls: "border-crimson/30 bg-crimson/8 text-crimson",
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${cls}`}
      role="status"
      aria-live="polite"
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
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
    category: d.category ?? row.category,
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
    category: d.category,
    photoUrl: null,
    photoDataUrl: null,
    // Imported items stage as Unlisted — the seller lists them when ready.
    listed: false,
  };
}

// ---------- Photo filename matching ----------

function normLabel(s: string, stripExt = false): string {
  let x = s.toLowerCase();
  if (stripExt) x = x.replace(/\.[a-z0-9]+$/, "");
  return x.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

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
  hasError,
  onPatch,
  onBlurRow,
  onToggleListed,
  onRemove,
  onAttachPhoto,
}: {
  row: Row;
  listingSlug: string;
  hasError: boolean;
  onPatch: (key: string, p: Partial<Row>) => void;
  onBlurRow: (key: string) => void;
  onToggleListed: (key: string) => void;
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
  const blur = () => onBlurRow(r.rowKey);

  return (
    <div
      className={`relative flex flex-wrap items-start gap-3 rounded-xl border bg-bg-card p-3 sm:grid sm:grid-cols-[4rem_minmax(0,1fr)_5rem_9rem_auto_auto] sm:items-center sm:gap-x-3 sm:gap-y-2 ${
        hasError ? "border-crimson/50" : "border-border-weave"
      } ${r.listed ? "" : "opacity-60"}`}
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

      {/* Name + condition + category */}
      <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-2 gap-y-1 sm:basis-auto sm:col-start-2 sm:row-start-1">
        <input
          className="min-w-[7rem] flex-1 bg-transparent font-medium text-text-primary outline-none"
          value={r.name}
          placeholder="Item name"
          onChange={(e) => onPatch(r.rowKey, { name: e.target.value })}
          onBlur={blur}
        />
        <select
          className="rounded-md border border-border-weave bg-bg-main px-1.5 py-0.5 text-xs text-text-secondary"
          value={r.condition ?? ""}
          onChange={(e) =>
            onPatch(r.rowKey, {
              condition: (e.target.value || null) as ItemCondition | null,
            })
          }
          onBlur={blur}
        >
          <option value="">Condition…</option>
          {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-border-weave bg-bg-main px-1.5 py-0.5 text-xs text-text-secondary"
          value={r.category ?? ""}
          onChange={(e) =>
            onPatch(r.rowKey, { category: e.target.value || null })
          }
          onBlur={blur}
        >
          <option value="">Category…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
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
          onBlur={blur}
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
        onBlur={blur}
      />

      {/* Listed / Unlisted switch */}
      <button
        onClick={() => onToggleListed(r.rowKey)}
        role="switch"
        aria-checked={r.listed}
        aria-label={r.listed ? "Listed (tap to unlist)" : "Unlisted (tap to list)"}
        className="inline-flex min-h-[44px] items-center gap-2 sm:col-start-5 sm:row-start-1 sm:min-h-0"
        title="Toggle listed / unlisted"
      >
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            r.listed ? "bg-forest" : "bg-border-alt"
          }`}
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${
              r.listed ? "left-[18px]" : "left-0.5"
            }`}
          />
        </span>
        <span
          className={`text-xs font-medium ${r.listed ? "text-forest" : "text-text-muted"}`}
        >
          {r.listed ? "Listed" : "Unlisted"}
        </span>
      </button>

      {/* Item link (saved) or remove (new unsaved) */}
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
          onBlur={blur}
        />
      </div>

      {/* Claim info (read-only) — shown once a buyer has claimed this item */}
      {r.claim && (
        <div className="w-full basis-full rounded-lg border border-forest/25 bg-forest/[0.06] px-3 py-2 sm:col-start-2 sm:col-end-[-1] sm:row-start-3">
          <p className="text-xs text-forest">
            <span className="font-semibold">Claimed</span>
            {r.claim.name ? ` by ${r.claim.name}` : ""} ·{" "}
            <a
              href={contactHref(r.claim.contact)}
              className="font-medium underline-offset-2 hover:underline"
            >
              {r.claim.contact}
            </a>
            {r.claim.claimedAt ? ` · ${formatClaimDate(r.claim.claimedAt)}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// mailto: for an email, tel: for a phone — lets the seller reach out in one tap.
function contactHref(contact: string): string {
  return contact.includes("@") ? `mailto:${contact}` : `tel:${contact}`;
}

function formatClaimDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
