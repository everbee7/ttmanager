export function SimplePage({ title }: { title: string }) {
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_340px] gap-4 p-5">
      <section className="rounded-[14px] border border-line bg-panel p-5 shadow-panel">
        <h1 className="text-[26px] font-semibold">{title}</h1>
        <p className="mt-2 text-muted">This section is ready for the next delivery phase with the same desktop layout, density, and panel behavior.</p>
      </section>
      <aside className="rounded-[14px] border border-line bg-panel p-4 shadow-panel">
        <h2 className="text-[16px] font-semibold">Context</h2>
      </aside>
    </div>
  );
}
