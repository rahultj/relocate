// Frame for the seller's one-job pages (spreadsheet import, photo matching):
// a way back to the sale, a title and a line of help.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function ToolFrame({
  listingId,
  back = "",
  title,
  intro,
  children,
}: {
  listingId: string;
  back?: "" | "/sale"; // which tab the back link returns to
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-8 md:max-w-2xl">
        <Link
          href={`/sell/${listingId}${back}`}
          className="-ml-1 flex h-11 items-center gap-1 self-start text-[15px] font-medium text-text-primary"
        >
          <ChevronLeft className="size-5" aria-hidden />
          Your sale
        </Link>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-[1.05] text-text-primary">{title}</h1>
        <p className="mt-2 text-sm leading-normal text-text-secondary">{intro}</p>
        {children}
      </div>
    </main>
  );
}
