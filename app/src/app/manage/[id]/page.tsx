// /manage/[id], the old seller editor's address. Everything it did now lives
// on /sell/[id] (Items, Claims and Sale tabs, /import, /photos), so old links
// and bookmarks 308 there; ?tool=csv|photos lands on the matching tool. The
// server actions next door (actions.ts) are still what /sell calls.

import { notFound, permanentRedirect } from "next/navigation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TOOL_TARGET: Record<string, string> = { csv: "/import", photos: "/photos", add: "" };

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tool?: string | string[] }>;
}) {
  const { id } = await params;
  const { tool } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const target = typeof tool === "string" ? (TOOL_TARGET[tool] ?? "") : "";
  permanentRedirect(`/sell/${id}${target}`);
}
