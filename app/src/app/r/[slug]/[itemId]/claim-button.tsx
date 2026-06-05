"use client";

// Soft-claim UI for the item detail page. All states from SOFT_CLAIM_PLAN.md:
// default → form → claiming → claimed-by-you (success, carries the trust) /
// returning-buyer one-tap / claimed-by-someone-else / lost-the-race.
//
// Identity is browser-remembered (no account): localStorage holds {name, contact}
// (so later claims are one-tap) and the set of itemIds this device has claimed
// (so revisiting a claimed item shows the success state, never leaking other
// buyers' contacts).

import { useEffect, useState } from "react";
import { claimItem, unclaimItem, type ClaimResult } from "./actions";

const BUYER_KEY = "mustgo_buyer";
const CLAIMS_KEY = "mustgo_claims";

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

type Mode =
  | "idle" // listed, no remembered buyer → show Claim button
  | "form" // entering name + contact
  | "oneTap" // listed, remembered buyer → one-tap "Claim as <name>"
  | "claiming"
  | "success" // claimed by this buyer
  | "takenByOther"; // claimed by someone else

export function ClaimButton({
  listingId,
  itemId,
  alreadyClaimed,
}: {
  listingId: string;
  itemId: string;
  alreadyClaimed: boolean; // server: item.status !== "listed"
}) {
  // Seed from server truth so first paint (pre-hydration) is correct: a claimed
  // item shows "Claimed", not a claim button that flashes then flips. The effect
  // below upgrades to "success" for the buyer who actually claimed it.
  const [mode, setMode] = useState<Mode>(
    alreadyClaimed ? "takenByOther" : "idle",
  );
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [contactShown, setContactShown] = useState(""); // for success copy
  const [error, setError] = useState<string | null>(null);
  const [confirmUnclaim, setConfirmUnclaim] = useState(false);
  const [unclaiming, setUnclaiming] = useState(false);

  // Resolve the starting state from server truth + localStorage. This must run
  // post-mount: localStorage doesn't exist during SSR, so the component renders
  // a neutral "idle" first, then syncs to the remembered identity on the client.
  // (Legitimate external-system sync — the case react-hooks/set-state-in-effect
  // explicitly allows.)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const remembered = readBuyer();
    setBuyer(remembered);
    if (remembered) {
      setName(remembered.name);
      setContactShown(remembered.contact);
    }
    if (alreadyClaimed) {
      setMode(readClaimed().includes(itemId) ? "success" : "takenByOther");
    } else {
      setMode(remembered ? "oneTap" : "idle");
    }
  }, [alreadyClaimed, itemId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persistSuccess = (b: Buyer) => {
    try {
      localStorage.setItem(BUYER_KEY, JSON.stringify(b));
      const claimed = readClaimed();
      if (!claimed.includes(itemId))
        localStorage.setItem(CLAIMS_KEY, JSON.stringify([...claimed, itemId]));
    } catch {
      /* private mode / storage full — non-fatal; success still shows */
    }
  };

  // Release this device's claim. Authorized server-side by the remembered
  // contact (a confirmed claim must exist for it). On success we drop the item
  // from the local claimed-set and return to the one-tap state so the buyer
  // could re-claim — or someone else can.
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

  const submit = async (n: string, c: string) => {
    setError(null);
    setMode("claiming");
    let res: ClaimResult;
    try {
      res = await claimItem(listingId, itemId, n, c);
    } catch {
      res = { ok: false, reason: "taken" }; // network/unknown → safe generic
    }
    if (res.ok) {
      persistSuccess({ name: n.trim(), contact: c.trim() });
      setContactShown(c.trim());
      setMode("success");
      return;
    }
    if (res.reason === "taken") {
      setMode("takenByOther");
      setError("Someone just claimed this a moment ago. Sorry!");
    } else {
      // invalid (or notfound) → back to the form with a hint
      setMode("form");
      setError("Enter your name and a valid email or phone.");
    }
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
          The seller will reach out
          {contactShown ? (
            <>
              {" "}
              at <span className="font-medium text-text-primary">{contactShown}</span>
            </>
          ) : null}{" "}
          to set up pickup. Keep an eye out.
        </p>
        {error && (
          <p className="mt-2 text-xs text-crimson" role="alert">
            {error}
          </p>
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
        <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
          {error ?? "Someone grabbed this one first"}
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
            oneTap ? submit(buyer.name, buyer.contact) : setMode("form")
          }
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
        >
          {oneTap ? `Claim as ${buyer.name}` : "Claim this item"}
        </button>
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

  // form + claiming
  const busy = mode === "claiming";
  return (
    <form
      className="mt-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) submit(name, contact);
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
        Shared only with the seller, to arrange pickup. Nothing posted publicly.
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
        {busy ? "Claiming…" : "Claim it"}
      </button>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-weave bg-bg-main px-3 py-2.5 text-base text-text-primary outline-none placeholder:text-text-muted focus:border-brand-light focus:ring-3 focus:ring-ring/40";
