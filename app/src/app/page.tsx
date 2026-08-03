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
          A relocation sale, one scroll at a time. List the things you can&apos;t
          take with you and let them find a new home.
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
      </div>
    </main>
  );
}
