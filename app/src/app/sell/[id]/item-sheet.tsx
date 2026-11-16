"use client";

// Item sheet on the seller home (design "B · Tap an item"). Tapping an item in
// the list opens it here instead of jumping to /manage: photos (Edit mode to
// remove or pick the cover), the claim panel, price, condition, name and
// details, who gets paid, and Shown to buyers. Every change saves as it's
// made, through the same actions /manage uses, one at a time so a slow save
// can't land after a newer one.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { CATEGORIES } from "@/lib/category";
import { contactHref, formatContact } from "@/lib/contact";
import { CONDITION_LABELS, formatDate, parsePriceToCents, type ItemCondition } from "@/lib/format";
import { currencySymbol, formatMoney, type Currency } from "@/lib/money";
import { MAX_PHOTOS } from "@/lib/photos";
import { uploadPhotos } from "@/lib/photo-upload";
import { priceSteps } from "@/lib/price-steps";
import { isValidUpi } from "@/lib/upi";
import type { ActionResult } from "@/lib/with-listing";
import {
  isoToMonth,
  makeCover,
  monthToIso,
  paidToSummary,
  removePhoto,
  sheetConditions,
  venmoUsername,
} from "@/lib/item-sheet";
import {
  markSold,
  patchItem,
  releaseClaim,
  setItemsListed,
  undoSold,
  type ItemFields,
} from "@/app/manage/[id]/actions";
import type { HomeItem } from "./seller-items";

type SaveState = "idle" | "saving" | "saved" | "error";

function toFields(it: HomeItem): ItemFields {
  return {
    name: it.name,
    description: it.description,
    condition: it.condition,
    priceCents: it.priceCents,
    isFree: it.isFree,
    boughtDate: it.boughtDate,
    originalPriceCents: it.originalPriceCents,
    originalBoxIncluded: it.originalBoxIncluded,
    availableFrom: it.availableFrom,
    category: it.category,
    venmoHandle: it.venmoHandle,
    venmoLink: it.venmoLink,
    upiId: it.upiId,
    photoUrls: it.photoUrls,
  };
}

const pill = (on: boolean) =>
  `h-10 rounded-full border px-3.5 text-sm ${
    on ? "border-text-primary bg-text-primary font-medium text-white" : "border-border-alt bg-white text-text-primary"
  }`;

const field =
  "w-full rounded-lg border border-border-alt bg-white px-3 py-2.5 text-[15px] text-text-primary outline-none focus:border-text-primary";

