"use client";

// Soft-claim + waitlist UI for the item detail page.
//   listed:   idle / oneTap → form → claiming → success (claimed-by-you)
//   claimed:  takenByOther → (join) → form/one-tap → waitlisted (#N)
// idle, oneTap and takenByOther are a bar pinned to the bottom of the screen;
// the form opens in a bottom sheet; success and waitlisted show inline.
// Identity is browser-remembered (no account): localStorage holds {name,contact}
// (so later claims/joins are one-tap), the set of itemIds this device claimed
// (mustgo_claims), and the waitlist positions it holds (mustgo_waitlist) — so a
// revisit shows the right state without ever leaking other buyers' contacts.

import { useEffect, useRef, useState } from "react";
import {
  claimItem,
  unclaimItem,
  joinWaitlist,
  leaveWaitlist,
  type ClaimResult,
  type WaitlistResult,
} from "./actions";
import type { Payment } from "@/lib/payment";

const BUYER_KEY = "mustgo_buyer";
const CLAIMS_KEY = "mustgo_claims";
const WAITLIST_KEY = "mustgo_waitlist";

interface Buyer {
  name: string;
  contact: string;
}

function readBuyer(): Buyer | null {
  try {
    const raw = localStorage.getItem(BUYER_KEY);
    return raw ? (JSON.parse(raw) as Buyer) : null;
  } catch {
    return null;
  }
}

