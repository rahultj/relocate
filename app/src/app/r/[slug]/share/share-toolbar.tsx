"use client";

import { useState } from "react";
import { Printer, Link2, Check } from "lucide-react";

// Print / copy actions for the share sheet. Hidden in the print output itself
// (the parent wraps it in `print:hidden`).
export function ShareToolbar({ listingUrl }: { listingUrl: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (insecure origin); the URL is visible on the
      // sheet either way, so fail quietly.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
      >
        <Printer className="size-4" /> Print · save as PDF
      </button>
      <button
        onClick={copy}
        className="inline-flex items-center gap-2 rounded-lg border border-border-alt px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
      >
        {copied ? (
          <>
            <Check className="size-4 text-forest" /> Copied
          </>
        ) : (
          <>
            <Link2 className="size-4" /> Copy link
          </>
        )}
      </button>
    </div>
  );
}
