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

  async function handleSubmit() {
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
      setFeedback(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setFeedback("Conta criada. Confirme seu e-mail para entrar.");
      return;
    }

    router.replace("/");
    router.refresh();
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
          placeholder="Senha"
          className="w-full rounded-lg border border-border bg-bg px-3 py-3 text-sm text-text outline-none transition focus:border-blue"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !email || !password || !supabaseReady}
          className="w-full rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
      </div>

      {feedback ? <div className="mt-4 rounded-xl border border-border bg-bg p-3 text-sm text-muted">{feedback}</div> : null}
    </div>
  );
}
