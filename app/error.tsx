"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
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
    <main className="grid min-h-screen place-items-center bg-bg px-6 py-16 text-text">
      <div className="panel w-full max-w-md p-8 text-center">
        <span className="eyebrow">Algo deu errado</span>
        <h1 className="font-brand mt-3 text-2xl font-bold tracking-tight">
          Não foi possível carregar esta página
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Ocorreu um erro inesperado. Você pode tentar novamente ou voltar para a página inicial.
          {error.digest ? (
            <span className="mt-2 block font-mono text-[11px] text-muted/80">
              Código de referência: {error.digest}
            </span>
          ) : null}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Tentar novamente
          </button>
          <Link
            href="/"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text transition hover:border-blue"
          >
            Página inicial
          </Link>
        </div>
      </div>
    </main>
  );
}
