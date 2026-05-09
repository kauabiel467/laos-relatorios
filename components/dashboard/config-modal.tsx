"use client";

interface ConfigModalProps {
  open: boolean;
  onClose: () => void;
}

export function ConfigModal({ open, onClose }: ConfigModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="panel w-full max-w-lg p-6" onClick={(event) => event.stopPropagation()}>
        <h2 className="mb-1 text-xl font-bold">Configuracao de Conexao</h2>
        <p className="mb-6 text-sm text-muted">Estrutura pronta para ligar Meta Ads API, OpenAI API e credenciais seguras via backend.</p>
        <div className="space-y-4">
          <div>
            <label className="eyebrow mb-2 block">Meta Access Token</label>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm outline-none focus:border-blue"
              placeholder="Credencial gerenciada pelo backend"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block">Chave da IA</label>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm outline-none focus:border-blue"
              placeholder="Conexao segura via servidor"
            />
          </div>
          <p className="text-xs leading-5 text-muted">Essas credenciais sao apenas referencia visual neste preview e nao devem ser persistidas no navegador.</p>
          <button type="button" className="w-full rounded-lg bg-blue px-4 py-3 font-semibold text-white transition hover:bg-blue/90">
            Conectar
          </button>
        </div>
      </div>
    </div>
  );
}
