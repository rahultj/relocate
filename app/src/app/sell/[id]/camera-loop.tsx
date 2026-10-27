"use client";

// The camera loop (design: "2a · Camera loop" and "2b · Tell us about it").
// The phone's own camera does the shooting via a capture file input, so the
// "camera screen" is the pair of buttons on the seller home. Each photo
// becomes a draft item at once; the describe screen adds angles and a note,
// and "Next item" reopens the camera in the same tap.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Camera, Images, Loader2, Sparkles, X } from "lucide-react";
import { uploadPhotos } from "@/lib/photo-upload";
import { MAX_PHOTOS } from "@/lib/photos";
import { setItemPhotos } from "@/app/seller/photo-actions";
import { createDraftItem, deleteDraftItem, saveSellerNote } from "./actions";

export interface DraftSummary {
  id: string;
  name: string;
  photoUrls: string[];
  note: string;
}

interface Photo {
  key: string;
  preview: string; // local object URL, or the stored URL for saved photos
  url: string | null; // stored URL once uploaded
}

interface OpenItem {
  key: number;
  itemId: string | null; // null until the draft row exists
  name: string;
  photos: Photo[];
  saved: string[]; // photo URLs last written to the item
  note: string;
}

let nextKey = 0;
const photoKey = () => `p${++nextKey}`;

