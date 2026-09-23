export default function ProjectLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 py-16" role="status" aria-live="polite" aria-label="Carregando projeto">
      <div className="w-full max-w-3xl space-y-6">
        <div className="skeleton h-8 w-1/3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
        <div className="skeleton h-64" />
        <span className="sr-only">Carregando projeto…</span>
      </div>
    </main>
  );
}
