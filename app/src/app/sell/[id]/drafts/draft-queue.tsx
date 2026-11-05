"use client";

// The draft queue (design: "3 · Draft queue", "IN 3 · Draft card"). One card
// at a time: the AI's name, category and description (all editable), a
// "Looks like X?" brand chip, then condition and price, which the seller
// picks. Every change autosaves; Publish puts the item live for buyers.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { CATEGORIES } from "@/lib/category";
import { formatMoney, currencySymbol, type Currency } from "@/lib/money";
import { CONDITION_LABELS, formatMonthYear, parsePriceToCents } from "@/lib/format";
import { priceSteps } from "@/lib/price-steps";
import { QUEUE_CONDITIONS, missingForPublish, isReady } from "@/lib/draft-queue";
import { answerBrandGuess, publishDrafts, saveDraftFields, type DraftPatch } from "../actions";

export interface QueueCard {
  id: string;
  name: string;
  description: string;
  category: string | null;
  condition: string | null;
  priceCents: number | null;
  isFree: boolean;
  photoUrls: string[];
  originalPriceCents: number | null;
  boughtDate: string | null;
  brandGuess: string | null; // null once answered
  aiDrafted: boolean;
  needsDraft: boolean; // no AI draft yet, or the last one failed
}

// Catch-up AI drafts run at most this many at once, as on the seller home.
const CATCH_UP = 5;

const chip = "flex h-[30px] items-center rounded-full border border-border-alt bg-bg-main px-3 text-[13px]";
const pick = (on: boolean) =>
  `h-[42px] rounded-full border text-[15px] font-medium ${
    on ? "border-text-primary bg-text-primary text-white" : "border-border-alt bg-white text-text-primary"
  }`;

