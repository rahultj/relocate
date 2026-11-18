"use client";

// The seller's intro on the buyer feed, cut to three lines so the items start
// sooner (design review, feed). "more" opens the rest; it only shows when the
// text actually runs past three lines.

import { useLayoutEffect, useRef, useState } from "react";

export function SaleIntro({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setLong(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  return (
    <div className="mt-3 text-[15px] leading-relaxed text-text-secondary">
      {/* Collapsed, the paragraphs run together so three lines hold text,
          not a blank line between paragraphs. Open, they're kept. */}
      <p ref={ref} className={open ? "whitespace-pre-line" : "line-clamp-3"}>
        {open ? text : text.replace(/\s*\n+\s*/g, " ")}
      </p>
      {(long || open) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="text-text-primary underline decoration-border-alt underline-offset-4"
        >
          {open ? "less" : "more"}
        </button>
      )}
    </div>
  );
}
