"use client";

// Spreadsheet import on /sell (moved from /manage): choose a CSV or paste
// rows, check which column is which, then import. Matching names update,
// the rest are added hidden from buyers (see lib/sell-import.ts).

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CsvHelp } from "@/components/csv-help";
import { FIELD_LABELS, mapColumns, parseCsv, rowsToDrafts, type FieldKey, type ParsedCsv } from "@/lib/csv";
import type { HomeItem } from "@/lib/seller-home";
import { planImport } from "@/lib/sell-import";
import { updateListing } from "@/app/manage/[id]/actions";

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
  "upiId",
  "ignore",
];

export interface ImportSale {
  id: string;
  title: string;
  city: string | null;
  neighborhood: string | null;
  pickupFrom: string | null;
  pickupTo: string | null;
}

export function ImportTool({
  sale,
  items,
  startWithPaste,
}: {
  sale: ImportSale;
  items: HomeItem[];
  startWithPaste: boolean;
}) {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<FieldKey[]>([]);
  const [paste, setPaste] = useState(startWithPaste);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ added: number; updated: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const plan = useMemo(
    () => (parsed ? planImport(items, rowsToDrafts(parsed, mapping, sale.pickupFrom ?? ""), sale.pickupFrom) : null),
    [parsed, mapping, items, sale.pickupFrom],
  );

  function ingest(text: string) {
    const p = parseCsv(text);
    if (p.headers.length === 0) {
      setError("That file had no rows we could read.");
      return;
    }
    setError(null);
    setParsed(p);
    setMapping(mapColumns(p.headers));
  }

  function reset() {
    setParsed(null);
    setMapping([]);
    setPasteText("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function runImport() {
    if (!plan) return;
    if (!mapping.includes("name")) {
      setError("Pick which column has the item names.");
      return;
    }
    if (plan.rows.length === 0) {
      setError("Nothing to change: every row matches an item as it is.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updateListing({ ...sale, items: plan.rows }).catch(() => ({
      ok: false,
      error: "Couldn't import. Check your connection and try again.",
    }));
    setBusy(false);
    if (res.ok) {
      setDone({ added: plan.added, updated: plan.updated });
      reset();
      router.refresh(); // so "Import more" matches against the new items
    } else setError(res.error ?? "Couldn't import. Try again.");
  }

  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-border-weave bg-white p-4">
        <p className="text-[15px] font-bold text-text-primary">
          {[
            done.added > 0 && `Added ${done.added} ${done.added === 1 ? "item" : "items"}`,
            done.updated > 0 && `updated ${done.updated}`,
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
        {done.added > 0 && (
          <p className="mt-1 text-sm text-text-secondary">
            New items are hidden from buyers. On the Items tab, use Select to show them when they&apos;re ready.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Link
            href={`/sell/${sale.id}`}
            className="flex h-11 flex-1 items-center justify-center rounded-full bg-text-primary text-sm font-medium text-white"
          >
            Back to your items
          </Link>
          <button
            type="button"
            onClick={() => setDone(null)}
            className="h-11 flex-1 rounded-full border border-border-alt bg-white text-sm font-medium text-text-primary"
          >
            Import more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col">
      {parsed && plan ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-bold text-text-primary">{parsed.rows.length} rows · check the columns</p>
            <button type="button" onClick={reset} className="h-10 text-sm text-text-secondary underline underline-offset-2">
              Start over
            </button>
          </div>
          <ul className="flex flex-col rounded-xl border border-border-weave bg-white px-3.5">
            {parsed.headers.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 border-b border-border-weave py-2.5 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">{h || "(no heading)"}</span>
                  <span className="block truncate text-[13px] text-text-secondary">e.g. {parsed.rows[0]?.[i] || "blank"}</span>
                </span>
                <select
                  aria-label={`Column ${h || i + 1} is`}
                  className="h-10 max-w-[55%] rounded-lg border border-border-alt bg-white px-2 text-sm text-text-primary"
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
              </li>
            ))}
          </ul>
          <p className="text-sm text-text-secondary">
            This will add {plan.added} {plan.added === 1 ? "item" : "items"} and update {plan.updated}. Blank cells
            won&apos;t erase anything, and photos stay as they are.
          </p>
          <button
            type="button"
            onClick={runImport}
            disabled={busy}
            className="h-12 rounded-full bg-brand-hover text-base font-medium text-white hover:bg-crimson disabled:opacity-60"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="h-12 rounded-full bg-brand-hover text-base font-medium text-white hover:bg-crimson"
          >
            Choose a CSV file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) f.text().then(ingest);
            }}
          />
          {paste ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] text-text-secondary">Paste rows, with a heading row first</span>
                <textarea
                  className="h-36 w-full rounded-lg border border-border-alt bg-white px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-text-primary"
                  placeholder={"name,price,bought,original price,remarks\nIKEA Poäng chair,40,May 2020,79,Good"}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => ingest(pasteText)}
                disabled={!pasteText.trim()}
                className="h-11 rounded-full border border-border-alt bg-white text-sm font-medium text-text-primary disabled:opacity-50"
              >
                Read these rows
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setPaste(true)} className="h-10 self-center text-sm text-brand-hover underline underline-offset-2">
              …or paste rows from a spreadsheet
            </button>
          )}
          <CsvHelp />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-crimson shadow-sm">
          {error}
        </p>
      )}
    </div>
  );
}
