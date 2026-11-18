"use client";

// Sale tab (design "D · Sale tab"): the things set once and rarely touched.
// Rows open in place. Details save as they're made (text on leaving the
// field) through the same patchListingDetails /manage uses; renaming the
// public link is a deliberate Update, as on /manage.

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { downloadTemplate } from "@/components/csv-help";
import { buildItemsCsv, type CsvExportItem } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import type { Currency } from "@/lib/money";
import type { SellerContact } from "@/lib/seller-contact";
import { typingVanitySlug } from "@/lib/slug";
import type { ActionResult } from "@/lib/with-listing";
import { patchListingDetails, setListingSlug } from "@/app/manage/[id]/actions";
import { setPaymentDefault } from "../actions";

export interface SaleSettingsProps {
  id: string;
  slug: string;
  title: string;
  intro: string;
  sellerContacts: SellerContact[];
  city: string;
  neighborhood: string;
  pickupFrom: string;
  pickupTo: string;
  currency: Currency;
  payDefault: string; // Venmo username (USD) or UPI ID (INR)
  exportItems: CsvExportItem[];
}

type Row = "pickup" | "dates" | "about" | "contacts" | "pay" | "link" | "sheet";
type SaveState = "idle" | "saving" | "saved" | "error";

const field =
  "w-full rounded-lg border border-border-alt bg-white px-3 py-2.5 text-[15px] text-text-primary outline-none focus:border-text-primary";

