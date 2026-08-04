"use client";

// Seller onboarding help for the CSV import — a "Download template" button plus
// a collapsible column reference. Shared by /seller/add and /manage re-import so
// the guidance is identical on both. Content comes from lib/csv (single source
// of truth, kept in sync with the header aliases).

import { useState } from "react";
import { buildTemplateCsv, SELLER_COLUMNS } from "@/lib/csv";

function downloadTemplate() {
  const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mustgo-item-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CsvHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 rounded-xl border border-border-weave bg-bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={downloadTemplate}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-hover"
        >
          ↓ Download CSV template
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-xs font-medium text-brand"
        >
          {open ? "Hide columns ▴" : "What columns can I use? ▾"}
        </button>
      </div>

      {open && (
        <div className="border-t border-border-weave px-4 py-3">
          <p className="text-xs leading-relaxed text-text-secondary">
            Use any of these headers — order doesn&apos;t matter, and extra
            columns are ignored. <span className="font-medium text-text-primary">Item</span>{" "}
            is the only one you need.
          </p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {SELLER_COLUMNS.map((c) => (
              <li key={c.header} className="text-xs leading-relaxed">
                <span className="font-mono font-medium text-text-primary">
                  {c.header}
                </span>
                <span className="text-text-muted"> — {c.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
