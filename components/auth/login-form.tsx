"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface LoginFormProps {
  supabaseReady: boolean;
}

export function LoginForm({ supabaseReady }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function normalizeAuthError(message: string) {
    const normalized = message.toLowerCase();

    if (normalized.includes("email rate limit exceeded")) {
      return "O Supabase atingiu o limite do provedor de e-mail. Para corrigir de vez, configure um SMTP proprio em Auth > Email no painel do Supabase. Enquanto isso, quem ja tiver conta pode entrar com senha sem depender de novo envio.";
    }

    if (normalized.includes("user already registered")) {
      return "Este e-mail ja esta cadastrado. Use a aba Entrar ou solicite um link por e-mail.";
    }

    return message;
  }

  async function handlePasswordSubmit() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setFeedback("Supabase ainda nao esta configurado.");
      return;
    }

    setLoading(true);
    setFeedback(null);

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`
            }
          });

    setLoading(false);

    if (result.error) {
      setFeedback(normalizeAuthError(result.error.message));
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setFeedback("Conta criada. Falta confirmar o e-mail para liberar o acesso. Se o projeto estiver no limite de envio do Supabase, configure um SMTP proprio no painel.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handleEmailLink() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setFeedback("Supabase ainda nao esta configurado.");
      return;
    }

    setLoading(true);
    setFeedback(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    setLoading(false);

    if (error) {
      setFeedback(normalizeAuthError(error.message));
      return;
    }

    setFeedback("Link enviado por e-mail. Assim que abrir, voce entra direto e segue para criar o workspace.");
  }

  return (
    <div className="panel w-full max-w-md p-6">
      <div className="mb-6">
        <div className="eyebrow mb-2">LAOS Dashboard</div>
        <h1 className="text-2xl font-bold text-text">Acesse sua conta</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Entre para gerenciar clientes, contas Meta e membros da equipe.
        </p>
      </div>

      {!supabaseReady ? (
        <div className="mb-4 rounded-xl border border-yellow/30 bg-yellow/10 p-3 text-sm text-yellow-100">
          Configure as variaveis do Supabase para ativar login.
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 rounded-xl border border-border bg-bg p-1">
        {[
          { key: "login", label: "Entrar" },
          { key: "signup", label: "Criar conta" }
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMode(item.key as "login" | "signup")}
            className={clsx(
              "rounded-lg px-3 py-2 text-sm font-semibold transition",
              mode === item.key ? "bg-blue text-white" : "text-muted hover:text-text"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="email@empresa.com"
          className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm text-text outline-none transition focus:border-blue"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder={mode === "login" ? "Senha" : "Crie uma senha"}
          className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm text-text outline-none transition focus:border-blue"
        />
        <button
          type="button"
          onClick={handlePasswordSubmit}
          disabled={loading || !email || !password || !supabaseReady}
          className="w-full rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Aguarde..." : mode === "login" ? "Entrar com senha" : "Criar conta"}
        </button>
        <button
          type="button"
          onClick={handleEmailLink}
          disabled={loading || !email || !supabaseReady}
          className="w-full rounded-lg border border-border px-4 py-3 text-sm font-semibold text-text transition hover:border-blue hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mode === "login" ? "Entrar por e-mail" : "Criar acesso por e-mail"}
        </button>
      </div>

      {feedback ? <div className="mt-4 rounded-xl border border-border bg-bg p-3 text-sm text-muted">{feedback}</div> : null}

      <div className="mt-4 rounded-xl border border-border bg-bg p-3 text-xs leading-5 text-muted">
        Se aparecer limite de e-mail do Supabase, a correcao e feita no painel do projeto em Auth &gt; Email com um SMTP proprio. O login com senha continua sendo o caminho mais estavel no dia a dia.
      </div>
    </div>
  );
}
