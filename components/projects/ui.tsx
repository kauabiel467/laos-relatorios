"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { BrandIcon } from "./brand-icons";
import { InterfaceIcon } from "./interface-icon";
export function Dialog({
  title,
  children,
  close,
  wide = false,
  busy = false,
  closeOnBackdrop = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  busy?: boolean;
  closeOnBackdrop?: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const closeRef = useRef(close);
  const busyRef = useRef(busy);
  closeRef.current = close;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = dialogRef.current;
    const items = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex='-1'])",
        ) ?? [],
      );
    const preferred = el?.querySelector<HTMLElement>("[data-autofocus]");
    (preferred ?? items().find((item) => item !== closeButtonRef.current) ?? closeButtonRef.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) closeRef.current();
      if (e.key === "Tab") {
        const a = items();
        if (e.shiftKey && document.activeElement === a[0]) {
          e.preventDefault();
          a.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === a.at(-1)) {
          e.preventDefault();
          a[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="pj-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop && !busy) close();
      }}
    >
      <section
        ref={dialogRef}
        className={"pj-dialog " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="pj-icon-button"
            aria-label={busy ? "Aguarde a operação terminar" : "Fechar"}
            disabled={busy}
            onClick={close}
          >
            <InterfaceIcon name="close" />
          </button>
        </header>
        <div className="pj-dialog-body">{children}</div>
      </section>
    </div>
  );
}

export function Toast({
  message,
  close,
  duration = 4200,
}: {
  message: string;
  close: () => void;
  duration?: number;
}) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [message, duration]);
  return (
    <div className="pj-toast" role="status" aria-live="polite">
      <InterfaceIcon name="check" size={18} />
      <p>{message}</p>
      <button type="button" aria-label="Fechar confirmação" onClick={close}>
        <InterfaceIcon name="close" size={18} />
      </button>
    </div>
  );
}

export function FieldMessage({
  children,
  error = false,
  id,
}: {
  children: ReactNode;
  error?: boolean;
  id?: string;
}) {
  return (
    <small id={id} className={error ? "pj-field-message error" : "pj-field-message"} role={error ? "alert" : undefined}>
      {children}
    </small>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="pj-empty">
      <span aria-hidden="true"><InterfaceIcon name="reports" size={24} /></span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function LoadingState({ label = "Carregando conteúdo…" }: { label?: string }) {
  return (
    <div className="pj-loading-state" role="status" aria-live="polite" aria-label={label}>
      <span className="pj-skeleton-line" aria-hidden="true" />
      <div className="pj-skeleton-grid" aria-hidden="true">
        <span className="pj-skeleton-card" />
        <span className="pj-skeleton-card" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
export function MetaMark() {
  return (
    <span className="pj-meta" role="img" aria-label="Meta Ads">
      <BrandIcon name="meta" />
    </span>
  );
}
export const shortDate = (v: string) =>
  new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR");
