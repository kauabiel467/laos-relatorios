import Link from "next/link";
import "./projects.css";

// Shown instead of a report when a link is wrong, switched off, or the visitor
// may not see it. Deliberately says nothing about which of those it was.
export function ReportUnavailable({
  title = "Este relatório não está mais disponível.",
  message = "Verifique o endereço ou peça um novo link a quem compartilhou este relatório.",
  loginHref,
}: {
  title?: string;
  message?: string;
  loginHref?: string;
}) {
  return (
    <div className="projects theme-light">
      <main className="pj-public-page pj-public-error">
        <strong>{title}</strong>
        <p>{message}</p>
        {loginHref ? <Link className="pj-button" href={loginHref}>Entrar</Link> : null}
      </main>
    </div>
  );
}
