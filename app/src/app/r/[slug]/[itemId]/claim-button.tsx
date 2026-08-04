"use client";

// Soft-claim + waitlist UI for the item detail page.
//   listed:   idle / oneTap → form → claiming → success (claimed-by-you)
//   claimed:  takenByOther → (join) → form/one-tap → waitlisted (#N)
// Identity is browser-remembered (no account): localStorage holds {name,contact}
// (so later claims/joins are one-tap), the set of itemIds this device claimed
// (mustgo_claims), and the waitlist positions it holds (mustgo_waitlist) — so a
// revisit shows the right state without ever leaking other buyers' contacts.

import { useEffect, useState } from "react";
import {
  claimItem,
  unclaimItem,
  joinWaitlist,
  leaveWaitlist,
  type ClaimResult,
  type WaitlistResult,
} from "./actions";
import { venmoPayHref, venmoDisplayHandle } from "@/lib/venmo";

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
  venmoHandle,
  venmoLink,
}: {
  listingId: string;
  itemId: string;
  alreadyClaimed: boolean; // server: item.status !== "listed"
  venmoHandle: string | null;
  venmoLink: string | null;
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
    if (remembered) submit(remembered.name, remembered.contact, "waitlist");
    else setMode("form");
  };

  // ---- render ----

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
        {venmoPayHref({ handle: venmoHandle, link: venmoLink }) && (
          <a
            href={venmoPayHref({ handle: venmoHandle, link: venmoLink })!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#008CFF] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Pay{" "}
            {venmoDisplayHandle({ handle: venmoHandle, link: venmoLink }) ?? "the owner"}{" "}
            on Venmo <span aria-hidden>→</span>
          </a>
        )}
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

  if (mode === "takenByOther") {
    return (
      <div className="mt-6" role="status" aria-live="polite">
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-lg bg-bg-hover py-3 text-sm font-medium text-text-muted"
        >
          Claimed
        </button>
        <button
          type="button"
          onClick={startWaitlist}
          className="mt-2 w-full rounded-lg border border-brand/50 py-3 text-sm font-medium text-brand transition-colors hover:bg-brand/5"
        >
          Join the waitlist
        </button>
        <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
          {error ?? "Be next in line if it opens up"}
        </p>
      </div>
    );
  }

  if (mode === "idle" || mode === "oneTap") {
    const oneTap = mode === "oneTap" && buyer;
    return (
      <div className="mt-6">
        <button
          type="button"
          onClick={() =>
            oneTap
              ? submit(buyer.name, buyer.contact, "claim")
              : (setIntent("claim"), setMode("form"))
          }
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
        >
          {oneTap ? `Claim as ${buyer.name}` : "Claim this item"}
        </button>
        {error && (
          <p className="mt-2 text-center text-xs text-forest" role="status">
            {error}
          </p>
        )}
        {oneTap ? (
          <p className="mt-2 text-center text-xs text-text-muted">
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
                setIntent("claim");
                setMode("form");
              }}
              className="text-brand underline-offset-2 hover:underline"
            >
              not you?
            </button>
          </p>
        ) : (
          <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
            Free to claim · no account needed
          </p>
        )}
      </div>
    );
  }

  // form + busy. The form serves both claim and waitlist (per `intent`).
  const busy = mode === "busy";
  const waitlisting = intent === "waitlist";
  return (
    <form
      className="mt-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) submit(name, contact, intent);
      }}
    >
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
          Your name
        </span>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First name is fine"
          autoFocus
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
          Email or phone
        </span>
        <input
          className={inputCls}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="so the seller can reach you"
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
        className="mt-3 w-full rounded-lg bg-brand py-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-70"
      >
        {busy
          ? waitlisting
            ? "Joining…"
            : "Claiming…"
          : waitlisting
            ? "Join the waitlist"
            : "Claim it"}
      </button>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-weave bg-bg-main px-3 py-2.5 text-base text-text-primary outline-none placeholder:text-text-muted focus:border-brand-light focus:ring-3 focus:ring-ring/40";
