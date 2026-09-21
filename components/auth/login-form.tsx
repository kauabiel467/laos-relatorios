"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface LoginFormProps {
  supabaseReady: boolean;
  returnTo?: string;
}

export function LoginForm({ supabaseReady, returnTo="/" }: LoginFormProps) {
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
              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`
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

    router.replace(returnTo);
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
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`
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
    <div className="auth-card">
      <div className="auth-card-heading">
        <div className="eyebrow">Área segura</div>
        <h1>Acesse sua conta</h1>
        <p>
          Entre para gerenciar clientes, contas Meta e membros da equipe.
        </p>
      </div>

      {!supabaseReady ? (
        <div className="auth-alert" role="alert">
          Configure as variáveis do Supabase para ativar o login.
        </div>
      ) : null}

      <div className="auth-segmented" aria-label="Tipo de acesso">
        {[
          { key: "login", label: "Entrar" },
          { key: "signup", label: "Criar conta" }
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMode(item.key as "login" | "signup")}
            className={clsx(
              "auth-segment",
              mode === item.key && "active"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="auth-fields">
        <label className="auth-field">
          <span>E-mail</span>
          <input
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="nome@empresa.com"
          />
        </label>
        <label className="auth-field">
          <span>Senha</span>
          <input
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "login" ? "Digite sua senha" : "Crie uma senha segura"}
          />
        </label>
        <button
          type="button"
          onClick={handlePasswordSubmit}
          disabled={loading || !email || !password || !supabaseReady}
          className="auth-primary"
        >
          {loading ? "Aguarde…" : mode === "login" ? "Entrar com senha" : "Criar conta"}
        </button>
        <button
          type="button"
          onClick={handleEmailLink}
          disabled={loading || !email || !supabaseReady}
          className="auth-secondary"
        >
          {mode === "login" ? "Entrar por e-mail" : "Criar acesso por e-mail"}
        </button>
      </div>

      {feedback ? <div className="auth-feedback" role="status" aria-live="polite">{feedback}</div> : null}

      <p className="auth-support-note">
        Se o envio por e-mail atingir o limite do Supabase, o acesso com senha continua disponível.
      </p>
    </div>
  );
}
