"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <main className="grid min-h-screen place-items-center bg-bg px-6 py-16 text-text">
          <div className="panel w-full max-w-md p-8 text-center">
            <span className="eyebrow">Erro crítico</span>
            <h1 className="font-brand mt-3 text-2xl font-bold tracking-tight">
              A aplicação encontrou um problema
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Tente recarregar a página. Se o problema persistir, entre em contato com o suporte.
              {error.digest ? (
                <span className="mt-2 block font-mono text-[11px] text-muted/80">
                  Código de referência: {error.digest}
                </span>
              ) : null}
            </p>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={reset}
                className="rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Recarregar
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