function readClaimed(): string[] {
  try {
    const raw = localStorage.getItem(CLAIMS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function readWaitlist(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WAITLIST_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

type Intent = "claim" | "waitlist";

type Mode =
  | "idle" // listed, no remembered buyer → Claim button
  | "form" // entering name + contact (claim or waitlist, per intent)
  | "oneTap" // listed, remembered buyer → one-tap "Claim as <name>"
  | "busy" // submitting claim or waitlist
  | "success" // claimed by this buyer
  | "takenByOther" // claimed by someone else → offer waitlist
  | "waitlisted"; // on the waitlist (#position)

export function ClaimButton({
  listingId,
  itemId,
  alreadyClaimed,
  payment,
  priceLabel,
  itemName,
  photoUrl,
}: {
  listingId: string;
  itemId: string;
  alreadyClaimed: boolean; // server: item.status !== "listed"
  payment: Payment | null; // Venmo (USD sale) or UPI (INR sale); null => none
  priceLabel: string; // "₹1,500"; payment is null for free items
  itemName: string; // shown at the top of the claim sheet
  photoUrl: string | null;
}) {
  // Seed from server truth so first paint (pre-hydration) is correct. The effect
  // below upgrades to the buyer-specific state (success / waitlisted).
  const [mode, setMode] = useState<Mode>(
    alreadyClaimed ? "takenByOther" : "idle",
  );
  const [intent, setIntent] = useState<Intent>("claim");
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [contactShown, setContactShown] = useState(""); // for success/waitlist copy
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnclaim, setConfirmUnclaim] = useState(false);
  const [unclaiming, setUnclaiming] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [fromForm, setFromForm] = useState(false); // busy came from the sheet (keep it open)
  const barRef = useRef<HTMLDivElement>(null);

  // Resolve the starting state from server truth + localStorage. Post-mount:
  // localStorage doesn't exist during SSR, so we render a neutral state first,
  // then sync. (Legitimate external-system sync.)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const remembered = readBuyer();
    setBuyer(remembered);
    if (remembered) {
      setName(remembered.name);
      setContactShown(remembered.contact);
    }
    if (alreadyClaimed) {
      if (readClaimed().includes(itemId)) {
        setMode("success");
      } else {
        const pos = readWaitlist()[itemId];
        if (pos != null) {
          setPosition(pos);
          setMode("waitlisted");
        } else {
          setMode("takenByOther");
        }
      }
    } else {
      setMode(remembered ? "oneTap" : "idle");
    }
  }, [alreadyClaimed, itemId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persistClaim = (b: Buyer) => {
    setBuyer(b); // so the bar offers one-tap right away after a release
    try {
      localStorage.setItem(BUYER_KEY, JSON.stringify(b));
      const claimed = readClaimed();
      if (!claimed.includes(itemId))
        localStorage.setItem(CLAIMS_KEY, JSON.stringify([...claimed, itemId]));
    } catch {
      /* private mode / storage full — non-fatal; success still shows */
    }
  };

  const persistWaitlist = (b: Buyer, pos: number) => {
    setBuyer(b);
    try {
      localStorage.setItem(BUYER_KEY, JSON.stringify(b));
      const w = readWaitlist();
      w[itemId] = pos;
      localStorage.setItem(WAITLIST_KEY, JSON.stringify(w));
    } catch {
      /* non-fatal */
    }
  };

  // Release this device's claim → back to one-tap (or idle).
  const unclaim = async () => {
    const c = (readBuyer()?.contact ?? contactShown).trim();
    if (!c) return;
    setUnclaiming(true);
    setError(null);
    let res: ClaimResult;
    try {
      res = await unclaimItem(listingId, itemId, c);
    } catch {
      res = { ok: false, reason: "taken" };
    }
    setUnclaiming(false);
    if (res.ok) {
      try {
        const claimed = readClaimed().filter((id) => id !== itemId);
        localStorage.setItem(CLAIMS_KEY, JSON.stringify(claimed));
      } catch {
        /* non-fatal */
      }
      setConfirmUnclaim(false);
      setMode(readBuyer() ? "oneTap" : "idle");
    } else {
      setError("Couldn't release the claim — please retry.");
    }
  };

  // Leave the waitlist → back to the "Claimed · join the waitlist" state.
  const leave = async () => {
    const c = (readBuyer()?.contact ?? contactShown).trim();
    if (!c) return;
    setLeaving(true);
    setError(null);
    let res: ClaimResult;
    try {
      res = await leaveWaitlist(listingId, itemId, c);
    } catch {
      res = { ok: false, reason: "notfound" };
    }
    setLeaving(false);
    if (res.ok) {
      try {
        const w = readWaitlist();
        delete w[itemId];
        localStorage.setItem(WAITLIST_KEY, JSON.stringify(w));
      } catch {
        /* non-fatal */
      }
      setConfirmLeave(false);
      setPosition(null);
      setMode("takenByOther");
    } else {
      setError("Couldn't leave the waitlist — please retry.");
    }
  };

  const submit = async (n: string, c: string, act: Intent) => {
    setError(null);
    setMode("busy");

    if (act === "waitlist") {
      let res: WaitlistResult;
      try {
        res = await joinWaitlist(listingId, itemId, n, c);
      } catch {
        res = { ok: false, reason: "invalid" };
      }
      if (res.ok) {
        persistWaitlist({ name: n.trim(), contact: c.trim() }, res.position);
        setContactShown(c.trim());
        setPosition(res.position);
        setMode("waitlisted");
        return;
      }
      if (res.reason === "available") {
        // Freed up while they were deciding — steer them to claim it.
        setIntent("claim");
        setMode(readBuyer() ? "oneTap" : "idle");
        setError("Good news — this is available now. Claim it!");
        return;
      }
      if (res.reason === "holder") {
        // They already hold the claim — show that, not a waitlist.
        setMode("success");
        return;
      }
      setIntent("waitlist");
      setMode("form");
      setError("Enter your name and a valid email or phone.");
      return;
    }

    // claim
    let res: ClaimResult;
    try {
      res = await claimItem(listingId, itemId, n, c);
    } catch {
      res = { ok: false, reason: "taken" }; // network/unknown → safe generic
    }
    if (res.ok) {
      persistClaim({ name: n.trim(), contact: c.trim() });
      setContactShown(c.trim());
      setMode("success");
      return;
    }
    if (res.reason === "taken") {
      // Someone else got it — offer the waitlist instead of a dead end.
      setMode("takenByOther");
      setError("Someone just claimed this. Join the waitlist to be next.");
    } else {
      setIntent("claim");
      setMode("form");
      setError("Enter your name and a valid email or phone.");
    }
  };

  // Start a waitlist join: one-tap if remembered, else the form.
  const startWaitlist = () => {
    setError(null);
    setIntent("waitlist");
    const remembered = readBuyer();
    setFromForm(!remembered);
    if (remembered) submit(remembered.name, remembered.contact, "waitlist");
    else setMode("form");
  };

  // Open the name + contact sheet for a claim or a waitlist join.
  const openForm = (act: Intent) => {
    setError(null);
    setIntent(act);
    setFromForm(true);
    setMode("form");
  };
  // Close the sheet without submitting: back to the bar it came from.
  const closeForm = () => {
    if (mode === "busy") return;
    setError(null);
    setMode(intent === "waitlist" ? "takenByOther" : readBuyer() ? "oneTap" : "idle");
  };
  // One-tap claim or join from the bar, with no sheet.
  const tap = (act: Intent) => {
    const b = readBuyer();
    if (!b) return openForm(act);
    setFromForm(false);
    setIntent(act);
    submit(b.name, b.contact, act);
  };

  // ---- render ----
  // While there's something to do (claim, or join the waitlist), a bar with
  // the price and the button stays pinned to the bottom of the screen (design
  // review change 2); the form opens in a sheet over the page. Once claimed or
  // waitlisted, the outcome shows inline and the bar goes away.
  const sheetOpen = mode === "form" || (mode === "busy" && fromForm);
  const barShown = mode === "idle" || mode === "oneTap" || mode === "takenByOther" || mode === "busy" || mode === "form";

  // The floating Contact button sits above the bar (components/contact-button).
  useEffect(() => {
    const root = document.documentElement;
    const el = barRef.current;
    if (!barShown || !el) {
      root.style.removeProperty("--claim-bar-h");
      return;
    }
    const set = () => root.style.setProperty("--claim-bar-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--claim-bar-h");
    };
  }, [barShown]);

  // The sheet: Escape closes it, and the page behind doesn't scroll.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeForm();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  });

  if (mode === "success") {
    return (
      <div
        className="mt-6 rounded-lg border border-forest/30 bg-forest/[0.07] p-4"
        role="status"
        aria-live="polite"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-forest">
          <span aria-hidden>✓</span> You claimed this
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
          The seller will contact you
          {contactShown ? (
            <>
              {" "}
              at <span className="font-medium text-text-primary">{contactShown}</span>
            </>
          ) : null}{" "}
          to set up pickup.
        </p>
        {error && (
          <p className="mt-2 text-xs text-crimson" role="alert">
            {error}
          </p>
        )}
        {payment?.kind === "venmo" && (
          <a
            href={payment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#008CFF] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Pay {payment.handle ?? "the owner"} on Venmo <span aria-hidden>→</span>
          </a>
        )}
        {payment?.kind === "upi" && <UpiPay payment={payment} priceLabel={priceLabel} />}
        <div className="mt-3 border-t border-forest/15 pt-2.5 text-xs">
          {confirmUnclaim ? (
            <span className="flex items-center gap-2 text-text-secondary">
              Change your mind?
              <button
                type="button"
                onClick={unclaim}
                disabled={unclaiming}
                className="font-medium text-crimson underline-offset-2 hover:underline disabled:opacity-60"
              >
                {unclaiming ? "Releasing…" : "Yes, release it"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmUnclaim(false)}
                disabled={unclaiming}
                className="text-text-muted underline-offset-2 hover:underline"
              >
                keep it
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmUnclaim(true)}
              className="text-text-muted underline-offset-2 hover:underline"
            >
              No longer need it? Release this claim
            </button>
          )}
        </div>
      </div>
    );
  }

  if (mode === "waitlisted") {
    return (
      <div
        className="mt-6 rounded-lg border border-forest/30 bg-forest/[0.07] p-4"
        role="status"
        aria-live="polite"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-forest">
          <span aria-hidden>✓</span> You&rsquo;re on the waitlist
          {position != null ? ` · #${position}` : ""}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
          If this item opens up, the seller will contact you
          {contactShown ? (
            <>
              {" "}
              at <span className="font-medium text-text-primary">{contactShown}</span>
            </>
          ) : null}
          .
        </p>
        {error && (
          <p className="mt-2 text-xs text-crimson" role="alert">
            {error}
          </p>
        )}
        <div className="mt-3 border-t border-forest/15 pt-2.5 text-xs">
          {confirmLeave ? (
            <span className="flex items-center gap-2 text-text-secondary">
              Leave the waitlist?
              <button
                type="button"
                onClick={leave}
                disabled={leaving}
                className="font-medium text-crimson underline-offset-2 hover:underline disabled:opacity-60"
              >
                {leaving ? "Leaving…" : "Yes, leave"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                disabled={leaving}
                className="text-text-muted underline-offset-2 hover:underline"
              >
                stay
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="text-text-muted underline-offset-2 hover:underline"
            >
              Leave the waitlist
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- the pinned bar (idle / oneTap / takenByOther / one-tap busy) ----
  const busy = mode === "busy";
  const waitlisting = intent === "waitlist";
  const taken = mode === "takenByOther" || (waitlisting && !sheetOpen);
  const oneTap = mode === "oneTap" && buyer;
  const firstName = buyer?.name.trim().split(/\s+/)[0] ?? "";
  const free = priceLabel === "Free";

  const barLabel = busy && !fromForm
    ? waitlisting
      ? "Joining…"
      : "Claiming…"
    : taken
      ? "Join the waitlist"
      : oneTap
        ? `Claim as ${firstName}`
        : "Claim this item";

  return (
    <>
      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border-weave bg-bg-main/95 backdrop-blur print:hidden"
      >
        <div className="mx-auto max-w-xl px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {error && !sheetOpen && (
            <p
              className={`mb-2 text-center text-xs ${error.startsWith("Good news") ? "text-forest" : "text-crimson"}`}
              role="status"
            >
              {error}
            </p>
          )}
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p
                className={`font-serif text-2xl font-semibold leading-none ${
                  taken ? "text-text-muted" : free ? "text-forest" : "text-text-primary"
                }`}
              >
                {priceLabel}
              </p>
              <p className="mt-1 truncate text-xs text-text-secondary">
                {taken ? (
                  "Claimed · be next in line"
                ) : oneTap ? (
                  <>
                    {buyer.contact} ·{" "}
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          localStorage.removeItem(BUYER_KEY);
                        } catch {}
                        setBuyer(null);
                        setName("");
                        setContact("");
                        openForm("claim");
                      }}
                      className="text-brand-hover underline-offset-2 hover:underline"
                    >
                      not you?
                    </button>
                  </>
                ) : (
                  "No account needed"
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => (taken ? startWaitlist() : oneTap ? tap("claim") : openForm("claim"))}
              className={`h-12 shrink-0 rounded-xl px-5 text-[15px] font-semibold transition-colors disabled:opacity-70 ${
                taken
                  ? "bg-text-primary text-white hover:bg-text-primary/90"
                  : "bg-brand text-white hover:bg-brand-hover"
              }`}
            >
              {barLabel}
            </button>
          </div>
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label={waitlisting ? "Join the waitlist" : "Claim this item"}>
          <button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            onClick={closeForm}
            className="absolute inset-0 cursor-default bg-black/45"
          />
          <form
            className="absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-2xl bg-bg-main px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) submit(name, contact, intent);
            }}
          >
            <div aria-hidden className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-border-alt" />
            <div className="flex items-center gap-3">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="size-[52px] shrink-0 rounded-[10px] object-cover" />
              ) : (
                <span className="grid size-[52px] shrink-0 place-items-center rounded-[10px] bg-bg-card font-serif text-2xl text-text-muted">
                  {itemName.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text-primary">{itemName}</p>
                <p className={`font-serif text-xl font-semibold leading-tight ${free ? "text-forest" : "text-text-primary"}`}>
                  {priceLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-xl text-text-muted hover:bg-bg-hover"
              >
                ×
              </button>
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-[13px] font-medium text-text-primary">Your name</span>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First name is fine"
                autoComplete="given-name"
                autoFocus
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-[13px] font-medium text-text-primary">Email or phone</span>
              <input
                className={inputCls}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="So the seller can reach you"
                inputMode="email"
                autoComplete="email"
              />
            </label>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              {waitlisting
                ? "Only the seller sees this. They'll contact you if the item opens up. Nothing is posted publicly."
                : "Only the seller sees this, to set up pickup. Nothing is posted publicly."}
            </p>
            {error && (
              <p className="mt-1 text-xs text-crimson" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className={`mt-4 h-12 w-full rounded-xl text-[15px] font-semibold text-white transition-colors disabled:opacity-70 ${
                waitlisting ? "bg-text-primary hover:bg-text-primary/90" : "bg-brand hover:bg-brand-hover"
              }`}
            >
              {busy ? (waitlisting ? "Joining…" : "Claiming…") : waitlisting ? "Join the waitlist" : "Claim it"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-weave bg-bg-main px-3 py-2.5 text-base text-text-primary outline-none placeholder:text-text-muted focus:border-brand-light focus:ring-3 focus:ring-ring/40";

// UPI pay link plus a copy-the-ID fallback: upi:// links don't reliably open
// an app on iPhone, so the buyer can always paste the ID into their UPI app.
// With no UPI app installed the tap silently does nothing, so if the page is
// still in front shortly after, point the buyer at the copy button.
function UpiPay({
  payment,
  priceLabel,
}: {
  payment: Extract<Payment, { kind: "upi" }>;
  priceLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const [noApp, setNoApp] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Leaving the page (app opened, Android chooser shown) cancels the check.
  useEffect(() => {
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const onVisibility = () => document.visibilityState === "hidden" && cancel();
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function watchForApp() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (document.visibilityState === "visible" && document.hasFocus()) setNoApp(true);
    }, 1500);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(payment.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the ID is shown on the button, so it can be read off.
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <a
        href={payment.href}
        onClick={watchForApp}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-weave px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Pay {priceLabel} with UPI <span aria-hidden>→</span>
      </a>
      <button
        type="button"
        onClick={copy}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-weave/30 bg-bg-card px-4 py-2 text-xs text-text-secondary transition-colors hover:border-indigo-weave/60"
      >
        {copied ? (
          <span className="font-medium text-forest">Copied ✓</span>
        ) : (
          <>
            Copy UPI ID <span className="font-mono text-text-primary">{payment.id}</span>
          </>
        )}
      </button>
      {noApp && (
        <p className="text-center text-xs leading-relaxed text-text-muted" role="status">
          Nothing opened? Copy the UPI ID and pay from your UPI app.
        </p>
      )}
    </div>
  );
}