export function SaleSettings(p: SaleSettingsProps) {
  const router = useRouter();
  const [d, setD] = useState({
    title: p.title,
    intro: p.intro,
    sellerContacts: p.sellerContacts,
    city: p.city,
    neighborhood: p.neighborhood,
    pickupFrom: p.pickupFrom,
    pickupTo: p.pickupTo,
  });
  const dRef = useRef(d);
  const [open, setOpen] = useState<Row | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const chain = useRef<Promise<void>>(Promise.resolve());

  const [pay, setPay] = useState(p.payDefault);
  const [payError, setPayError] = useState<string | null>(null);
  const [slug, setSlug] = useState(p.slug);
  const [slugInput, setSlugInput] = useState(p.slug);
  const [slugMsg, setSlugMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [slugBusy, setSlugBusy] = useState(false);

  function run(fn: () => Promise<ActionResult>) {
    setSave("saving");
    chain.current = chain.current
      .then(fn)
      .then((r) => {
        if (!r.ok) throw new Error(r.error);
        setSave("saved");
        router.refresh(); // the header shows the title, place and date
      })
      .catch(() => setSave("error"));
  }

  function edit(patch: Partial<typeof d>, persist = false) {
    const next = { ...dRef.current, ...patch };
    dRef.current = next;
    setD(next);
    if (persist) commit();
  }
  function commit() {
    const v = dRef.current;
    if (!v.title.trim()) {
      edit({ title: p.title });
      return;
    }
    run(() =>
      patchListingDetails(p.id, {
        title: v.title,
        intro: v.intro.trim() || null,
        sellerContacts: v.sellerContacts,
        city: v.city.trim() || null,
        neighborhood: v.neighborhood.trim() || null,
        pickupFrom: v.pickupFrom || null,
        pickupTo: v.pickupTo || null,
      }),
    );
  }

  const contacts = d.sellerContacts;
  const setContacts = (next: SellerContact[], persist: boolean) => edit({ sellerContacts: next }, persist);

  async function savePay() {
    setPayError(null);
    if (pay.trim() === p.payDefault.trim()) return;
    setSave("saving");
    const res = await setPaymentDefault(p.id, pay).catch(() => ({ ok: false as const, error: "Couldn't save. Check your connection and try again." }));
    if (res.ok) {
      setPay(res.value ?? "");
      setSave("saved");
    } else {
      setPayError(res.error);
      setSave("idle");
    }
  }

  async function applySlug() {
    setSlugBusy(true);
    setSlugMsg(null);
    const res = await setListingSlug(p.id, slugInput);
    setSlugBusy(false);
    if (res.ok) {
      setSlug(res.slug);
      setSlugInput(res.slug);
      setSlugMsg({ ok: true, text: `Live at /r/${res.slug}. Your old link keeps working.` });
      router.refresh();
    } else setSlugMsg({ ok: false, text: res.error });
  }

  function downloadCsv() {
    const blob = new Blob([buildItemsCsv(p.exportItems)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mustgo-${slug || "listing"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const toggle = (r: Row) => setOpen(open === r ? null : r);
  const usd = p.currency === "USD";
  const place = [d.city.trim(), d.neighborhood.trim()].filter(Boolean).join(", ");
  const dates = [
    d.pickupFrom && formatDate(d.pickupFrom, p.currency),
    d.pickupTo && `to ${formatDate(d.pickupTo, p.currency)}`,
  ]
    .filter(Boolean)
    .join(" ");
  const nContacts = contacts.filter((c) => c.value.trim()).length;

  return (
    <div className="flex flex-col pb-6">
      <p className="mt-3 h-5 text-[13px] text-text-secondary" aria-live="polite">
        {save === "saving" ? (
          "Saving…"
        ) : save === "saved" ? (
          "Saved"
        ) : save === "error" ? (
          <span className="text-crimson">Couldn&apos;t save. Check your connection and try again.</span>
        ) : null}
      </p>

      <Heading>The sale</Heading>
      <Card>
        <Row label="Pickup" value={place || "Not set"} open={open === "pickup"} onToggle={() => toggle("pickup")} />
        {open === "pickup" && (
          <Panel>
            <Labeled label="Where's pickup?">
              <input className={field} value={d.city} onChange={(e) => edit({ city: e.target.value })} onBlur={commit} />
            </Labeled>
            <Labeled label="Neighborhood (optional)">
              <input className={field} value={d.neighborhood} onChange={(e) => edit({ neighborhood: e.target.value })} onBlur={commit} />
            </Labeled>
          </Panel>
        )}
        <Row label="Available from" value={dates || "Not set"} open={open === "dates"} onToggle={() => toggle("dates")} />
        {open === "dates" && (
          <Panel>
            <div className="flex gap-3">
              <Labeled label="From">
                <input type="date" className={field} value={d.pickupFrom} onChange={(e) => edit({ pickupFrom: e.target.value }, true)} />
              </Labeled>
              <Labeled label="Last pickup day">
                <input type="date" className={field} value={d.pickupTo} onChange={(e) => edit({ pickupTo: e.target.value }, true)} />
              </Labeled>
            </div>
            <p className="text-[13px] text-text-secondary">New items start out available from this date.</p>
          </Panel>
        )}
        <div className="flex h-[46px] items-center border-b border-border-weave text-[15px] text-text-primary">
          <span className="flex-1">Currency</span>
          <span className="text-sm text-text-secondary">{usd ? "$ US dollars" : "₹ Indian rupees"}</span>
        </div>
        <Row label="Name and intro" open={open === "about"} onToggle={() => toggle("about")} last />
        {open === "about" && (
          <Panel last>
            <Labeled label="Name of your sale">
              <input className={field} value={d.title} onChange={(e) => edit({ title: e.target.value })} onBlur={commit} />
            </Labeled>
            <Labeled label="Intro for buyers">
              <textarea
                className={`${field} min-h-24 resize-y`}
                value={d.intro}
                placeholder="Why you're selling, pickup details, anything helpful."
                onChange={(e) => edit({ intro: e.target.value })}
                onBlur={commit}
              />
            </Labeled>
          </Panel>
        )}
      </Card>

      <Heading>Buyers and payment</Heading>
      <Card>
        <Row
          label="How buyers reach you"
          value={nContacts === 0 ? "Not set" : nContacts === 1 ? "1 contact" : `${nContacts} contacts`}
          open={open === "contacts"}
          onToggle={() => toggle("contacts")}
        />
        {open === "contacts" && (
          <Panel>
            <p className="text-[13px] text-text-secondary">Buyers see these on your sale page.</p>
            {contacts.map((c, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border-weave p-2.5">
                <div className="flex gap-2">
                  <input
                    className={`${field} w-28 flex-none`}
                    value={c.name ?? ""}
                    placeholder="Name"
                    aria-label={`Contact ${i + 1} name`}
                    onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)), false)}
                    onBlur={commit}
                  />
                  <input
                    className={field}
                    value={c.value}
                    placeholder="Phone or email"
                    aria-label={`Contact ${i + 1} phone or email`}
                    onChange={(e) => setContacts(contacts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)), false)}
                    onBlur={commit}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={!!c.primary}
                    onClick={() => setContacts(contacts.map((x, j) => ({ ...x, primary: j === i })), true)}
                    className={`h-8 rounded-full border px-3 text-[13px] ${
                      c.primary ? "border-text-primary bg-text-primary text-white" : "border-border-alt bg-white text-text-primary"
                    }`}
                  >
                    {c.primary ? "Main contact" : "Make main contact"}
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    aria-label={`Remove contact ${i + 1}`}
                    onClick={() => setContacts(contacts.filter((_, j) => j !== i), true)}
                    className="flex size-9 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-hover"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setContacts([...contacts, { name: "", value: "" }], false)}
              className="h-10 self-start rounded-full border border-border-alt bg-white px-4 text-sm font-medium text-text-primary"
            >
              + Add a contact
            </button>
          </Panel>
        )}
        <Row
          label={usd ? "Pay with Venmo" : "Pay with UPI"}
          value={pay.trim() ? (usd ? `@${pay.replace(/^@+/, "")}` : pay) : "Not set"}
          open={open === "pay"}
          onToggle={() => toggle("pay")}
          last
        />
        {open === "pay" && (
          <Panel last>
            {usd ? (
              <Labeled label="Venmo username">
                <span className="flex items-center rounded-lg border border-border-alt bg-white pl-3 focus-within:border-text-primary">
                  <span className="text-[15px] text-text-secondary" aria-hidden>@</span>
                  <input
                    className="w-full bg-transparent px-1 py-2.5 text-[15px] text-text-primary outline-none"
                    value={pay.replace(/^@+/, "")}
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(e) => setPay(e.target.value)}
                    onBlur={savePay}
                  />
                </span>
              </Labeled>
            ) : (
              <Labeled label="UPI ID">
                <input
                  className={field}
                  value={pay}
                  placeholder="name@bank"
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(e) => setPay(e.target.value)}
                  onBlur={savePay}
                />
              </Labeled>
            )}
            <p className={`text-[13px] ${payError ? "text-crimson" : "text-text-secondary"}`}>
              {payError ?? "Used for every item. You can set a different one on an item."}
            </p>
          </Panel>
        )}
      </Card>

      <Heading>Link and tools</Heading>
      <Card>
        <Row label="Public link" value={`/r/${slug} · Rename`} open={open === "link"} onToggle={() => toggle("link")} />
        {open === "link" && (
          <Panel>
            <div className="flex items-center gap-2">
              <span className="text-[15px] text-text-secondary">/r/</span>
              <input
                className={field}
                value={slugInput}
                aria-label="New link"
                spellCheck={false}
                autoCapitalize="off"
                onChange={(e) => {
                  setSlugInput(typingVanitySlug(e.target.value));
                  setSlugMsg(null);
                }}
              />
              <button
                type="button"
                onClick={applySlug}
                disabled={slugBusy || !slugInput || slugInput === slug}
                className="h-11 shrink-0 rounded-full bg-brand-hover px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {slugBusy ? "Updating…" : "Update"}
              </button>
            </div>
            <p className={`text-[13px] ${slugMsg ? (slugMsg.ok ? "text-forest" : "text-crimson") : "text-text-secondary"}`}>
              {slugMsg?.text ?? "Letters, numbers and hyphens. Your old link and printed QR codes keep working."}
            </p>
          </Panel>
        )}
        <LinkRow href={`/r/${slug}/share`} label="QR sheet to print" />
        <Row label="Spreadsheet" value="Import · Export" open={open === "sheet"} onToggle={() => toggle("sheet")} />
        {open === "sheet" && (
          <Panel>
            <Link
              href={`/sell/${p.id}/import`}
              className="flex h-11 items-center justify-center rounded-full bg-text-primary text-sm font-medium text-white"
            >
              Import a spreadsheet
            </Link>
            <button
              type="button"
              onClick={downloadCsv}
              className="h-11 rounded-full border border-border-alt bg-white text-sm font-medium text-text-primary"
            >
              Download your items as CSV
            </button>
            <button type="button" onClick={downloadTemplate} className="self-center text-sm text-text-secondary underline underline-offset-2">
              Get the spreadsheet template
            </button>
            <p className="text-[13px] text-text-secondary">
              Re-importing updates items with the same name and adds new ones. Blank cells never overwrite, and nothing gets deleted.
            </p>
          </Panel>
        )}
        <LinkRow href={`/sell/${p.id}/photos`} label="Match photos by filename" last />
      </Card>

      <p className="mt-6 text-[13px] leading-[1.45] text-text-secondary">
        Bookmark this page. It&apos;s the key to your sale.
      </p>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">{children}</p>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="mt-1.5 flex flex-col rounded-xl border border-border-weave bg-white px-3.5">{children}</div>;
}

function Row({
  label,
  value,
  open,
  onToggle,
  last,
}: {
  label: string;
  value?: string;
  open: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex h-[46px] items-center gap-2 text-left text-[15px] text-text-primary ${
        open || last ? "" : "border-b border-border-weave"
      }`}
    >
      <span className="flex-1">{label}</span>
      {value && <span className="min-w-0 truncate text-sm text-text-secondary">{value}</span>}
      <ChevronDown className={`size-[18px] shrink-0 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
    </button>
  );
}

function LinkRow({ href, label, last }: { href: string; label: string; last?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex h-[46px] items-center text-[15px] text-text-primary ${last ? "" : "border-b border-border-weave"}`}
    >
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-[18px] text-text-secondary" aria-hidden />
    </Link>
  );
}

function Panel({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return <div className={`flex flex-col gap-3 pb-4 pt-1 ${last ? "" : "border-b border-border-weave"}`}>{children}</div>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[13px] text-text-secondary">{label}</span>
      {children}
    </label>
  );
}