export function DraftQueue({
  listingId,
  slug,
  currency,
  initialCards,
}: {
  listingId: string;
  slug: string;
  currency: Currency;
  initialCards: QueueCard[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [at, setAt] = useState(0);
  const [drafting, setDrafting] = useState<ReadonlySet<string>>(
    () => new Set(initialCards.filter((c) => c.needsDraft).map((c) => c.id)),
  );
  const [publishedCount, setPublishedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function requestDraft(id: string) {
    try {
      const res = await fetch(`/sell/${listingId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<QueueCard>;
      if (res.ok) {
        setCards((cs) =>
          cs.map((c) =>
            c.id === id
              ? {
                  ...c,
                  name: data.name ?? c.name,
                  description: data.description ?? c.description,
                  category: data.category ?? c.category,
                  originalPriceCents: data.originalPriceCents ?? c.originalPriceCents,
                  boughtDate: data.boughtDate ?? c.boughtDate,
                  brandGuess: data.brandGuess ?? null,
                  aiDrafted: true,
                }
              : c,
          ),
        );
      }
    } catch {
      // network blip: the seller can fill the card in by hand
    } finally {
      setDrafting((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  // AI-draft anything the camera loop didn't finish (tab closed mid-draft, or
  // a failed call). The card stays read-only until its draft lands, so an AI
  // result can't overwrite what the seller is typing.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const queue = initialCards.filter((c) => c.needsDraft).map((c) => c.id);
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) await requestDraft(id);
    };
    for (let i = 0; i < CATCH_UP; i++) void worker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card = cards[Math.min(at, cards.length - 1)] as QueueCard | undefined;
  const readyIds = cards.filter(isReady).map((c) => c.id);

  const patchCard = (id: string, patch: Partial<QueueCard>) =>
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  async function save(id: string, local: Partial<QueueCard>, patch: DraftPatch) {
    setError(null);
    patchCard(id, local);
    const res = await saveDraftFields(listingId, id, patch).catch(() => null);
    if (!res?.ok) setError(res?.error ?? "Couldn't save. Check your connection and try again.");
  }

  async function publish(ids: string[]) {
    setBusy(true);
    setError(null);
    const res = await publishDrafts(listingId, ids).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(res?.error ?? "Couldn't publish. Check your connection and try again.");
      return;
    }
    const gone = new Set(res.published);
    const before = card ? cards.findIndex((c) => c.id === card.id) : 0;
    const left = cards.filter((c) => !gone.has(c.id));
    // Stay on the same slot, which now holds the next draft.
    const kept = cards.slice(0, before).filter((c) => !gone.has(c.id)).length;
    setCards(left);
    setAt(left.length ? kept % left.length : 0);
    setPublishedCount((n) => n + gone.size);
    if (gone.size < ids.length) setError("Some drafts still need a condition or a price.");
  }

  if (!card) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8 pt-20">
        <Check className="size-10 text-forest" aria-hidden />
        <h1 className="mt-4 font-serif text-[34px] font-semibold leading-[1.05] text-text-primary">
          {publishedCount ? "Your items are live" : "No drafts to finish"}
        </h1>
        <p className="mt-3 text-[15px] leading-normal text-text-secondary">
          {publishedCount
            ? `${publishedCount} ${publishedCount === 1 ? "item is" : "items are"} now on your sale page for buyers.`
            : "Take photos of your things and they'll show up here to finish."}
        </p>
        <div className="flex-1" />
        <Link
          href={`/r/${slug}`}
          className="flex h-[52px] items-center justify-center rounded-full border border-border-alt bg-white text-base font-medium text-text-primary"
        >
          See your sale page
        </Link>
        <Link
          href={`/sell/${listingId}`}
          className="mt-3 flex h-[52px] items-center justify-center rounded-full bg-brand-hover text-base font-medium text-white hover:bg-crimson"
        >
          Back to your sale
        </Link>
      </div>
    );
  }

  const index = cards.indexOf(card);
  const locked = drafting.has(card.id);
  const missing = missingForPublish(card);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-6 pt-3">
      <div className="flex items-center justify-between px-1">
        <Link
          href={`/sell/${listingId}`}
          aria-label="Close"
          className="-ml-1 flex size-11 items-center text-text-primary"
        >
          <X className="size-[22px]" aria-hidden />
        </Link>
        <span className="text-[15px] font-medium text-text-primary">
          Draft {index + 1} of {cards.length}
        </span>
        <span className="min-w-11 whitespace-nowrap text-right text-[13px] font-medium text-forest">
          {readyIds.length} ready
        </span>
      </div>
      <div className="mx-1 mt-2 h-1 rounded-full bg-border-weave">
        <div
          className="h-1 rounded-full bg-forest transition-[width]"
          style={{ width: `${((index + 1) / cards.length) * 100}%` }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-sm text-crimson">
          {error}
        </p>
      )}

      <div className="mt-3.5 flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <Photos key={`photos-${card.id}`} photos={card.photoUrls} alt={card.name} aiDrafted={card.aiDrafted} />

        {locked ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-sm text-text-secondary">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Drafting…
          </div>
        ) : (
          <CardFields
            key={`fields-${card.id}`}
            card={card}
            currency={currency}
            onSave={(local, patch) => save(card.id, local, patch)}
            onBrand={async (yes) => {
              patchCard(card.id, { brandGuess: null });
              const res = await answerBrandGuess(listingId, card.id, yes).catch(() => null);
              if (res?.ok) patchCard(card.id, { name: res.name });
              else setError(res?.error ?? "Couldn't save. Check your connection and try again.");
            }}
          />
        )}
      </div>

      {!locked && missing.length > 0 && (
        <p className="mt-3 text-center text-[13px] text-text-secondary">
          Still needs {missing.join(" and ").replace(/ and (?=.* and )/g, ", ")}.
        </p>
      )}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => setAt((index + 1) % cards.length)}
          disabled={busy || cards.length < 2}
          className="h-[52px] flex-1 rounded-full border border-border-alt bg-white text-base font-medium text-text-primary disabled:opacity-50"
        >
          Later
        </button>
        <button
          type="button"
          onClick={() => publish([card.id])}
          disabled={busy || locked || missing.length > 0}
          className="flex h-[52px] flex-[2] items-center justify-center gap-2 rounded-full bg-forest text-base font-medium text-white disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-[18px] animate-spin" aria-hidden />
          ) : (
            <Check className="size-[18px]" aria-hidden />
          )}
          {busy ? "Publishing…" : "Looks good · publish"}
        </button>
      </div>
      {readyIds.length > 1 && (
        <button
          type="button"
          onClick={() => publish(readyIds)}
          disabled={busy}
          className="mt-2.5 self-center py-1 text-sm text-text-secondary underline underline-offset-2 disabled:opacity-50"
        >
          Publish all {readyIds.length} ready
        </button>
      )}
    </div>
  );
}

function Photos({ photos, alt, aiDrafted }: { photos: string[]; alt: string; aiDrafted: boolean }) {
  const [active, setActive] = useState(0);
  return (
    <div className="relative h-[200px] shrink-0 bg-bg-card">
      <div
        className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {photos.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={i === 0 ? alt : ""}
            className="h-full w-full shrink-0 snap-center object-contain"
          />
        ))}
      </div>
      {aiDrafted && (
        <span className="absolute left-3 top-3 flex h-7 items-center gap-1.5 rounded-full border border-insight-border bg-insight-bg px-2.5 text-xs font-medium text-ochre-dark">
          <Sparkles className="size-[13px]" aria-hidden />
          Drafted by AI · check it
        </span>
      )}
      {photos.length > 1 && (
        <span className="absolute bottom-3 right-3 flex h-[26px] items-center rounded-full bg-black/60 px-2.5 text-xs text-white">
          {active + 1} of {photos.length}
        </span>
      )}
    </div>
  );
}

function CardFields({
  card,
  currency,
  onSave,
  onBrand,
}: {
  card: QueueCard;
  currency: Currency;
  onSave: (local: Partial<QueueCard>, patch: DraftPatch) => void;
  onBrand: (yes: boolean) => void;
}) {
  const [editing, setEditing] = useState<"name" | "description" | null>(null);
  const steps = priceSteps(card.category, currency);
  // Text in the "Other…" box while it's open; a saved price that isn't one of
  // the steps (or stopped being one after a category change) shows there too.
  const [otherText, setOtherText] = useState<string | null>(null);
  const offStep = !card.isFree && card.priceCents != null && !steps.includes(card.priceCents);
  const other = otherText ?? (offStep ? String(card.priceCents! / 100) : null);
  const setOther = setOtherText;

  const bought = [
    card.boughtDate && `Bought ${formatMonthYear(card.boughtDate)}`,
    card.originalPriceCents != null && `${card.boughtDate ? "" : "Paid "}${formatMoney(card.originalPriceCents, currency)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const setPrice = (priceCents: number | null) =>
    onSave(
      { isFree: priceCents == null, priceCents },
      { price: { isFree: priceCents == null, priceCents } },
    );

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 px-4 pt-3.5">
        {editing === "name" ? (
          <input
            autoFocus
            defaultValue={card.name}
            maxLength={80}
            aria-label="Name"
            enterKeyHint="done"
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== card.name) onSave({ name }, { name });
              setEditing(null);
            }}
            className="w-full rounded-lg border border-border-alt px-2 py-1 font-serif text-[25px] font-semibold leading-[1.1] text-text-primary outline-none focus:border-text-secondary"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing("name")}
            className="flex items-start justify-between gap-3 text-left text-text-primary"
          >
            <span className="font-serif text-[25px] font-semibold leading-[1.1]">{card.name}</span>
            <Pencil className="mt-1 size-[18px] shrink-0 text-text-secondary" aria-label="Edit name" />
          </button>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <label className={`${chip} relative gap-1 pr-2`}>
            <span className="sr-only">Category</span>
            <select
              value={card.category ?? ""}
              onChange={(e) => onSave({ category: e.target.value }, { category: e.target.value })}
              className="appearance-none bg-transparent pr-3 outline-none"
            >
              {!card.category && <option value="">Pick a category</option>}
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-2.5 text-[10px] text-text-secondary">▾</span>
          </label>
          {bought && <span className={chip}>{bought}</span>}
          {card.brandGuess && (
            <span className="flex h-[30px] items-center gap-1 rounded-full border border-dashed border-ochre bg-insight-bg pl-3 pr-1 text-[13px]">
              Looks like {card.brandGuess}?
              <button
                type="button"
                aria-label={`Yes, it's ${card.brandGuess}`}
                onClick={() => onBrand(true)}
                className="flex size-[26px] items-center justify-center rounded-full bg-white text-forest"
              >
                <Check className="size-3.5" strokeWidth={2.6} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`No, not ${card.brandGuess}`}
                onClick={() => onBrand(false)}
                className="flex size-[26px] items-center justify-center rounded-full text-text-secondary"
              >
                <X className="size-3" strokeWidth={2.6} aria-hidden />
              </button>
            </span>
          )}
        </div>

        {editing === "description" ? (
          <textarea
            autoFocus
            defaultValue={card.description}
            maxLength={1000}
            aria-label="Description"
            rows={3}
            onBlur={(e) => {
              const description = e.target.value.trim();
              if (description !== card.description) onSave({ description }, { description });
              setEditing(null);
            }}
            className="w-full resize-none rounded-lg border border-border-alt px-2 py-1.5 text-sm leading-[1.45] text-text-primary outline-none focus:border-text-secondary"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing("description")}
            className="line-clamp-3 text-left text-sm leading-[1.45] text-text-secondary"
          >
            {card.description || "Add a description (optional)"}
          </button>
        )}
      </div>

      <div className="mx-4 mt-3.5 h-px bg-border-weave" />

      <div role="group" aria-labelledby={`cond-${card.id}`} className="flex flex-col gap-2 px-4 pt-3">
        <div className="flex items-baseline justify-between">
          <span id={`cond-${card.id}`} className="text-[15px] font-bold">Condition</span>
          <span className="text-xs text-text-secondary">Photos hide wear, so you pick</span>
        </div>
        <div className="flex gap-1.5">
          {QUEUE_CONDITIONS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={card.condition === c}
              onClick={() => onSave({ condition: c }, { condition: c })}
              className={`flex-1 ${pick(card.condition === c)} text-sm`}
            >
              {CONDITION_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-labelledby={`price-${card.id}`} className="flex flex-col gap-2 px-4 pb-4 pt-3.5">
        <span id={`price-${card.id}`} className="text-[15px] font-bold">What&apos;s the price?</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={card.isFree}
            onClick={() => {
              setOther(null);
              setPrice(null);
            }}
            className={`h-[42px] rounded-full border px-4 text-[15px] font-medium ${
              card.isFree ? "border-text-primary bg-text-primary text-white" : "border-border-alt bg-white text-forest"
            }`}
          >
            Free
          </button>
          {steps.map((cents) => {
            const on = !card.isFree && card.priceCents === cents && other == null;
            return (
              <button
                key={cents}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setOther(null);
                  setPrice(cents);
                }}
                className={`px-3.5 ${pick(on)}`}
              >
                {formatMoney(cents, currency)}
              </button>
            );
          })}
          {other == null ? (
            <button
              type="button"
              onClick={() => setOther("")}
              className="h-[42px] rounded-full border border-dashed border-[#B5AFA5] bg-white px-3.5 text-[15px] font-medium text-text-secondary"
            >
              Other…
            </button>
          ) : (
            <label className="flex h-[42px] items-center gap-1 rounded-full border border-text-primary bg-white px-3.5 text-[15px] font-medium">
              <span aria-hidden>{currencySymbol(currency)}</span>
              <input
                autoFocus={other === ""}
                inputMode="decimal"
                aria-label="Other price"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                onBlur={() => {
                  const cents = parsePriceToCents(other);
                  if (cents && cents > 0) {
                    if (cents !== card.priceCents || card.isFree) setPrice(cents);
                  } else if (!other.trim()) setOther(null);
                  else setOther(offStep ? null : other); // unparseable: revert to the saved price
                }}
                placeholder="0"
                className="w-20 bg-transparent outline-none"
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
