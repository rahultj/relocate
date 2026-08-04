"use client";

import { useRef, useState, useMemo, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CsvHelp } from "@/components/csv-help";
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
import { fileToUploadDataUrl } from "@/lib/image";
import { publishListing, type PublishResult } from "./actions";

const TODAY_ISO = "2026-06-02"; // build-time "today" per project context
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
  "venmoHandle",
  "venmoLink",
  "ignore",
];

type StateKind = ItemDraft["state"];
const STATE_CYCLE: Record<StateKind, StateKind> = {
  draft: "ready",
  ready: "skip",
  skip: "draft",
};

export function BulkAdd() {
  // Listing header — publish creates the listing + items together (M1).
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [pickupFrom, setPickupFrom] = useState("");
  const [pickupTo, setPickupTo] = useState("");

  // CSV import staging.
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<FieldKey[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Imported, editable drafts.
  const [drafts, setDrafts] = useState<ItemDraft[]>([]);

  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const bulkPhotoRef = useRef<HTMLInputElement>(null);

  const defaultAvailableFrom = pickupFrom || TODAY_ISO;

  // ---------- CSV intake ----------

  const ingestText = useCallback((text: string, name: string | null) => {
    const p = parseCsv(text);
    if (p.headers.length === 0) {
      setResult({ ok: false, error: "That file had no readable rows." });
      return;
    }
    setParsed(p);
    setMapping(mapColumns(p.headers));
    setFileName(name);
    setResult(null);
  }, []);

  const onCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((t) => ingestText(t, file.name));
  };

  const applyMapping = () => {
    if (!parsed) return;
    setDrafts(rowsToDrafts(parsed, mapping, defaultAvailableFrom));
  };

  const resetImport = () => {
    setParsed(null);
    setMapping([]);
    setFileName(null);
    setDrafts([]);
    setPasteText("");
    setResult(null);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  // ---------- Row editing ----------

  const patch = (id: string, p: Partial<ItemDraft>) =>
    setDrafts((d) => d.map((row) => (row.id === id ? { ...row, ...p } : row)));

  const removeRow = (id: string) =>
    setDrafts((d) => d.filter((row) => row.id !== id));

  const cycleState = (id: string, current: StateKind) =>
    patch(id, { state: STATE_CYCLE[current] });

  const attachPhoto = (id: string, file: File) => {
    fileToUploadDataUrl(file).then((dataUrl) =>
      patch(id, { photoDataUrl: dataUrl }),
    );
  };

  // Bulk photo drop: assign to the first rows that don't yet have a photo.
  const onBulkPhotos = (files: FileList) => {
    const list = Array.from(files);
    const targets = drafts.filter((d) => !d.photoDataUrl).slice(0, list.length);
    targets.forEach((row, i) =>
      fileToUploadDataUrl(list[i]).then((dataUrl) =>
        patch(row.id, { photoDataUrl: dataUrl }),
      ),
    );
  };

  // ---------- Summary ----------

  const counts = useMemo(() => {
    const c = { ready: 0, draft: 0, skip: 0 };
    drafts.forEach((d) => c[d.state]++);
    return c;
  }, [drafts]);

  const readyPublishable = drafts.filter(
    (d) => d.state === "ready" && d.name.trim() !== "",
  );

  // ---------- Publish ----------

  const onPublish = async () => {
    setPublishing(true);
    setResult(null);
    const res = await publishListing({
      title,
      city: city.trim() || null,
      neighborhood: neighborhood.trim() || null,
      pickupFrom: pickupFrom || null,
      pickupTo: pickupTo || null,
      items: readyPublishable.map((d) => {
        const free = d.priceText.trim().toLowerCase() === "free" || d.priceText.trim() === "";
        return {
          name: d.name,
          description: d.description.trim() || null,
          condition: d.condition,
          priceCents: free ? null : parsePriceToCents(d.priceText),
          isFree: free,
          boughtDate: d.boughtDate,
          originalPriceCents: parsePriceToCents(d.originalPriceText),
          originalBoxIncluded: d.originalBoxIncluded,
          availableFrom: d.availableFrom,
          category: d.category,
          venmoHandle: d.venmoHandle.trim() || null,
          venmoLink: d.venmoLink.trim() || null,
          // Base64 (already downscaled on attach); the publish action uploads it
          // to Supabase Storage and stores the public URL.
          photoDataUrl: d.photoDataUrl ?? null,
        };
      }),
    });
    setResult(res);
    setPublishing(false);
  };

  // ============================================================ render

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
        New listing
      </p>
      <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight text-text-primary">
        Add your items
      </h1>
      <p className="mt-3 max-w-xl text-text-secondary">
        Upload your list as a CSV, or paste it in. Set prices, add photos, and
        publish. Photos are optional — you can add them later.
      </p>

      {/* ---------- Listing header ---------- */}
      <section className="mt-8 rounded-xl border border-border-weave bg-bg-card p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Listing details
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <input
              className={inputCls}
              placeholder="Rahul's leaving sale"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="City">
            <input
              className={inputCls}
              placeholder="Washington, D.C."
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </Field>
          <Field label="Neighborhood">
            <input
              className={inputCls}
              placeholder="Logan Circle"
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

      {/* ---------- CSV intake ---------- */}
      {drafts.length === 0 && (
        <section className="mt-6">
          {!parsed ? (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-alt bg-bg-card p-5">
                <div className="grid size-10 place-items-center rounded-lg bg-brand-soft text-lg text-brand">
                  ⇪
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary">Import your list</p>
                  <p className="text-sm text-text-muted">
                    A spreadsheet saved as CSV, with a header row on top.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => csvInputRef.current?.click()}
                >
                  Choose CSV
                </Button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={onCsvFile}
                />
              </div>
              <button
                className="mt-3 text-sm text-brand underline-offset-4 hover:underline"
                onClick={() => setPasteMode((v) => !v)}
              >
                {pasteMode ? "Hide paste box" : "…or paste your list instead"}
              </button>
              {pasteMode && (
                <div className="mt-3">
                  <textarea
                    className={`${inputCls} h-32 font-mono text-xs`}
                    placeholder={"name,price,bought,original price,remarks\nIKEA Poäng chair,40,May 2020,79,Good"}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <Button
                    className="mt-2"
                    variant="outline"
                    onClick={() => ingestText(pasteText, "pasted rows")}
                    disabled={!pasteText.trim()}
                  >
                    Parse rows
                  </Button>
                </div>
              )}
              <CsvHelp />
            </>
          ) : (
            // Column mapping — transparent, overridable before any row is touched.
            <div className="rounded-xl border border-border-weave bg-bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="font-medium text-text-primary">
                  {parsed.rows.length} rows · check the columns
                </p>
                <Button variant="ghost" size="sm" onClick={resetImport}>
                  Re-upload
                </Button>
              </div>
              <p className="mt-1 text-sm text-text-muted">
                We matched your columns to our fields. Change any that look wrong.
                Nothing is saved until you import.
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
              <Button className="mt-4" onClick={applyMapping}>
                Import {parsed.rows.length} rows
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ---------- Imported rows ---------- */}
      {drafts.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center gap-3 rounded-lg border border-border-weave bg-bg-card px-4 py-3">
            <span className="text-forest">✓</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">
                {fileName} · {drafts.length} rows imported
              </p>
              <p className="truncate text-xs text-text-muted">
                Mapped: {describeMapping(parsed?.headers ?? [], mapping)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={resetImport}>
              Re-upload
            </Button>
          </div>

          <button
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-alt bg-bg-card py-3 text-sm text-text-muted hover:bg-bg-hover"
            onClick={() => bulkPhotoRef.current?.click()}
          >
            <span className="text-brand">+</span> Drop photos to attach to rows
            without one · JPG, HEIC, PNG
          </button>
          <input
            ref={bulkPhotoRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => e.target.files && onBulkPhotos(e.target.files)}
          />
          <p className="mt-1.5 px-1 text-xs leading-relaxed text-text-muted">
            Here, photos attach to rows in order. To drop a whole folder and have
            each photo match its item by filename, publish first, then use
            <span className="font-medium text-text-secondary"> Bulk add photos</span>{" "}
            on your manage page.
          </p>

          <div className="mt-4 space-y-2">
            {drafts.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                onPatch={patch}
                onRemove={removeRow}
                onCycleState={cycleState}
                onAttachPhoto={attachPhoto}
              />
            ))}
          </div>

          {/* Summary bar */}
          <div className="sticky bottom-0 mt-5 flex flex-col gap-3 rounded-xl border border-border-weave bg-bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-secondary">
              <strong className="text-text-primary">{drafts.length}</strong>{" "}
              imported ·{" "}
              <strong className="text-forest">{counts.ready}</strong> ready ·{" "}
              <strong className="text-text-primary">{counts.draft}</strong>{" "}
              drafts ·{" "}
              <strong className="text-text-muted">{counts.skip}</strong> skipped
            </p>
            <Button
              size="lg"
              onClick={onPublish}
              disabled={readyPublishable.length === 0 || publishing || !title.trim()}
            >
              {publishing
                ? "Publishing…"
                : `Publish ${readyPublishable.length} ready`}
            </Button>
          </div>
          {!title.trim() && readyPublishable.length > 0 && (
            <p className="mt-2 text-right text-xs text-ochre-dark">
              Add a listing title above to publish.
            </p>
          )}
        </section>
      )}

      {/* ---------- Result ---------- */}
      {result && (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${
            result.ok
              ? "border-forest/30 bg-forest/5 text-forest"
              : "border-crimson/30 bg-crimson/5 text-crimson"
          }`}
        >
          {result.ok ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  Published <strong>{result.itemCount}</strong> items. Listing
                  live at{" "}
                  <a
                    href={`/r/${result.slug}`}
                    className="font-mono underline underline-offset-2"
                  >
                    /r/{result.slug}
                  </a>
                  .
                </p>
                <a
                  href={`/r/${result.slug}/share`}
                  className="shrink-0 rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Get QR &amp; print sheet →
                </a>
              </div>
              {result.id && (
                <p className="border-t border-forest/20 pt-3 text-text-secondary">
                  <strong className="text-text-primary">Bookmark to edit later:</strong>{" "}
                  <a
                    href={`/manage/${result.id}`}
                    className="font-mono text-sm underline underline-offset-2"
                  >
                    /manage/{result.id}
                  </a>{" "}
                  — keep this private; anyone with it can edit the listing.
                </p>
              )}
            </div>
          ) : (
            <p>{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
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

const STATE_STYLES: Record<StateKind, string> = {
  ready: "bg-forest/10 text-forest",
  draft: "bg-ochre/10 text-ochre-dark",
  skip: "bg-bg-hover text-text-muted line-through",
};
const STATE_LABELS: Record<StateKind, string> = {
  ready: "Ready",
  draft: "Draft",
  skip: "Skip",
};

function trustMeta(d: ItemDraft): string {
  const parts: string[] = [];
  if (d.boughtDate) parts.push(`Bought ${formatMonthYear(d.boughtDate)}`);
  const orig = parsePriceToCents(d.originalPriceText);
  if (orig != null) parts.push(`Originally $${orig / 100}`);
  if (d.originalBoxIncluded) parts.push("Box ✓");
  return parts.join(" · ");
}

function DraftRow({
  draft: d,
  onPatch,
  onRemove,
  onCycleState,
  onAttachPhoto,
}: {
  draft: ItemDraft;
  onPatch: (id: string, p: Partial<ItemDraft>) => void;
  onRemove: (id: string) => void;
  onCycleState: (id: string, s: StateKind) => void;
  onAttachPhoto: (id: string, file: File) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const meta = trustMeta(d);
  // Show a "$" adornment only for numeric prices — not for "Free", empty, or
  // a value the seller already prefixed with "$".
  const priceTrimmed = d.priceText.trim();
  const showDollar =
    priceTrimmed !== "" &&
    priceTrimmed.toLowerCase() !== "free" &&
    !priceTrimmed.startsWith("$");

  return (
    <div
      className={`relative flex flex-wrap items-start gap-3 rounded-xl border border-border-weave bg-bg-card p-3 sm:grid sm:grid-cols-[4rem_minmax(0,1fr)_5rem_9rem_auto_auto] sm:items-center sm:gap-x-3 sm:gap-y-2 ${
        d.state === "skip" ? "opacity-60" : ""
      }`}
    >
      {/* Photo / placeholder — pinned top-left, spans both rows on desktop */}
      <button
        onClick={() => photoRef.current?.click()}
        className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border-weave bg-bg-main text-[10px] text-text-muted sm:row-span-2 sm:self-start"
      >
        {d.photoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={d.photoDataUrl}
            alt={d.name}
            className="size-full object-cover"
          />
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
          e.target.files?.[0] && onAttachPhoto(d.id, e.target.files[0])
        }
      />

      {/* Name + condition — first line, col 2 */}
      <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto sm:col-start-2 sm:row-start-1">
        <input
          className="min-w-0 flex-1 bg-transparent font-medium text-text-primary outline-none"
          value={d.name}
          placeholder="Item name"
          onChange={(e) => onPatch(d.id, { name: e.target.value })}
        />
        <select
          className="rounded-md border border-border-weave bg-bg-main px-1.5 py-0.5 text-xs text-text-secondary"
          value={d.condition ?? ""}
          onChange={(e) =>
            onPatch(d.id, {
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
          value={d.priceText}
          placeholder="$ or Free"
          onChange={(e) => onPatch(d.id, { priceText: e.target.value })}
        />
      </div>

      {/* Available from */}
      <input
        type="date"
        className="w-36 rounded-md border border-border-weave bg-bg-main px-2 py-1 text-sm text-text-primary outline-none sm:w-full sm:col-start-4 sm:row-start-1"
        value={d.availableFrom}
        onChange={(e) =>
          onPatch(d.id, {
            availableFrom: parseLooseDate(e.target.value) ?? e.target.value,
          })
        }
      />

      {/* State pill */}
      <button
        onClick={() => onCycleState(d.id, d.state)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:col-start-5 sm:row-start-1 ${STATE_STYLES[d.state]}`}
        title="Click to cycle Ready / Skip / Draft"
      >
        <span className="size-1.5 rounded-full bg-current" />
        {STATE_LABELS[d.state]}
      </button>

      <button
        onClick={() => onRemove(d.id)}
        className="absolute right-2 top-2 grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-crimson/10 hover:text-crimson sm:static sm:col-start-6 sm:row-start-1"
        aria-label="Remove row"
        title="Remove row"
      >
        <Trash2 className="size-4" />
      </button>

      {/* Trust meta + description — second line, spans col 2 → end */}
      <div className="w-full basis-full sm:col-start-2 sm:col-end-[-1] sm:row-start-2">
        {meta && <p className="text-xs text-text-muted">{meta}</p>}
        <textarea
          className="mt-1 w-full resize-none bg-transparent text-sm leading-snug text-text-secondary outline-none placeholder:text-text-muted"
          rows={d.description.includes("\n") ? 2 : 1}
          value={d.description}
          placeholder="Details / remarks…"
          onChange={(e) => onPatch(d.id, { description: e.target.value })}
        />
      </div>
    </div>
  );
}
