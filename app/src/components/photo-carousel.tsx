"use client";

// Buyer-facing photo gallery for the item detail hero. Horizontal scroll-snap
// (native swipe on mobile), dot indicators + "N of M" — no library. One photo
// renders as a plain image (no dots). Matches the single-image treatment:
// whole photo, object-contain, capped height, cream letterbox.

import { useRef, useState } from "react";

export function PhotoCarousel({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  };

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  if (photos.length === 1) {
    return (
      <div className="flex w-full justify-center overflow-hidden border-y border-border-weave bg-bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[0]}
          alt={alt}
          className="max-h-[28rem] w-auto max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="border-y border-border-weave bg-bg-card">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((url, i) => (
          <div
            key={url}
            className="flex w-full shrink-0 snap-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${alt} — photo ${i + 1}`}
              className="max-h-[28rem] w-auto max-w-full object-contain"
            />
          </div>
        ))}
      </div>

      {/* Dots + count */}
      <div className="flex items-center justify-center gap-2 py-2.5">
        {photos.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to photo ${i + 1}`}
            onClick={() => goTo(i)}
            className={`size-1.5 rounded-full transition-colors ${
              i === active ? "bg-brand" : "bg-border-alt"
            }`}
          />
        ))}
        <span className="ml-1.5 font-mono text-[10px] tracking-[0.06em] text-text-muted">
          {active + 1} of {photos.length}
        </span>
      </div>
    </div>
  );
}