export function ItemSheet({
  listingId,
  slug,
  currency,
  payDefaults,
  item: initial,
  onChange,
  onClose,
}: {
  listingId: string;
  slug: string;
  currency: Currency;
  payDefaults: { venmo: string | null; upi: string | null };
  item: HomeItem;
  onChange: (it: HomeItem) => void;
  onClose: () => void;
}) {
  const [item, setItem] = useState(initial);
  const itemRef = useRef(initial);
  const [save, setSave] = useState<SaveState>("idle");
  const router = useRouter();
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [open, setOpen] = useState<"about" | "pay" | null>(null);
  const [editingPhotos, setEditingPhotos] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoToast, setPhotoToast] = useState<string[] | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [otherText, setOtherText] = useState<string | null>(null);
  const [upiError, setUpiError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // Saves run one after another; the status pill shows the latest outcome.
  // refresh: the change moves the tab counts (claims), so re-read the shell.
  function run(fn: () => Promise<ActionResult>, refresh = false) {
    setSave("saving");
    chain.current = chain.current
      .then(fn)
      .then((r) => {
        if (!r.ok) throw new Error(r.error);
        setSave("saved");
        if (refresh) router.refresh();
      })
      .catch(() => setSave("error"));
  }

  // Change the item locally (and in the list behind the sheet). With persist,
  // also save every editable field.
  function update(patch: Partial<HomeItem>, persist = true) {
    const next = { ...itemRef.current, ...patch };
    itemRef.current = next;
    setItem(next);
    onChange(next);
    if (persist) run(() => patchItem(listingId, next.id, toFields(next)));
  }
  const commit = () => run(() => patchItem(listingId, itemRef.current.id, toFields(itemRef.current)));

  // ---------- photos
  async function addPhotos(files: File[]) {
    const room = MAX_PHOTOS - itemRef.current.photoUrls.length;
    const take = files.filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (take.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadPhotos(take);
      const next = [...itemRef.current.photoUrls, ...urls].slice(0, MAX_PHOTOS);
      update({ photoUrls: next, photoUrl: next[0] ?? null });
    } catch {
      setSave("error");
    } finally {
      setUploading(false);
    }
  }
  function setPhotos(next: string[]) {
    update({ photoUrls: next, photoUrl: next[0] ?? null });
  }
  function remove(url: string) {
    const before = itemRef.current.photoUrls;
    const next = removePhoto(before, url);
    if (next === before) return;
    setPhotos(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setPhotoToast(before);
    toastTimer.current = setTimeout(() => setPhotoToast(null), 6000);
  }

  // ---------- claim actions
  function sell() {
    const c = itemRef.current.claim;
    update({ sold: true, soldTo: c?.name ?? null, claim: null, claimant: null }, false);
    run(() => markSold(listingId, item.id), true);
  }
  function release() {
    setConfirmRelease(false);
    update({ claim: null, claimant: null }, false);
    run(() => releaseClaim(listingId, item.id), true);
  }
  function unsell() {
    update({ sold: false, soldTo: null }, false);
    run(() => undoSold(listingId, item.id), true);
  }
  function setListed(listed: boolean) {
    update({ listed }, false);
    run(() => setItemsListed(listingId, [item.id], listed));
  }

  // ---------- price
  const steps = priceSteps(item.category, currency);
  const offStep = !item.isFree && item.priceCents != null && !steps.includes(item.priceCents);
  const other = otherText ?? (offStep ? String(item.priceCents! / 100) : null);
  const setPrice = (priceCents: number | null) => update({ isFree: priceCents == null, priceCents });

  const claim = item.claim;
  const venmo = venmoUsername(item) ?? "";

  return (
    <div className="fixed inset-0 z-40" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name || "Item"}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-md flex-col overflow-y-auto rounded-t-[20px] [&>*]:shrink-0 bg-bg-main px-5 pb-8 pt-2.5"
      >
        <div className="h-1 w-10 shrink-0 self-center rounded-full bg-border-alt" aria-hidden />

        <div className="mt-3.5 flex items-start gap-3">
          <h2 className="min-w-0 flex-1 font-serif text-[28px] font-semibold leading-[1.1] text-text-primary">
            {item.name || "Untitled item"}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-hover text-text-primary"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-[13px] text-text-secondary" aria-live="polite">
          {save === "saving"
            ? "Saving…"
            : save === "error"
              ? <span className="text-crimson">Couldn&apos;t save. Check your connection and try again.</span>
              : save === "saved"
                ? `Saved${item.category ? ` · ${item.category}` : ""}`
                : item.category ?? "No category yet"}
        </p>

        {/* Photos */}
        <div className="mt-3.5 flex h-7 items-center">
          <span className="flex-1 text-sm font-medium text-text-primary">
            Photos · {item.photoUrls.length} of {MAX_PHOTOS}
          </span>
          {item.photoUrls.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setEditingPhotos((v) => !v);
                setPhotoToast(null);
              }}
              className="h-7 px-0.5 text-sm font-bold text-brand-hover"
            >
              {editingPhotos ? "Done" : "Edit"}
            </button>
          )}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 pr-2 pt-2">
          {item.photoUrls.map((url, i) => (
            <div key={url} className="flex w-[72px] shrink-0 flex-col items-center gap-1">
              <span className="relative block size-[72px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={i === 0 ? "Cover photo" : `Photo ${i + 1}`} className="size-[72px] rounded-[10px] object-cover" />
                {i === 0 && (
                  <span className="absolute inset-x-0 bottom-0 rounded-b-[10px] bg-brand-hover text-center text-[10px] font-bold tracking-[0.06em] text-white">
                    COVER
                  </span>
                )}
                {editingPhotos && item.photoUrls.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => remove(url)}
                    className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border-2 border-bg-main bg-text-primary text-white"
                  >
                    <X className="size-3" strokeWidth={3} aria-hidden />
                  </button>
                )}
              </span>
              {editingPhotos && i > 0 && (
                <button
                  type="button"
                  onClick={() => setPhotos(makeCover(item.photoUrls, url))}
                  className="h-6 text-xs font-medium text-brand-hover"
                >
                  Make cover
                </button>
              )}
            </div>
          ))}
          {!editingPhotos && item.photoUrls.length < MAX_PHOTOS && (
            <button
              type="button"
              aria-label="Add photos"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex size-[72px] shrink-0 items-center justify-center rounded-[10px] border border-dashed border-border-alt text-2xl text-text-secondary disabled:opacity-60"
            >
              {uploading ? <span className="text-xs">Adding…</span> : "+"}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addPhotos(files);
            }}
          />
        </div>
        {photoToast && (
          <div role="status" className="mt-2.5 flex h-11 items-center gap-2.5 rounded-[10px] bg-text-primary pl-3.5 pr-1.5 text-sm text-white">
            <span className="flex-1">Photo removed</span>
            <button
              type="button"
              onClick={() => {
                setPhotos(photoToast);
                setPhotoToast(null);
              }}
              className="h-8 px-3 font-bold underline underline-offset-4"
            >
              Undo
            </button>
          </div>
        )}

        {/* Claim panel */}
        {item.sold ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-border-weave bg-white p-3.5">
            <span className="flex-1 text-[15px] font-bold text-text-primary">
              Sold{item.soldTo?.trim() ? ` to ${item.soldTo.trim()}` : ""}
            </span>
            <button
              type="button"
              onClick={unsell}
              className="h-10 rounded-full border border-border-alt bg-white px-4 text-sm font-medium text-text-primary"
            >
              Undo sold
            </button>
          </div>
        ) : claim ? (
          <div className="mt-4 rounded-xl border border-insight-border bg-insight-bg p-3.5">
            <div className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-ochre" aria-hidden />
              <span className="flex-1 text-[15px] font-bold text-text-primary">
                Claimed{claim.name.trim() ? ` by ${claim.name.trim()}` : ""}
              </span>
              {claim.claimedAt && (
                <span className="text-[13px] text-text-secondary">{formatDate(claim.claimedAt.slice(0, 10), currency)}</span>
              )}
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              <ContactLink contact={claim.contact} />
              {item.waitlist.length > 0 && ` · ${item.waitlist.length} on the waitlist`}
            </p>
            {confirmRelease ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-sm text-text-primary">
                  Release {claim.name.trim() ? `${claim.name.trim()}’s` : "this"} claim? The item goes back to Available.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={release} className="h-11 flex-1 rounded-full bg-text-primary text-sm font-medium text-white">
                    Release
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRelease(false)}
                    className="h-11 flex-1 rounded-full border border-border-alt bg-white text-sm font-medium text-text-primary"
                  >
                    Keep claim
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={sell} className="h-11 flex-1 rounded-full bg-forest text-sm font-medium text-white">
                  Mark sold
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRelease(true)}
                  className="h-11 flex-1 rounded-full border border-border-alt bg-white text-sm font-medium text-text-primary"
                >
                  Release claim
                </button>
              </div>
            )}
            <Waitlist list={item.waitlist} />
          </div>
        ) : item.waitlist.length > 0 ? (
          <div className="mt-4 rounded-xl border border-insight-border bg-insight-bg p-3.5">
            <p className="text-[15px] font-bold text-text-primary">{item.waitlist.length} on the waitlist</p>
            <Waitlist list={item.waitlist} />
          </div>
        ) : null}

        {/* Price */}
        <div role="group" aria-labelledby="sheet-price" className="mt-4">
          <span id="sheet-price" className="text-sm font-medium text-text-primary">Price</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={item.isFree}
              onClick={() => {
                setOtherText(null);
                setPrice(null);
              }}
              className={pill(item.isFree)}
            >
              Free
            </button>
            {steps.map((cents) => {
              const on = !item.isFree && item.priceCents === cents && other == null;
              return (
                <button
                  key={cents}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setOtherText(null);
                    setPrice(cents);
                  }}
                  className={pill(on)}
                >
                  {formatMoney(cents, currency)}
                </button>
              );
            })}
            {other == null ? (
              <button
                type="button"
                onClick={() => setOtherText("")}
                className="h-10 rounded-full border border-dashed border-border-alt bg-white px-3.5 text-sm text-text-secondary"
              >
                Other…
              </button>
            ) : (
              <label className="flex h-10 items-center gap-1 rounded-full border border-text-primary bg-white px-3.5 text-sm font-medium">
                <span aria-hidden>{currencySymbol(currency)}</span>
                <input
                  autoFocus={other === ""}
                  inputMode="decimal"
                  aria-label="Other price"
                  value={other}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  onBlur={() => {
                    const cents = parsePriceToCents(other);
                    if (cents && cents > 0) {
                      if (cents !== item.priceCents || item.isFree) setPrice(cents);
                    } else if (!other.trim()) setOtherText(null);
                    else setOtherText(offStep ? null : other);
                  }}
                  placeholder="0"
                  className="w-20 bg-transparent outline-none"
                />
              </label>
            )}
          </div>
        </div>

        {/* Condition */}
        <div role="group" aria-labelledby="sheet-cond" className="mt-3.5">
          <span id="sheet-cond" className="text-sm font-medium text-text-primary">Condition</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sheetConditions(item.condition).map((c: ItemCondition) => (
              <button
                key={c}
                type="button"
                aria-pressed={item.condition === c}
                onClick={() => update({ condition: c })}
                className={pill(item.condition === c)}
              >
                {CONDITION_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="mt-4 flex flex-col border-t border-border-weave">
          <Row label="Name, description, category" open={open === "about"} onToggle={() => setOpen(open === "about" ? null : "about")} />
          {open === "about" && (
            <div className="flex flex-col gap-3 border-b border-border-weave pb-4 pt-1">
              <Labeled label="Name">
                <input
                  className={field}
                  value={item.name}
                  onChange={(e) => update({ name: e.target.value }, false)}
                  onBlur={() => {
                    if (itemRef.current.name.trim()) commit();
                    else update({ name: initial.name }, false);
                  }}
                />
              </Labeled>
              <Labeled label="Description">
                <textarea
                  className={`${field} min-h-24 resize-y`}
                  value={item.description ?? ""}
                  onChange={(e) => update({ description: e.target.value || null }, false)}
                  onBlur={commit}
                />
              </Labeled>
              <Labeled label="Category">
                <select
                  className={field}
                  value={item.category ?? ""}
                  onChange={(e) => update({ category: e.target.value || null })}
                >
                  <option value="">No category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Labeled>

              <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">Details</p>
              <Labeled label="Available from">
                <input
                  type="date"
                  className={field}
                  value={item.availableFrom ?? ""}
                  onChange={(e) => update({ availableFrom: e.target.value || null })}
                />
              </Labeled>
              <div className="flex gap-3">
                <Labeled label="Bought">
                  <input
                    type="month"
                    className={field}
                    value={isoToMonth(item.boughtDate)}
                    onChange={(e) => update({ boughtDate: monthToIso(e.target.value) })}
                  />
                </Labeled>
                <Labeled label="Paid new">
                  <OriginalPrice
                    key={item.originalPriceCents ?? "none"}
                    cents={item.originalPriceCents}
                    currency={currency}
                    onSave={(c) => update({ originalPriceCents: c })}
                  />
                </Labeled>
              </div>
              <label className="flex items-center gap-2.5 text-[15px] text-text-primary">
                <input
                  type="checkbox"
                  checked={item.originalBoxIncluded === true}
                  onChange={(e) => update({ originalBoxIncluded: e.target.checked })}
                  className="size-5 accent-text-primary"
                />
                Comes with the original box
              </label>
            </div>
          )}

          <Row
            label="Paid to"
            value={paidToSummary(item, payDefaults, currency)}
            open={open === "pay"}
            onToggle={() => setOpen(open === "pay" ? null : "pay")}
          />
          {open === "pay" && (
            <div className="flex flex-col gap-1.5 border-b border-border-weave pb-4 pt-1">
              {currency === "INR" ? (
                <Labeled label="UPI ID for this item">
                  <input
                    className={field}
                    value={item.upiId ?? ""}
                    placeholder={payDefaults.upi ?? "name@bank"}
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(e) => {
                      setUpiError(false);
                      update({ upiId: e.target.value || null }, false);
                    }}
                    onBlur={() => {
                      const id = itemRef.current.upiId;
                      if (id && !isValidUpi(id)) setUpiError(true);
                      else commit();
                    }}
                  />
                </Labeled>
              ) : (
                <Labeled label="Venmo username for this item">
                  <span className="flex items-center rounded-lg border border-border-alt bg-white pl-3 focus-within:border-text-primary">
                    <span className="text-[15px] text-text-secondary" aria-hidden>@</span>
                    <input
                      className="w-full bg-transparent px-1 py-2.5 text-[15px] text-text-primary outline-none"
                      value={venmo}
                      placeholder={payDefaults.venmo?.replace(/^@+/, "") ?? "username"}
                      autoCapitalize="none"
                      autoCorrect="off"
                      onChange={(e) => update({ venmoHandle: e.target.value || null, venmoLink: null }, false)}
                      onBlur={commit}
                    />
                  </span>
                </Labeled>
              )}
              {upiError ? (
                <p className="text-[13px] text-crimson">That doesn&apos;t look like a UPI ID. It looks like name@bank.</p>
              ) : (
                <p className="text-[13px] text-text-secondary">Leave it empty to use the sale&apos;s default.</p>
              )}
            </div>
          )}

          <label className="flex h-12 items-center border-b border-border-weave text-[15px] text-text-primary">
            <span className="flex-1">Shown to buyers</span>
            <button
              type="button"
              role="switch"
              aria-checked={item.listed}
              aria-label="Shown to buyers"
              onClick={() => setListed(!item.listed)}
              className={`relative h-[26px] w-11 rounded-full transition-colors ${item.listed ? "bg-forest" : "bg-border-alt"}`}
            >
              <span
                className={`absolute top-[3px] size-5 rounded-full bg-white transition-[left] ${item.listed ? "left-[21px]" : "left-[3px]"}`}
              />
            </button>
          </label>
        </div>

        {/* Same tab, client-side, so an autosave still in flight finishes; Back reopens this sheet. */}
        <Link
          href={`/r/${slug}/${item.slug}`}
          className="mt-5 self-center text-sm text-text-secondary underline underline-offset-2"
        >
          View as a buyer
        </Link>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  open,
  onToggle,
}: {
  label: string;
  value?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex h-12 items-center gap-2 text-left text-[15px] text-text-primary ${open ? "" : "border-b border-border-weave"}`}
    >
      <span className="flex-1">{label}</span>
      {value && <span className="min-w-0 truncate text-sm text-text-secondary">{value}</span>}
      <ChevronDown
        className={`size-[18px] shrink-0 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden
      />
    </button>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[13px] text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function OriginalPrice({
  cents,
  currency,
  onSave,
}: {
  cents: number | null;
  currency: Currency;
  onSave: (cents: number | null) => void;
}) {
  const [text, setText] = useState(cents != null ? String(cents / 100) : "");
  return (
    <span className="flex items-center rounded-lg border border-border-alt bg-white pl-3 focus-within:border-text-primary">
      <span className="text-[15px] text-text-secondary" aria-hidden>{currencySymbol(currency)}</span>
      <input
        inputMode="decimal"
        className="w-full bg-transparent px-1 py-2.5 text-[15px] text-text-primary outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const next = text.trim() ? parsePriceToCents(text) : null;
          if (text.trim() && next == null) setText(cents != null ? String(cents / 100) : "");
          else if (next !== cents) onSave(next);
        }}
      />
    </span>
  );
}

export function ContactLink({ contact }: { contact: string }) {
  if (!contact) return <span>No contact</span>;
  const href = contactHref(contact);
  return href ? (
    <a href={href} className="text-brand-hover underline-offset-2 hover:underline">
      {formatContact(contact)}
    </a>
  ) : (
    <span>{contact}</span>
  );
}

function Waitlist({ list }: { list: { name: string; contact: string }[] }) {
  if (list.length === 0) return null;
  return (
    <ol className="mt-3 flex flex-col gap-1 border-t border-insight-border pt-2.5 text-[13px] text-text-secondary">
      {list.map((w, i) => (
        <li key={`${w.contact}-${i}`}>
          {i + 1}. {w.name.trim() || "Someone"} · <ContactLink contact={w.contact} />
        </li>
      ))}
    </ol>
  );
}
