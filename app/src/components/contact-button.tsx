"use client";

// Floating "Contact us" button for the buyer surfaces (listing feed + item
// detail). Fixed to the bottom of the content column; tapping opens a small
// card with the seller's numbers. Swati is the primary contact.
//
// Numbers render as visible text (a desktop visitor can text from their own
// phone) wrapped in `sms:` links (a mobile visitor taps straight into their
// messaging app) — "SMS is the medium" (CLAUDE.md principle #2).

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import type { SellerContact } from "@/lib/seller-contact";
import { contactHref } from "@/lib/contact";

export function ContactButton({ contacts }: { contacts: SellerContact[] }) {
  const [open, setOpen] = useState(false);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // No contacts set for this listing → no button at all (no global fallback).
  const usable = (contacts ?? []).filter((c) => c.value?.trim());
  if (usable.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 print:hidden">
      {/* Outside-click catcher — only while open, so the page stays interactive
          otherwise. */}
      {open && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="pointer-events-auto fixed inset-0 cursor-default bg-transparent"
        />
      )}

      <div className="relative mx-auto flex max-w-xl flex-col items-end px-6 pb-6">
        {open && (
          <div
            role="dialog"
            aria-label="Contact the seller"
            className="pointer-events-auto mb-3 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-border-weave bg-bg-card p-4 shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-serif text-lg font-medium leading-tight text-text-primary">
                  Get in touch
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                  Have a question? Text us — tap a number to open your messages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <ul className="mt-3 flex flex-col gap-2">
              {usable.map((c, i) => {
                const href = contactHref(c.value);
                const value = c.value.trim();
                const inner = (
                  <>
                    <span className="flex items-baseline gap-2">
                      {c.name?.trim() && (
                        <span className="text-sm font-medium text-text-primary">
                          {c.name.trim()}
                        </span>
                      )}
                      {c.primary && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-brand">
                          Primary
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[13px] text-text-secondary">
                      {value}
                    </span>
                  </>
                );
                const cls =
                  "flex items-center justify-between gap-3 rounded-lg border border-border-weave bg-bg-main px-3 py-2.5";
                return (
                  <li key={`${value}-${i}`}>
                    {href ? (
                      <a
                        href={href}
                        className={`${cls} transition-colors hover:border-brand-light hover:bg-bg-hover`}
                      >
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

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close contact options" : "Contact us"}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-brand-hover"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Contact us
        </button>
      </div>
    </div>
  );
}
