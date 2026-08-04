// Home / index — a plain brand landing, not a directory. Multi-seller: we do
// NOT enumerate every listing here (each listing is reached only via its own
// /r/[slug] link the seller shares). Just the brand + a "start a listing" CTA
// so no one lands on a dead end.

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg-main">
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
          mustgo
        </p>
        <h1 className="mt-3 font-serif text-5xl font-medium leading-[1.05] tracking-tight text-text-primary">
          Moving on? <em className="italic text-brand">Pass it on.</em>
        </h1>
        <p className="mt-4 max-w-md leading-relaxed text-text-secondary">
          A simple way to sell your things before you move. Post what you&apos;re
          letting go, and buyers claim what they want.
        </p>

        {/* Seller entry */}
        <section className="mt-12">
          <Link
            href="/seller/add"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            + Start a listing
          </Link>
        </section>

        {/* Preview — a real listing so sellers see the result (photos, price,
            one-tap claim). Static screenshot of an actual mustgo item page. */}
        <section className="mt-14">
          <div className="mx-auto max-w-[300px]">
            <div className="overflow-hidden rounded-2xl border border-border-weave bg-bg-card shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/preview-listing.jpg"
                alt="A mustgo item page — a sofa with its photo, price, and a Claim button"
                width={390}
                height={740}
                className="block h-auto w-full"
                loading="eager"
              />
            </div>
            <p className="mt-3 text-center text-sm leading-relaxed text-text-secondary">
              Every item gets a photo, a price, and one-tap claim — no account
              needed.
            </p>
          </div>
        </section>

        {/* How it works — for prospective sellers (the only visitors here). */}
        <section className="mt-14 border-t border-border-weave pt-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            How it works
          </p>
          <ol className="mt-5 flex flex-col gap-6">
            {[
              {
                title: "List your stuff",
                body: "Paste a spreadsheet or add items by hand.",
              },
              {
                title: "Share your link",
                body: "One link. No app, and no login for buyers.",
              },
              {
                title: "Buyers claim & pay",
                body: "They reserve items and Venmo you directly.",
              },
            ].map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft font-serif text-sm font-medium text-brand">
                  {i + 1}
                </span>
                <div>
                  <p className="font-serif text-lg font-medium leading-tight text-text-primary">
                    {step.title}
                  </p>
                  <p className="mt-1 leading-relaxed text-text-secondary">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
