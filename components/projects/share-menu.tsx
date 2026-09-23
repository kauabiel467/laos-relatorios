"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectDocument } from "@/lib/projects/model";
import { hasPublishedVersion, hasUnpublishedChanges, publicReportPath } from "@/lib/projects/publication";
import { buildEmailShareUrl, buildWhatsAppShareUrl } from "@/lib/projects/share-messages";
import { InterfaceIcon } from "./interface-icon";

type ShareAction = (action: string) => Promise<ProjectDocument | undefined>;

// "Compartilhar" for dashboards: link, PDF, WhatsApp and e-mail. All four describe
// the same thing - the last PUBLISHED version - and nothing here reads the
// editor's current state: the PDF is the print of the public page, and the
// message period comes from the publication (published_since/until), so a period
// changed but not yet published never leaks into what gets sent. The link is
// created the first time it is needed and reused afterwards; only "Desativar"
// removes it.
export function ShareMenu({
  doc,
  clientName,
  busy,
  onAction,
}: {
  doc: ProjectDocument;
  clientName: string;
  busy: boolean;
  onAction: ShareAction;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [working, setWorking] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const published = hasPublishedVersion(doc);
  const pending = hasUnpublishedChanges(doc);
  const link = doc.share_token && typeof window !== "undefined" ? `${window.location.origin}${publicReportPath(doc.share_token)}` : "";
  const disabled = busy || working;
  const since = doc.published_since;
  const until = doc.published_until;
  const lockedHint = "Publique o relatório para compartilhar.";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Returns the public URL, creating the link only if the document has none yet.
  async function ensureLink(): Promise<string | null> {
    if (doc.share_token) return `${window.location.origin}${publicReportPath(doc.share_token)}`;
    const updated = await onAction("share_link");
    return updated?.share_token ? `${window.location.origin}${publicReportPath(updated.share_token)}` : null;
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function copyLink() {
    setWorking(true);
    setFeedback("Copiando link…");
    try {
      const url = await ensureLink();
      if (!url) {
        setFeedback("Não foi possível gerar o link.");
        return;
      }
      setFeedback((await copyText(url)) ? "Link copiado" : "Não foi possível copiar automaticamente. Selecione o endereço e copie manualmente.");
    } finally {
      setWorking(false);
    }
  }

  async function shareVia(kind: "whatsapp" | "email" | "pdf") {
    if (kind !== "pdf" && (!since || !until)) {
      setFeedback("Não foi possível ler o período da publicação. Publique novamente.");
      return;
    }
    // Open the new tab synchronously (inside the click) so pop-up blockers allow
    // it even when the link still has to be created first.
    const tab = kind !== "email" && !doc.share_token ? window.open("", "_blank") : null;
    if (tab) tab.opener = null;
    setWorking(true);
    setFeedback(kind === "pdf" ? "Preparando PDF…" : "Preparando mensagem…");
    try {
      const url = await ensureLink();
      if (!url) {
        tab?.close();
        setFeedback("Não foi possível gerar o link.");
        return;
      }
      if (kind === "email") {
        window.location.href = buildEmailShareUrl({ clientName, since: since!, until: until!, link: url });
        setFeedback("Abrindo seu aplicativo de e-mail.");
        return;
      }
      // The PDF is the public page itself (published version) opened straight
      // into the print dialog; "Salvar como PDF" produces the file.
      const target = kind === "pdf"
        ? `${url}?print=1`
        : buildWhatsAppShareUrl({ clientName, since: since!, until: until!, link: url });
      if (tab) tab.location.href = target;
      else window.open(target, "_blank", "noopener,noreferrer");
      setFeedback(kind === "pdf" ? "Na janela que abrir, escolha “Salvar como PDF”." : "WhatsApp aberto em outra aba.");
    } finally {
      setWorking(false);
    }
  }

  async function deactivate() {
    setWorking(true);
    try {
      const updated = await onAction("revoke_link");
      setFeedback(updated ? "Compartilhamento desativado. O link antigo deixou de funcionar." : "Não foi possível desativar o link.");
      setConfirmDeactivate(false);
    } finally {
      setWorking(false);
    }
  }

  const items: Array<{
    key: string;
    icon: "link" | "download" | "messages" | "mail";
    label: string;
    hint: string;
    run: () => void;
  }> = [
    { key: "link", icon: "link", label: "Compartilhar por link", hint: "Copia o link público do relatório", run: () => void copyLink() },
    { key: "pdf", icon: "download", label: "Compartilhar via PDF", hint: "Versão publicada, pronta para salvar em PDF", run: () => void shareVia("pdf") },
    { key: "whatsapp", icon: "messages", label: "Compartilhar por WhatsApp", hint: "Mensagem pronta com o link", run: () => void shareVia("whatsapp") },
    { key: "email", icon: "mail", label: "Compartilhar por e-mail", hint: "Assunto e texto prontos com o link", run: () => void shareVia("email") },
  ];

  return (
    <div className="pj-share-menu">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="share-menu"
        onClick={() => {
          setFeedback("");
          setConfirmDeactivate(false);
          setOpen((value) => !value);
        }}
      >
        <InterfaceIcon name="share" size={18} />
        Compartilhar
        <InterfaceIcon name="chevron-down" size={16} />
      </button>
      {open ? (
        <div ref={menuRef} id="share-menu" className="pj-copy-report-menu pj-share-panel" role="menu" aria-label="Opções de compartilhamento">
          <header>
            <strong>Compartilhar relatório</strong>
            <span>{published ? "Link, PDF, WhatsApp e e-mail usam sempre a última versão publicada." : lockedHint}</span>
          </header>
          {items.map((item) => (
            <button
              type="button"
              role="menuitem"
              key={item.key}
              disabled={disabled || !published}
              title={published ? undefined : lockedHint}
              onClick={item.run}
            >
              <InterfaceIcon name={item.icon} size={18} />
              <span>
                <strong>{item.label}</strong>
                <small>{published ? item.hint : lockedHint}</small>
              </span>
            </button>
          ))}
          {published && link ? (
            <div className="pj-share-link">
              <input readOnly value={link} aria-label="Link público do relatório" onFocus={(event) => event.currentTarget.select()} />
              <div>
                <button type="button" disabled={disabled} onClick={() => void copyLink()}>Copiar</button>
                {confirmDeactivate ? (
                  <button type="button" className="danger" disabled={disabled} onClick={() => void deactivate()}>
                    Confirmar desativação
                  </button>
                ) : (
                  <button type="button" disabled={disabled} onClick={() => setConfirmDeactivate(true)}>
                    Desativar link
                  </button>
                )}
              </div>
            </div>
          ) : null}
          {pending ? (
            <p className="pj-share-note">
              Há alterações ainda não publicadas. O link, o PDF e as mensagens utilizam a última versão publicada.
            </p>
          ) : null}
          {feedback ? <p className="pj-share-feedback" role="status" aria-live="polite">{feedback}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
