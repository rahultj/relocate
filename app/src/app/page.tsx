export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted mb-4">
        Saudade · M1 scaffold
      </p>
      <h1 className="font-serif text-5xl md:text-6xl font-medium text-text-primary mb-6 leading-[1.05] tracking-tight">
        Going <em className="italic text-brand">home</em>.
      </h1>
      <p className="text-text-secondary max-w-md leading-relaxed">
        The Next.js app, Tailwind theme, and Weave palette are wired. Schema
        and routes ship next.
      </p>
      <div className="mt-10 flex gap-3 font-mono text-[11px] uppercase tracking-[0.1em] text-text-muted">
        <span>Next 16</span>
        <span className="text-border-alt">·</span>
        <span>Drizzle</span>
        <span className="text-border-alt">·</span>
        <span>Supabase</span>
        <span className="text-border-alt">·</span>
        <span>shadcn/ui</span>
      </div>
    </main>
  );
}
