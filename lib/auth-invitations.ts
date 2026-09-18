import { env } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

function normalizeEmailProviderError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("email rate limit exceeded")) {
    return "O convite foi salvo, mas o limite do provedor de e-mail foi atingido. Configure um SMTP próprio no Supabase Auth para envios de produção.";
  }
  if (normalized.includes("email address not authorized")) {
    return "O convite foi salvo, mas o SMTP padrão do Supabase não autorizou este destinatário. Configure um SMTP próprio no Supabase Auth.";
  }
  if (normalized.includes("user already registered")) {
    return "A pessoa já possui cadastro. O acesso ficará disponível na próxima entrada no LAOS.";
  }
  return "O convite foi salvo, mas o provedor de e-mail não confirmou o envio.";
}

export async function sendAuthInvitation(email: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      emailSent: false,
      message:
        "Convite salvo. Para enviar o e-mail automaticamente, configure SUPABASE_SECRET_KEY e um SMTP próprio no Supabase Auth.",
    };
  }
  try {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    });
    if (error) throw new Error(error.message);
    return { emailSent: true, message: "Convite enviado por e-mail." };
  } catch (error) {
    const message =
      error instanceof Error
        ? normalizeEmailProviderError(error.message)
        : "O convite foi salvo, mas o provedor de e-mail não confirmou o envio.";
    return { emailSent: false, message };
  }
}

