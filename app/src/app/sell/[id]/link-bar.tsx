"use client";

// The sale's public link with Copy, the QR sheet and Share (design "8a").
// Share uses the phone's share sheet where there is one, else copies.

import { useState } from "react";
import Link from "next/link";
import { Link2, QrCode } from "lucide-react";

export function LinkBar({ url, slug, title }: { url: string; slug: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the link is on screen to copy by hand
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // dismissed
      }
      return;
    }
    await copy();
  }

  return (
    <div className="mt-3 flex h-11 items-center gap-1.5 rounded-[10px] border border-border-weave bg-white pl-3.5 pr-1.5">
      <Link2 className="size-4 shrink-0 text-text-secondary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
        {url.replace(/^https?:\/\//, "")}
      </span>
      <button
        type="button"
        onClick={copy}
        className="h-8 shrink-0 rounded-lg bg-bg-hover px-2.5 text-[13px] font-medium text-text-primary"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <Link
        href={`/r/${slug}/share`}
        aria-label="QR sheet to print"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg-hover text-text-primary"
      >
        <QrCode className="size-4" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={share}
        className="h-8 shrink-0 rounded-lg bg-brand-hover px-2.5 text-[13px] font-medium text-white hover:bg-crimson"
      >
        Share
      </button>
    </div>
  );
}
