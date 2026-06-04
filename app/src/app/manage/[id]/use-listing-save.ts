"use client";

// Auto-save engine for the /manage editor. Explicit, no library.
//
//   queueItem   debounced + coalesced patch for an EXISTING item (idempotent)
//   createRow   a new row's first save, on blur — NOT retried (non-idempotent),
//               guarded against double-fire; returns the minted {itemId, slug}
//   saveDetails debounced patch of the listing header
//   setListed   immediate bulk/per-row list/unlist (one round-trip)
//
// Status the UI shows is derived: error if anything failed, else saving if any
// write is in flight, else saved. A failed write keeps the on-screen value (the
// caller never reverts), so nothing is lost — the user just sees "couldn't save".

import { useCallback, useRef, useState } from "react";
import {
  patchItem,
  createItem,
  patchListingDetails,
  setItemsListed,
  type ItemFields,
  type ListingDetailsFields,
} from "./actions";

export type SaveStatus = "saved" | "saving" | "error";

const DEBOUNCE_MS = 600;
const DETAILS_KEY = "__details__";

// Retry transient failures (a thrown error — network / pooler ETIMEDOUT). An
// ok:false result is a real rejection (e.g. listing not found), not retried.
async function withRetry<T>(fn: () => Promise<T>, tries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < tries) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

export function useListingSave(listingId: string) {
  const [saving, setSaving] = useState(0); // count of in-flight writes
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set());

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingItem = useRef(
    new Map<string, { itemId: string; fields: ItemFields }>(),
  );
  const detailsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDetails = useRef<ListingDetailsFields | null>(null);
  const creating = useRef(new Set<string>()); // rowKeys mid-create

  const clearError = useCallback((key: string) => {
    setErrorKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const markError = useCallback((key: string) => {
    setErrorKeys((prev) => new Set(prev).add(key));
  }, []);

  // Run a retryable write, tracking in-flight count + per-key error state.
  const run = useCallback(
    async (key: string, fn: () => Promise<{ ok: boolean }>) => {
      setSaving((s) => s + 1);
      try {
        const res = await withRetry(fn);
        if (res.ok) clearError(key);
        else markError(key);
      } catch {
        markError(key);
      } finally {
        setSaving((s) => s - 1);
      }
    },
    [clearError, markError],
  );

  const queueItem = useCallback(
    (rowKey: string, itemId: string, fields: ItemFields) => {
      pendingItem.current.set(rowKey, { itemId, fields });
      const existing = timers.current.get(rowKey);
      if (existing) clearTimeout(existing);
      timers.current.set(
        rowKey,
        setTimeout(() => {
          timers.current.delete(rowKey);
          const p = pendingItem.current.get(rowKey);
          if (!p) return;
          pendingItem.current.delete(rowKey);
          void run(rowKey, () => patchItem(listingId, p.itemId, p.fields));
        }, DEBOUNCE_MS),
      );
    },
    [listingId, run],
  );

  // Create a new row on blur. Returns null if skipped (no name, or already
  // creating — guards the double-blur race that would duplicate the item).
  const createRow = useCallback(
    async (
      rowKey: string,
      fields: ItemFields,
      listed: boolean,
    ): Promise<{ itemId: string; slug: string } | null> => {
      if (!fields.name.trim()) return null;
      if (creating.current.has(rowKey)) return null;
      creating.current.add(rowKey);
      setSaving((s) => s + 1);
      try {
        const res = await createItem(listingId, fields, listed);
        if (res.ok) {
          clearError(rowKey);
          return { itemId: res.itemId, slug: res.slug };
        }
        markError(rowKey);
        return null;
      } catch {
        markError(rowKey);
        return null;
      } finally {
        creating.current.delete(rowKey);
        setSaving((s) => s - 1);
      }
    },
    [listingId, clearError, markError],
  );

  const saveDetails = useCallback(
    (d: ListingDetailsFields) => {
      pendingDetails.current = d;
      if (detailsTimer.current) clearTimeout(detailsTimer.current);
      detailsTimer.current = setTimeout(() => {
        detailsTimer.current = null;
        const p = pendingDetails.current;
        pendingDetails.current = null;
        if (p) void run(DETAILS_KEY, () => patchListingDetails(listingId, p));
      }, DEBOUNCE_MS);
    },
    [listingId, run],
  );

  const setListed = useCallback(
    (itemIds: string[], listed: boolean) => {
      if (itemIds.length === 0) return;
      const key = `listed-${listed}`;
      void run(key, () => setItemsListed(listingId, itemIds, listed));
    },
    [listingId, run],
  );

  const status: SaveStatus =
    errorKeys.size > 0 ? "error" : saving > 0 ? "saving" : "saved";

  return {
    status,
    errorKeys,
    queueItem,
    createRow,
    saveDetails,
    setListed,
  };
}
