"use client";

interface CardapioModalProps {
  open: boolean;
  onClose: () => void;
}

export function CardapioModal({ open, onClose }: CardapioModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="panel w-full max-w-xl p-6" onClick={(event) => event.stopPropagation()}>
        <h2 className="mb-1 text-xl font-bold">Conectar cardapio</h2>
        <p className="mb-6 text-sm text-muted">Preparado para integrar APIs de pedidos por cliente.</p>
        <div className="space-y-4">
          <input className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm outline-none focus:border-blue" placeholder="https://api.seusite.com.br" />
          <div className="grid gap-3 md:grid-cols-3">
            {["Bearer", "API Key", "Basic"].map((label) => (
              <button key={label} type="button" className="rounded-lg border border-border bg-bg px-4 py-3 text-sm text-muted hover:border-blue hover:text-text">
                {label}
              </button>
            ))}
          </div>
          <input className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm outline-none focus:border-blue" placeholder="Credencial protegida pelo backend" />
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border px-4 py-3 text-sm text-muted hover:text-text">Pular por agora</button>
            <button type="button" className="flex-1 rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white">Testar e salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
