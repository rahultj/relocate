"use client";

// Seller home items (designs "8a" Items, "8b" Add items sheet, "8c" Select).
// The live list with status lines and filter chips, Select mode for hiding
// and showing items in bulk, and the Add items sheet. The sheet starts the
// camera loop; the other ways to add open the matching /manage tool.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, Images, PenLine, Plus, Sheet, FolderCheck, X } from "lucide-react";
import { downloadTemplate } from "@/components/csv-help";
import { formatMoney, type Currency } from "@/lib/money";
import { groupByListed } from "@/lib/item-save";
import {
  filterCounts,
  homeStatus,
  matchesFilter,
  statusLine,
  type HomeFilter,
  type HomeStatus,
} from "@/lib/seller-home";
import { setItemsListed } from "@/app/manage/[id]/actions";
import { CameraLoop, type CameraLoopHandle, type DraftSummary } from "./camera-loop";

export interface HomeItem {
  id: string;
  name: string;
  photoUrl: string | null;
  priceCents: number | null;
  isFree: boolean;
  listed: boolean;
  sold: boolean;
  claimant: string | null;
  waiting: number;
}

export function SellerItems({
  listingId,
  currency,
  initialItems,
  initialDrafts,
}: {
  listingId: string;
  currency: Currency;
  initialItems: HomeItem[];
  initialDrafts: DraftSummary[];
}) {
  const [list, setList] = useState(initialItems);
  const [filter, setFilter] = useState<HomeFilter>("all");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<CameraLoopHandle>(null);

  const rows = useMemo(() => list.map((it) => ({ it, status: homeStatus(it) })), [list]);
  const counts = filterCounts(rows.map((r) => r.status));
  // A filter whose last item was just hidden or shown falls back to All.
  const active: HomeFilter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const visible = rows.filter((r) => matchesFilter(r.status, active));
  const firstRun = list.length === 0;

  function showToast(msg: string, undo: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  async function save(ids: string[], listed: boolean) {
    const res = await setItemsListed(listingId, ids, listed);
    if (!res.ok) throw new Error(res.error);
  }

  function setListed(ids: string[], listed: boolean) {
    const before = list.filter((it) => ids.includes(it.id)).map((it) => ({ itemId: it.id, listed: it.listed }));
    const restore = () =>
      setList((l) =>
        l.map((it) => {
          const b = before.find((x) => x.itemId === it.id);
          return b ? { ...it, listed: b.listed } : it;
        }),
      );
    setError(null);
    setList((l) => l.map((it) => (ids.includes(it.id) ? { ...it, listed } : it)));
    setSelecting(false);
    setSelected(new Set());
    save(ids, listed).catch(() => {
      restore();
      setToast(null);
      setError("Couldn't save that. Try again.");
    });
    const n = ids.length;
    showToast(`${listed ? "Showing" : "Hid"} ${n} ${n === 1 ? "item" : "items"}${listed ? " to buyers" : ""}`, () => {
      setToast(null);
      restore();
      const { relist, unlist } = groupByListed(before);
      Promise.all([save(relist, true), save(unlist, false)]).catch(() =>
        setError("Couldn't undo that. Try again."),
      );
    });
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.it.id));

  const chips = (
    <div className="flex items-center gap-2">
      <Chip on={active === "all"} onClick={() => setFilter("all")}>All</Chip>
      {counts.available > 0 && (
        <Chip on={active === "available"} onClick={() => setFilter("available")}>
          Available {counts.available}
        </Chip>
      )}
      {counts.hidden > 0 && (
        <Chip on={active === "hidden"} onClick={() => setFilter("hidden")}>
          Hidden {counts.hidden}
        </Chip>
      )}
    </div>
  );

  return (
    <>
      <CameraLoop ref={loop} listingId={listingId} initialDrafts={initialDrafts} inline={firstRun} />

      {firstRun && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mt-3 self-center text-sm font-medium text-brand-hover underline-offset-4 hover:underline"
        >
          More ways to add items
        </button>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-white px-3 py-2 text-sm text-crimson shadow-sm">
          {error}
        </p>
      )}

      {list.length > 0 && (
        <>
          {selecting ? (
            <div className="mt-4 flex h-11 items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setSelecting(false);
                  setSelected(new Set());
                }}
                className="h-11 text-[15px] font-medium text-text-primary"
              >
                Cancel
              </button>
              <span className="text-base font-bold text-text-primary" aria-live="polite">
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelected(allVisibleSelected ? new Set() : new Set(visible.map((r) => r.it.id)))
                }
                className="h-11 text-[15px] font-medium text-brand-hover"
              >
                {allVisibleSelected ? "Select none" : "Select all"}
              </button>
            </div>
          ) : null}

          <div className="mt-3.5 flex items-center gap-2">
            {chips}
            <span className="flex-1" />
            {!selecting && (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="flex h-8 items-center px-1 text-[13px] font-medium text-brand-hover"
              >
                Select
              </button>
            )}
          </div>

          <ul className="mt-1 flex flex-col">
            {visible.map(({ it, status }) => {
              const body = <ItemRowBody it={it} status={status} currency={currency} />;
              return (
                <li key={it.id} className="border-b border-border-weave">
                  {selecting ? (
                    <label className="flex cursor-pointer items-center gap-3 py-[11px]">
                      <input
                        type="checkbox"
                        checked={selected.has(it.id)}
                        onChange={() => toggle(it.id)}
                        aria-label={`Select ${it.name}`}
                        className="size-[22px] shrink-0 accent-text-primary"
                      />
                      {body}
                    </label>
                  ) : (
                    <Link
                      href={`/manage/${listingId}#item-${it.id}`}
                      className="flex items-center gap-3 py-[11px] text-text-primary"
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border-weave bg-white px-5 pb-7 pt-3">
          <div className="mx-auto flex max-w-md gap-2.5">
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => setListed([...selected], false)}
              className="h-12 flex-1 rounded-full border border-border-alt bg-white text-[15px] font-medium text-text-primary disabled:opacity-50"
            >
              Hide from buyers
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => setListed([...selected], true)}
              className="h-12 flex-1 rounded-full bg-forest text-[15px] font-medium text-white disabled:opacity-50"
            >
              Show to buyers
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-20 flex justify-center px-4">
          <div role="status" className="flex items-center gap-4 rounded-full bg-text-primary px-5 py-2.5 text-sm text-white shadow-lg">
            <span>{toast.msg}</span>
            <button type="button" onClick={toast.undo} className="font-medium underline underline-offset-4">
              Undo
            </button>
          </div>
        </div>
      )}

      {!firstRun && !selecting && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-7 left-1/2 z-10 flex h-14 -translate-x-1/2 items-center gap-2.5 rounded-full bg-text-primary px-7 text-base font-medium text-white shadow-[0_4px_16px_rgba(0,0,0,0.16)]"
        >
          <Plus className="size-5" aria-hidden />
          Add items
        </button>
      )}

      {sheetOpen && (
        <AddItemsSheet
          listingId={listingId}
          onClose={() => setSheetOpen(false)}
          onCamera={() => {
            setSheetOpen(false);
            loop.current?.takePhoto();
          }}
          onGallery={() => {
            setSheetOpen(false);
            loop.current?.chooseFromGallery();
          }}
        />
      )}
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-8 rounded-full border px-3 text-[13px] ${
        on
          ? "border-text-primary bg-text-primary font-medium text-white"
          : "border-border-alt bg-white text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function ItemRowBody({ it, status, currency }: { it: HomeItem; status: HomeStatus; currency: Currency }) {
  const muted = status.kind === "hidden" || status.kind === "sold";
  const price = it.isFree ? "Free" : it.priceCents != null ? formatMoney(it.priceCents, currency, { whole: true }) : "";
  const dot =
    status.kind === "available" ? "bg-forest" : status.kind === "claimed" ? "bg-ochre" : null;
  return (
    <>
      {it.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.photoUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-[10px] object-cover" />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[10px] bg-bg-hover font-serif text-[22px] font-semibold text-text-secondary">
          {it.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className={`truncate text-[15px] font-medium ${muted ? "text-text-secondary" : ""}`}>
          {it.name || "Untitled item"}
        </span>
        <span
          className={`flex items-center gap-1.5 text-[13px] ${
            status.kind === "available" ? "text-forest" : muted ? "text-text-secondary" : "text-text-primary"
          }`}
        >
          {dot && <span className={`size-[7px] shrink-0 rounded-full ${dot}`} aria-hidden />}
          <span className="truncate">{statusLine(status)}</span>
        </span>
      </span>
      <span
        className={`shrink-0 font-serif text-[22px] font-semibold ${
          muted ? "text-text-secondary" : it.isFree ? "text-forest" : ""
        }`}
      >
        {price}
      </span>
    </>
  );
}

function AddItemsSheet({
  listingId,
  onClose,
  onCamera,
  onGallery,
}: {
  listingId: string;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  const tools = [
    {
      tool: "csv",
      icon: Sheet,
      title: "Import a spreadsheet",
      sub: "CSV from Sheets or Excel, or paste rows. Re-import updates items by name.",
    },
    {
      tool: "photos",
      icon: FolderCheck,
      title: "Match photos by filename",
      sub: "Pick many photos; “orange couch.jpg” goes to Orange couch.",
    },
    { tool: "add", icon: PenLine, title: "Type one in", sub: "Name and price now, photos later." },
  ];

  return (
    <div className="fixed inset-0 z-30" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add items"
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] max-w-md flex-col overflow-y-auto rounded-t-[20px] bg-bg-main px-5 pb-7 pt-2.5"
      >
        <div className="h-1 w-10 self-center rounded-full bg-border-alt" aria-hidden />
        <div className="mt-2.5 flex items-center justify-between">
          <h2 className="font-serif text-[28px] font-semibold text-text-primary">Add items</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 items-center justify-end text-text-primary"
          >
            <X className="size-[22px]" aria-hidden />
          </button>
        </div>

        <button
          type="button"
          onClick={onCamera}
          className="mt-2.5 flex h-14 items-center justify-center gap-2.5 rounded-full bg-brand-hover text-base font-medium text-white hover:bg-crimson"
        >
          <Camera className="size-5" aria-hidden />
          Take photos
        </button>
        <button
          type="button"
          onClick={onGallery}
          className="mt-2.5 flex h-12 items-center justify-center gap-2 rounded-full border border-border-alt bg-white text-[15px] font-medium text-text-primary hover:bg-bg-hover"
        >
          <Images className="size-[18px]" aria-hidden />
          Choose from gallery
        </button>
        <p className="mt-2.5 text-center text-[13px] text-text-secondary">
          One item per photo. AI writes the listing, you check it.
        </p>

        <p className="mt-[22px] text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">
          More ways to add
        </p>
        <ul className="mt-2 rounded-xl border border-border-weave bg-white px-3.5">
          {tools.map(({ tool, icon: Icon, title, sub }, i) => (
            <li key={tool} className={i < tools.length - 1 ? "border-b border-border-weave" : ""}>
              <Link
                href={`/manage/${listingId}?tool=${tool}`}
                className="flex items-center gap-3 py-3 text-text-primary"
              >
                <Icon className="size-[22px] shrink-0 text-text-secondary" strokeWidth={1.7} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{title}</span>
                  <span className="text-[13px] leading-[1.4] text-text-secondary">{sub}</span>
                </span>
                <ChevronRight className="size-[18px] shrink-0 text-text-secondary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={downloadTemplate}
          className="mt-3.5 self-center text-sm text-text-secondary underline underline-offset-2"
        >
          Get the spreadsheet template
        </button>
      </div>
    </div>
  );
}
