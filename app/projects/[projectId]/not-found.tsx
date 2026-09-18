import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <main className="agency-loading">
      <section>
        <h1>Projeto indisponível</h1>
        <p>O projeto não existe ou sua conta não possui acesso a ele.</p>
        <Link href="/projects">Voltar aos meus projetos</Link>
      </section>
    </main>
  );
}
