"use client";

// Seller home items (designs "8a" Items, "8b" Add items sheet, "8c" Select,
// "B · Tap an item"). The live list with status lines and filter chips, Select
// mode for hiding and showing items in bulk, the item sheet (tap an item), and
// the Add items sheet. The Add sheet starts the camera loop, types one in (then
// opens it in the item sheet), or opens the spreadsheet or photo tool. The open
// item is in the address as ?item=<id>, so the phone's back button closes it
// and a reload reopens it.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, Images, PenLine, Plus, Sheet, FolderCheck, X } from "lucide-react";
import { downloadTemplate } from "@/components/csv-help";
import { currencySymbol, formatMoney, type Currency } from "@/lib/money";
import { suggestCategory } from "@/lib/category";
import { parsePriceToCents } from "@/lib/format";
import { groupByListed } from "@/lib/item-save";
import {
  filterCounts,
  homeStatus,
  matchesFilter,
  statusLine,
  type HomeFilter,
  type HomeItem,
  type HomeStatus,
} from "@/lib/seller-home";
import { createItem, setItemsListed } from "@/app/manage/[id]/actions";
import { CameraLoop, type CameraLoopHandle, type DraftSummary } from "./camera-loop";
import { ItemSheet } from "./item-sheet";

export type { HomeItem };

function itemParam(): string | null {
  return new URLSearchParams(window.location.search).get("item");
}

