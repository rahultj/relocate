"use client";

// Match photos by filename on /sell (moved from /manage): pick many photos,
// each is matched to an item by its filename ("orange couch.jpg" → Orange
// couch), fix any that are wrong, then attach. Photos upload straight from the
// browser to Storage, a few items at a time.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MAX_PHOTOS } from "@/lib/photos";
import { uploadPhotos } from "@/lib/photo-upload";
import { suggestItem } from "@/lib/sell-import";
import { setItemPhotos } from "@/app/seller/photo-actions";

export interface MatchItem {
  id: string;
  name: string;
  photoUrls: string[];
}

interface Match {
  key: string;
  file: File;
  preview: string;
  itemId: string; // "" = skip
}

export function PhotoMatcher({ listingId, items }: { listingId: string; items: MatchItem[] }) {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ attached: number; failed: string[]; full: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);

  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function choose(files: FileList) {
    previews.current.forEach((u) => URL.revokeObjectURL(u));
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const next = list.map((file, i) => {
      const preview = URL.createObjectURL(file);
      return { key: `${file.name}-${file.size}-${i}`, file, preview, itemId: suggestItem(file.name, items) };
    });
    previews.current = next.map((m) => m.preview);
    setMatches(next);
    setResult(null);
  }

  async function attach() {
    const byItem = new Map<string, File[]>();
    for (const m of matches) if (m.itemId) byItem.set(m.itemId, [...(byItem.get(m.itemId) ?? []), m.file]);
    const jobs = [...byItem.entries()];
    const failed: string[] = [];
    const full: string[] = [];
    let attached = 0;
    let done = 0;
    setProgress({ done: 0, total: jobs.length });

    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const [itemId, files] = jobs[next++];
        const it = items.find((x) => x.id === itemId)!;
        const room = MAX_PHOTOS - it.photoUrls.length;
        try {
          if (room <= 0) full.push(it.name);
          else {
            const urls = await uploadPhotos(files.slice(0, room));
            const res = await setItemPhotos(listingId, itemId, [...it.photoUrls, ...urls]);
            if (!res.ok) throw new Error(res.error);
            attached += urls.length;
            if (files.length > room) full.push(it.name);
          }
        } catch {
          failed.push(it.name);
        }
        done++;
        setProgress({ done, total: jobs.length });
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));

    setProgress(null);
    setMatches([]);
    setResult({ attached, failed, full });
    router.refresh();
  }

  const assigned = matches.filter((m) => m.itemId).length;

  if (result) {
    return (
      <div className="mt-6 rounded-xl border border-border-weave bg-white p-4">
        <p className="text-[15px] font-bold text-text-primary">
          Attached {result.attached} {result.attached === 1 ? "photo" : "photos"}.
        </p>
        {result.full.length > 0 && (
          <p className="mt-1 text-sm text-text-secondary">
            Some photos didn&apos;t fit, because an item holds {MAX_PHOTOS}: {result.full.join(", ")}.
          </p>
        )}
        {result.failed.length > 0 && (
          <p className="mt-1 text-sm text-crimson">Couldn&apos;t attach to {result.failed.join(", ")}. Try those again.</p>
        )}
        <div className="mt-3 flex gap-2">
          <Link
            href={`/sell/${listingId}`}
            className="flex h-11 flex-1 items-center justify-center rounded-full bg-text-primary text-sm font-medium text-white"
          >
            Back to your items
          </Link>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="h-11 flex-1 rounded-full border border-border-alt bg-white text-sm font-medium text-text-primary"
          >
            Match more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) choose(e.target.files);
          e.target.value = "";
        }}
      />
      {matches.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={items.length === 0}
          className="h-12 rounded-full bg-brand-hover text-base font-medium text-white hover:bg-crimson disabled:opacity-50"
        >
          Choose photos
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-bold text-text-primary">Match {matches.length} photos</p>
            <button
              type="button"
              onClick={() => setMatches([])}
              disabled={!!progress}
              className="h-10 text-sm text-text-secondary underline underline-offset-2"
            >
              Start over
            </button>
          </div>
          <ul className="flex flex-col rounded-xl border border-border-weave bg-white px-3.5">
            {matches.map((m) => (
              <li key={m.key} className="flex items-center gap-3 border-b border-border-weave py-2.5 last:border-b-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.preview} alt="" className="size-12 shrink-0 rounded-[10px] object-cover" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[13px] text-text-secondary">{m.file.name}</span>
                  <select
                    aria-label={`Item for ${m.file.name}`}
                    value={m.itemId}
                    onChange={(e) =>
                      setMatches((ms) => ms.map((x) => (x.key === m.key ? { ...x, itemId: e.target.value } : x)))
                    }
                    className={`h-10 w-full rounded-lg border bg-white px-2 text-sm ${
                      m.itemId ? "border-border-alt text-text-primary" : "border-ochre text-text-secondary"
                    }`}
                  >
                    <option value="">Skip this photo</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name || "Untitled item"}
                      </option>
                    ))}
                  </select>
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={attach}
            disabled={assigned === 0 || !!progress}
            className="h-12 rounded-full bg-brand-hover text-base font-medium text-white hover:bg-crimson disabled:opacity-60"
          >
            {progress
              ? `Attaching… ${progress.done} of ${progress.total} items`
              : `Attach ${assigned} ${assigned === 1 ? "photo" : "photos"}`}
          </button>
        </>
      )}
      {items.length === 0 && (
        <p className="text-sm text-text-secondary">Add some items first, then match photos to them.</p>
      )}
    </div>
  );
}
