"use client";

// "Questions? Text Rahul →": the buyer pages' way to reach the seller, an inline
// link (under the sale's tags on the feed, under the claim area on an item)
// that replaced a floating button which covered prices and text. Tapping it
// opens the seller's numbers right below, as sms: links, so a phone taps
// straight into messages (SMS is the medium, CLAUDE.md principle #2).

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { contactName, type SellerContact } from "@/lib/seller-contact";
import { contactHref, formatContact } from "@/lib/contact";

export function ContactLine({
  contacts,
  align = "start",
  className = "",
}: {
  contacts: SellerContact[];
  align?: "start" | "center";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Escape or a tap elsewhere closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // No contacts set for this sale → nothing to show (no global fallback).
  const usable = (contacts ?? []).filter((c) => c.value?.trim());
  if (usable.length === 0) return null;
  const who = contactName(usable);

  return (
    <div ref={ref} className={`print:hidden ${align === "center" ? "text-center" : ""} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-hover underline-offset-4 hover:underline"
      >
        <MessageCircle className="size-4" aria-hidden />
        Questions? Text {who} <span aria-hidden>→</span>
      </button>

      {open && (
        <div
          role="group"
          aria-label={`Text ${who}`}
          className="mt-2.5 rounded-xl border border-border-weave bg-bg-card p-3 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs leading-relaxed text-text-secondary">Tap a number to open your messages.</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {usable.map((c, i) => {
              const href = contactHref(c.value);
              const inner = (
                <>
                  <span className="text-sm font-medium text-text-primary">{c.name?.trim() || "Seller"}</span>
                  <span className="text-sm text-text-secondary">{formatContact(c.value.trim())}</span>
                </>
              );
              const cls =
                "flex items-center justify-between gap-3 rounded-lg border border-border-weave bg-bg-main px-3 py-2.5";
              return (
                <li key={`${c.value}-${i}`}>
                  {href ? (
                    <a href={href} className={`${cls} transition-colors hover:border-brand-light hover:bg-bg-hover`}>
                      {inner}
                    </a>
                  ) : (
                    <div className={cls}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
