export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 py-16" role="status" aria-live="polite" aria-label="Carregando">
      <div className="w-full max-w-md space-y-4">
        <div className="skeleton h-6 w-2/3" />
        <div className="grid grid-cols-2 gap-4">
          <div className="skeleton h-32" />
          <div className="skeleton h-32" />
        </div>
        <span className="sr-only">Carregando conteúdo…</span>
      </div>
    </main>
  );
}
