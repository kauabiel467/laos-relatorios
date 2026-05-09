"use client";

import clsx from "clsx";

interface AiPanelProps {
  open: boolean;
  text: string;
  messages: string[];
  onClose: () => void;
  onOpen: () => void;
  onTextChange: (value: string) => void;
  onSend: () => void;
}

export function AiPanel({
  open,
  text,
  messages,
  onClose,
  onOpen,
  onTextChange,
  onSend
}: AiPanelProps) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="fixed bottom-6 right-4 rounded-2xl bg-blue px-5 py-3 text-sm font-semibold text-white shadow-panel transition hover:bg-blue/90 lg:right-6"
      >
        Perguntar a IA
      </button>

      {open ? (
        <div className="fixed bottom-24 right-4 z-[60] flex h-[34rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-panel lg:right-6">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-semibold">IA | Insights da conta</div>
              <div className="text-xs text-muted">Pronta para integrar OpenAI API</div>
            </div>
            <button type="button" onClick={onClose} className="text-sm text-muted hover:text-text">
              Fechar
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
            {messages.map((message, index) => (
              <div
                key={`${message}-${index}`}
                className={clsx(
                  "rounded-2xl px-3 py-3 text-sm leading-6",
                  message.startsWith("Voce:") ? "ml-6 bg-blue text-white" : "mr-6 border border-border bg-bg text-text"
                )}
              >
                {message}
              </div>
            ))}
          </div>
          <div className="border-t border-border p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {["Melhor criativo?", "Resumo 7 dias", "O que otimizar?", "ROAS por campanha"].map((chip) => (
                <button key={chip} type="button" onClick={() => onTextChange(chip)} className="rounded-full border border-border bg-bg px-3 py-1.5 text-[11px] text-muted hover:border-blue hover:text-blue">
                  {chip}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
                placeholder="Pergunte sobre sua conta..."
                className="h-10 flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-blue"
              />
              <button type="button" onClick={onSend} className="rounded-lg bg-blue px-4 text-sm font-semibold text-white hover:bg-blue/90">
                Enviar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