export function SellerItems({
  listingId,
  slug,
  currency,
  payDefaults,
  pickupFrom,
  initialItems,
  initialDrafts,
}: {
  listingId: string;
  slug: string;
  currency: Currency;
  payDefaults: { venmo: string | null; upi: string | null };
  pickupFrom: string | null; // the sale's default "available from" for new items
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
  const [openId, setOpenId] = useState<string | null>(null);
  const pushed = useRef(false); // did we add the ?item= history entry?
  const openItem = openId ? list.find((it) => it.id === openId) ?? null : null;

  // The address holds the open item: read it on load and on back/forward.
  useEffect(() => {
    const sync = () => {
      pushed.current = false;
      setOpenId(itemParam());
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function openSheet(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("item", id);
    window.history.pushState(null, "", url);
    pushed.current = true;
    setOpenId(id);
  }
  function closeSheet() {
    // Opened from the list: going back pops the entry we pushed. Opened from a
    // link or a reload: there's nothing to pop, so drop the param in place.
    if (pushed.current) window.history.back();
    else {
      const url = new URL(window.location.href);
      url.searchParams.delete("item");
      window.history.replaceState(null, "", url);
      setOpenId(null);
    }
  }

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
                    <button
                      type="button"
                      onClick={() => openSheet(it.id)}
                      className="flex w-full items-center gap-3 py-[11px] text-left text-text-primary"
                    >
                      {body}
                    </button>
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

      {openItem && (
        <ItemSheet
          key={openItem.id}
          listingId={listingId}
          slug={slug}
          currency={currency}
          payDefaults={payDefaults}
          item={openItem}
          onChange={(next) =>
            setList((l) =>
              l.map((it) =>
                it.id === next.id
                  ? { ...next, claimant: next.claim?.name ?? null, waiting: next.waitlist.length }
                  : it,
              ),
            )
          }
          onClose={closeSheet}
        />
      )}

      {sheetOpen && (
        <AddItemsSheet
          listingId={listingId}
          currency={currency}
          pickupFrom={pickupFrom}
          onCreated={(it) => {
            setList((l) => [it, ...l]);
            setSheetOpen(false);
            setFilter("all");
            openSheet(it.id);
          }}
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
  currency,
  pickupFrom,
  onCreated,
  onClose,
  onCamera,
  onGallery,
}: {
  listingId: string;
  currency: Currency;
  pickupFrom: string | null;
  onCreated: (it: HomeItem) => void;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const [typing, setTyping] = useState(false);

  const tools = [
    {
      href: `/sell/${listingId}/import`,
      icon: Sheet,
      title: "Import a spreadsheet",
      sub: "CSV from Sheets or Excel, or paste rows. Re-import updates items by name.",
    },
    {
      href: `/sell/${listingId}/photos`,
      icon: FolderCheck,
      title: "Match photos by filename",
      sub: "Pick many photos; “orange couch.jpg” goes to Orange couch.",
    },
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
          {tools.map(({ href, icon: Icon, title, sub }) => (
            <li key={href} className="border-b border-border-weave">
              <Link href={href} className="flex items-center gap-3 py-3 text-text-primary">
                <Icon className="size-[22px] shrink-0 text-text-secondary" strokeWidth={1.7} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{title}</span>
                  <span className="text-[13px] leading-[1.4] text-text-secondary">{sub}</span>
                </span>
                <ChevronRight className="size-[18px] shrink-0 text-text-secondary" aria-hidden />
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-expanded={typing}
              onClick={() => setTyping((v) => !v)}
              className="flex w-full items-center gap-3 py-3 text-left text-text-primary"
            >
              <PenLine className="size-[22px] shrink-0 text-text-secondary" strokeWidth={1.7} aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium">Type one in</span>
                <span className="text-[13px] leading-[1.4] text-text-secondary">Name and price now, photos later.</span>
              </span>
              <ChevronRight
                className={`size-[18px] shrink-0 text-text-secondary transition-transform ${typing ? "rotate-90" : ""}`}
                aria-hidden
              />
            </button>
            {typing && (
              <TypeOneIn listingId={listingId} currency={currency} pickupFrom={pickupFrom} onCreated={onCreated} />
            )}
          </li>
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

// "Type one in": a name and a price, then the new item opens in the item sheet
// for photos and the rest. It's shown to buyers straight away, as on /manage.
function TypeOneIn({
  listingId,
  currency,
  pickupFrom,
  onCreated,
}: {
  listingId: string;
  currency: Currency;
  pickupFrom: string | null;
  onCreated: (it: HomeItem) => void;
}) {
  const [name, setName] = useState("");
  const [free, setFree] = useState(false);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = free ? null : parsePriceToCents(price);
    if (!name.trim()) return setError("Give it a name.");
    if (!free && (cents == null || cents <= 0)) return setError("Add a price, or pick Free.");
    setBusy(true);
    setError(null);
    const fields = {
      name: name.trim(),
      description: null,
      condition: null,
      priceCents: cents,
      isFree: cents == null,
      boughtDate: null,
      originalPriceCents: null,
      originalBoxIncluded: null,
      availableFrom: pickupFrom ?? new Date().toISOString().slice(0, 10),
      category: suggestCategory(name),
      venmoHandle: null,
      venmoLink: null,
      upiId: null,
      photoUrls: [],
    };
    const res = await createItem(listingId, fields, true).catch(() => ({ ok: false as const, error: "" }));
    setBusy(false);
    if (!res.ok) return setError("Couldn't add it. Check your connection and try again.");
    onCreated({
      ...fields,
      id: res.itemId,
      slug: res.slug,
      photoUrl: null,
      listed: true,
      sold: false,
      claimant: null,
      waiting: 0,
      claim: null,
      soldTo: null,
      waitlist: [],
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 pb-4">
      <label className="flex flex-col gap-1">
        <span className="text-[13px] text-text-secondary">Name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Grey 3-seat sofa"
          className="w-full rounded-lg border border-border-alt bg-white px-3 py-2.5 text-[15px] text-text-primary outline-none focus:border-text-primary"
        />
      </label>
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[13px] text-text-secondary">Price</span>
          <span className="flex items-center rounded-lg border border-border-alt bg-white pl-3 focus-within:border-text-primary">
            <span className="text-[15px] text-text-secondary" aria-hidden>{currencySymbol(currency)}</span>
            <input
              inputMode="decimal"
              value={free ? "" : price}
              disabled={free}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={free ? "Free" : "0"}
              className="w-full bg-transparent px-1 py-2.5 text-[15px] text-text-primary outline-none disabled:opacity-60"
            />
          </span>
        </label>
        <button
          type="button"
          aria-pressed={free}
          onClick={() => setFree((v) => !v)}
          className={`h-[46px] rounded-full border px-4 text-sm font-medium ${
            free ? "border-text-primary bg-text-primary text-white" : "border-border-alt bg-white text-forest"
          }`}
        >
          Free
        </button>
      </div>
      {error && <p role="alert" className="text-[13px] text-crimson">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="h-12 rounded-full bg-text-primary text-[15px] font-medium text-white disabled:opacity-60"
      >
        {busy ? "Adding…" : "Add item"}
      </button>
    </form>
  );
}