export function CameraLoop({
  listingId,
  initialDrafts,
}: {
  listingId: string;
  initialDrafts: DraftSummary[];
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenItem | null>(null);
  // Draft ids by open-item key, so a note or delete can wait for an item
  // whose first photo is still uploading after the seller has moved on.
  const itemIds = useRef(new Map<number, Promise<string>>());
  const saving = useRef("");

  const newCamera = useRef<HTMLInputElement>(null);
  const newGallery = useRef<HTMLInputElement>(null);
  const addCamera = useRef<HTMLInputElement>(null);
  const addGallery = useRef<HTMLInputElement>(null);

  const fail = (msg: string) => (err: unknown) =>
    setError(err instanceof Error && err.message ? `${msg} (${err.message})` : msg);

  const update = (key: number, patch: (o: OpenItem) => Partial<OpenItem>) =>
    setOpen((o) => (o && o.key === key ? { ...o, ...patch(o) } : o));

  function upsertDraft(id: string, patch: Partial<DraftSummary>) {
    setDrafts((ds) => {
      const i = ds.findIndex((d) => d.id === id);
      if (i === -1) return [...ds, { id, name: "", photoUrls: [], note: "", ...patch }];
      const next = [...ds];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  // Write the open item's photo set once every photo has uploaded and the set
  // differs from what's saved (angles added or removed).
  useEffect(() => {
    if (!open?.itemId || open.photos.some((p) => !p.url)) return;
    const urls = open.photos.map((p) => p.url as string);
    const sig = `${open.itemId}|${urls.join(",")}`;
    if (urls.join(",") === open.saved.join(",") || saving.current === sig) return;
    saving.current = sig;
    const { key, itemId } = open;
    setItemPhotos(listingId, itemId, urls)
      .then((res) => {
        if (!res.ok) throw new Error(res.error);
        update(key, () => ({ saved: urls }));
        upsertDraft(itemId, { photoUrls: urls });
      })
      .catch(fail("Couldn't save the photos."))
      .finally(() => {
        if (saving.current === sig) saving.current = "";
      });
  }, [open, listingId]);

  function startItem(file: File) {
    setError(null);
    const key = ++nextKey;
    const cover: Photo = { key: photoKey(), preview: URL.createObjectURL(file), url: null };
    setOpen({ key, itemId: null, name: `Item ${drafts.length + 1}`, photos: [cover], saved: [], note: "" });
    const id = (async () => {
      const [url] = await uploadPhotos([file]);
      update(key, (o) => ({ photos: o.photos.map((p) => (p.key === cover.key ? { ...p, url } : p)) }));
      const res = await createDraftItem(listingId, [url]);
      if (!res.ok) throw new Error(res.error);
      update(key, () => ({ itemId: res.itemId, name: res.name, saved: [url] }));
      upsertDraft(res.itemId, { name: res.name, photoUrls: [url] });
      return res.itemId;
    })();
    itemIds.current.set(key, id);
    id.catch((err) => {
      setOpen((o) => (o?.key === key ? null : o));
      fail("Couldn't save that photo. Try again.")(err);
    });
  }

  function openDraft(d: DraftSummary) {
    setError(null);
    const key = ++nextKey;
    itemIds.current.set(key, Promise.resolve(d.id));
    setOpen({
      key,
      itemId: d.id,
      name: d.name,
      photos: d.photoUrls.map((u) => ({ key: photoKey(), preview: u, url: u })),
      saved: d.photoUrls,
      note: d.note,
    });
  }

  function addPhotos(files: File[]) {
    if (!open) return;
    const picked = files.slice(0, MAX_PHOTOS - open.photos.length);
    if (picked.length === 0) return;
    const { key } = open;
    const added = picked.map((f) => ({ key: photoKey(), preview: URL.createObjectURL(f), url: null }));
    update(key, (o) => ({ photos: [...o.photos, ...added] }));
    uploadPhotos(picked)
      .then((urls) =>
        update(key, (o) => ({
          photos: o.photos.map((p) => {
            const i = added.findIndex((a) => a.key === p.key);
            return i === -1 ? p : { ...p, url: urls[i] };
          }),
        })),
      )
      .catch((err) => {
        const gone = new Set(added.map((a) => a.key));
        update(key, (o) => ({ photos: o.photos.filter((p) => !gone.has(p.key)) }));
        fail("Couldn't add that photo.")(err);
      });
  }

  function removePhoto(photo: string) {
    if (!open || open.photos.length < 2) return;
    update(open.key, (o) => ({ photos: o.photos.filter((p) => p.key !== photo) }));
  }

  // Leave the describe screen, saving the note in the background.
  function closeItem(saveNote: boolean) {
    if (!open) return;
    const { key, note } = open;
    setOpen(null);
    if (!saveNote || !note.trim()) return;
    itemIds.current
      .get(key)
      ?.then(async (id) => {
        const res = await saveSellerNote(listingId, id, note);
        if (!res.ok) throw new Error(res.error);
        upsertDraft(id, { note });
      })
      .catch(fail("Couldn't save your note."));
  }

  function deleteItem() {
    if (!open) return;
    const { key } = open;
    setOpen(null);
    itemIds.current
      .get(key)
      ?.then(async (id) => {
        const res = await deleteDraftItem(listingId, id);
        if (!res.ok) throw new Error(res.error);
        setDrafts((ds) => ds.filter((d) => d.id !== id));
      })
      .catch(fail("Couldn't delete that item."));
  }

  // Read the picked files, then reset the input so the same file can be picked again.
  function picked(e: React.ChangeEvent<HTMLInputElement>): File[] {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    return files;
  }

  const inputs = (
    <>
      <input ref={newCamera} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const [f] = picked(e); if (f) startItem(f); }} />
      <input ref={newGallery} type="file" accept="image/*" hidden
        onChange={(e) => { const [f] = picked(e); if (f) startItem(f); }} />
      <input ref={addCamera} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => addPhotos(picked(e))} />
      <input ref={addGallery} type="file" accept="image/*" multiple hidden
        onChange={(e) => addPhotos(picked(e))} />
    </>
  );

  const errorBanner = error && (
    <p role="alert" className="rounded-lg bg-white px-3 py-2 text-sm text-crimson shadow-sm">
      {error}
    </p>
  );

  if (open) {
    const cover = open.photos[0];
    const uploading = open.photos.some((p) => !p.url);
    // Extra angles are written once the draft exists; wait for that before
    // leaving so none are lost. A lone first photo never blocks the loop.
    const busy =
      open.photos.length > 1 &&
      (uploading || open.saved.join(",") !== open.photos.map((p) => p.url).join(","));
    // `inputs` stays the first child in both views so React keeps the same
    // elements: "Next item" opens the camera, then swaps views before the
    // photo comes back.
    return (
      <>
      {inputs}
      <div className="fixed inset-0 z-10 overflow-y-auto bg-bg-main">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col">
          <div className="relative h-[300px] shrink-0 bg-bg-hover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.preview} alt="" className="size-full object-cover" />
            <span className="absolute left-4 top-5 flex h-8 items-center rounded-full bg-black/60 px-3 text-[13px] font-medium text-white">
              {open.name}
            </span>
            <button
              type="button"
              onClick={() => closeItem(true)}
              disabled={busy}
              className="absolute right-4 top-5 h-8 rounded-full bg-black/60 px-3 text-[13px] font-medium text-white disabled:opacity-60"
            >
              Done
            </button>
            <span className="absolute bottom-4 left-4 flex h-[26px] items-center gap-1.5 rounded-full bg-black/60 px-2.5 text-xs font-medium text-white">
              {uploading && <Loader2 className="size-3 animate-spin" aria-hidden />}
              {uploading ? "Saving…" : "Cover photo"}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto px-6 pb-1 pt-3">
            {open.photos.map((p, i) => (
              <div key={p.key} className="relative shrink-0 pt-1.5 pr-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.preview}
                  alt={i === 0 ? "Photo 1, cover" : `Photo ${i + 1}`}
                  className={`size-16 rounded-[10px] object-cover ${
                    i === 0 ? "border-2 border-text-primary" : "border border-border-alt"
                  } ${p.url ? "" : "opacity-60"}`}
                />
                {open.photos.length > 1 && p.url && (
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => removePhoto(p.key)}
                    className="absolute right-0 top-0 flex size-[22px] items-center justify-center rounded-full bg-text-primary text-white"
                  >
                    <X className="size-2.5" strokeWidth={3} aria-hidden />
                  </button>
                )}
              </div>
            ))}
            {open.photos.length < MAX_PHOTOS && (
              <>
                <button
                  type="button"
                  aria-label="Take another photo of this item"
                  onClick={() => addCamera.current?.click()}
                  className="mt-1.5 flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border-[1.5px] border-dashed border-[#B5AFA5] bg-white text-[11px] font-medium text-text-primary"
                >
                  <Camera className="size-5" aria-hidden />
                  Camera
                </button>
                <button
                  type="button"
                  aria-label="Add photos of this item from gallery"
                  onClick={() => addGallery.current?.click()}
                  className="mt-1.5 flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border-[1.5px] border-dashed border-[#B5AFA5] bg-white text-[11px] font-medium text-text-primary"
                >
                  <Images className="size-5" aria-hidden />
                  Gallery
                </button>
              </>
            )}
            <span className="ml-auto shrink-0 pl-2 text-xs text-text-secondary">
              {open.photos.length} of {MAX_PHOTOS}
            </span>
          </div>

          <div className="flex flex-1 flex-col px-6 pb-8 pt-5">
            {errorBanner}
            <label htmlFor="about" className="font-serif text-[28px] font-semibold leading-[1.1] text-text-primary">
              Tell us about it
            </label>
            <p className="mt-2 text-sm leading-normal text-text-secondary">
              What it is, what you paid, what you want for it. Type, or tap the mic on your
              keyboard and just talk.
            </p>
            <textarea
              id="about"
              value={open.note}
              onChange={(e) => {
                const note = e.target.value;
                update(open.key, () => ({ note }));
              }}
              placeholder="Grey couch, bought it in 2022 for about 600. No stains."
              maxLength={1000}
              className="mt-4 h-[104px] w-full resize-none rounded-xl border border-border-alt bg-white px-4 py-3.5 text-base leading-[1.45] text-text-primary outline-none focus:border-text-secondary"
            />
            <p className="mt-3.5 flex items-center gap-2 text-[13px] text-text-secondary">
              <Sparkles className="size-4 shrink-0 text-ochre-dark" aria-hidden />
              AI fills in the rest. You&apos;ll check it before anything goes live.
            </p>

            <div className="min-h-6 flex-1" />
            <button
              type="button"
              onClick={deleteItem}
              className="mb-4 self-center text-sm text-text-secondary underline underline-offset-2 hover:text-crimson"
            >
              Delete this item
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  closeItem(false);
                  newCamera.current?.click();
                }}
                disabled={busy}
                className="h-[54px] flex-1 rounded-full border border-border-alt bg-white text-base font-medium text-text-primary disabled:opacity-60"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => {
                  closeItem(true);
                  newCamera.current?.click();
                }}
                disabled={busy}
                className="flex h-[54px] flex-[2] items-center justify-center gap-2 rounded-full bg-brand-hover text-base font-medium text-white hover:bg-crimson disabled:opacity-60"
              >
                {busy ? "Saving photos…" : "Next item"}
                <ArrowRight className="size-[18px]" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      {inputs}
      {errorBanner && <div className="mt-5">{errorBanner}</div>}

      {drafts.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[15px] font-bold text-text-primary">
            {drafts.length} {drafts.length === 1 ? "draft" : "drafts"}
          </h2>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Tap one to add angles or a note. Hidden from buyers until you finish them.
          </p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {drafts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => openDraft(d)}
                className="flex w-16 shrink-0 flex-col gap-1 text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.photoUrls[0]}
                  alt=""
                  className="size-16 rounded-[10px] border border-border-weave object-cover"
                />
                <span className="truncate text-xs text-text-secondary">{d.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => newCamera.current?.click()}
          className="flex h-14 items-center justify-center gap-2.5 rounded-full bg-brand-hover text-base font-medium text-white hover:bg-crimson"
        >
          <Camera className="size-5" aria-hidden />
          {drafts.length ? "Take a photo of the next item" : "Take a photo of your first item"}
        </button>
        <button
          type="button"
          onClick={() => newGallery.current?.click()}
          className="flex h-12 items-center justify-center gap-2 rounded-full border border-border-alt bg-white text-[15px] font-medium text-text-primary hover:bg-bg-hover"
        >
          <Images className="size-[18px]" aria-hidden />
          Choose from gallery
        </button>
        <p className="text-center text-[13px] text-text-secondary">
          One item per photo. You can add more angles after.
        </p>
      </div>

      {drafts.length > 0 && (
        <Link
          href={`/manage/${listingId}`}
          className="mt-4 flex items-center justify-center gap-1 text-sm text-text-secondary underline underline-offset-2"
        >
          Finish drafts in Manage for now
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </>
  );
}
