import { z } from "zod";

export const PROJECT_LANGUAGES = [
  { value: "pt-BR", label: "Português do Brasil" },
  { value: "en-US", label: "English (United States)" },
  { value: "es-ES", label: "Español" },
] as const;

export const PROJECT_CURRENCIES = [
  { value: "BRL", label: "Real brasileiro (BRL)" },
  { value: "USD", label: "Dólar americano (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "ARS", label: "Peso argentino (ARS)" },
  { value: "MXN", label: "Peso mexicano (MXN)" },
] as const;

export const PROJECT_DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/AAAA" },
  { value: "MM/DD/YYYY", label: "MM/DD/AAAA" },
  { value: "YYYY-MM-DD", label: "AAAA-MM-DD" },
] as const;

export const PROJECT_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Mexico_City",
  "America/New_York",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/London",
  "UTC",
] as const;

const languageValues = PROJECT_LANGUAGES.map((item) => item.value) as [
  (typeof PROJECT_LANGUAGES)[number]["value"],
  ...(typeof PROJECT_LANGUAGES)[number]["value"][],
];
const currencyValues = PROJECT_CURRENCIES.map((item) => item.value) as [
  (typeof PROJECT_CURRENCIES)[number]["value"],
  ...(typeof PROJECT_CURRENCIES)[number]["value"][],
];
const dateFormatValues = PROJECT_DATE_FORMATS.map((item) => item.value) as [
  (typeof PROJECT_DATE_FORMATS)[number]["value"],
  ...(typeof PROJECT_DATE_FORMATS)[number]["value"][],
];

const optionalEmail = z
  .string()
  .trim()
  .max(320, "O e-mail é muito longo.")
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    "Informe um e-mail válido.",
  );

const optionalHttpsUrl = z
  .string()
  .trim()
  .max(2048, "A URL da logo é muito longa.")
  .refine((value) => {
    if (!value) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "A logo deve usar uma URL HTTPS válida.");

export const projectDetailsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Informe um nome com pelo menos 2 caracteres.")
      .max(120, "O nome pode ter no máximo 120 caracteres."),
    segment: z
      .string()
      .trim()
      .min(2, "Informe o segmento do cliente.")
      .max(80, "O segmento pode ter no máximo 80 caracteres."),
    unit: z
      .string()
      .trim()
      .min(2, "Informe a unidade do negócio.")
      .max(100, "A unidade pode ter no máximo 100 caracteres."),
    contact_email: optionalEmail,
    logo_url: optionalHttpsUrl,
    language: z.enum(languageValues, {
      errorMap: () => ({ message: "Selecione um idioma disponível." }),
    }),
    currency: z.enum(currencyValues, {
      errorMap: () => ({ message: "Selecione uma moeda disponível." }),
    }),
    date_format: z.enum(dateFormatValues, {
      errorMap: () => ({ message: "Selecione um formato de data disponível." }),
    }),
    decimal_separator: z.enum([",", "."]),
    thousands_separator: z.enum([".", ","]),
    timezone: z.enum(PROJECT_TIMEZONES, {
      errorMap: () => ({ message: "Selecione um fuso horário disponível." }),
    }),
  })
  .superRefine((value, context) => {
    if (value.decimal_separator === value.thousands_separator) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["thousands_separator"],
        message: "Os separadores decimal e de milhar precisam ser diferentes.",
      });
    }
  });

export const projectCreateSchema = projectDetailsSchema.and(
  z.object({ team_id: z.string().uuid("Selecione uma equipe válida.") }),
);

export type ProjectDetailsInput = z.infer<typeof projectDetailsSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

export const DEFAULT_PROJECT_DETAILS: ProjectDetailsInput = {
  name: "",
  segment: "Restaurante / Delivery",
  unit: "Unidade principal",
  contact_email: "",
  logo_url: "",
  language: "pt-BR",
  currency: "BRL",
  date_format: "DD/MM/YYYY",
  decimal_separator: ",",
  thousands_separator: ".",
  timezone: "America/Sao_Paulo",
};

export function projectDetailsFromForm(form: FormData): Record<string, string> {
  return {
    name: String(form.get("name") ?? ""),
    segment: String(form.get("segment") ?? ""),
    unit: String(form.get("unit") ?? ""),
    contact_email: String(form.get("contact_email") ?? ""),
    logo_url: String(form.get("logo_url") ?? ""),
    language: String(form.get("language") ?? ""),
    currency: String(form.get("currency") ?? ""),
    date_format: String(form.get("date_format") ?? ""),
    decimal_separator: String(form.get("decimal_separator") ?? ""),
    thousands_separator: String(form.get("thousands_separator") ?? ""),
    timezone: String(form.get("timezone") ?? ""),
  };
}

export function firstProjectValidationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Revise os dados do projeto.";
}

export type IntegrationAvailability =
  | "available"
  | "connected"
  | "beta"
  | "soon"
  | "unavailable";

export const INTEGRATION_STATUS_LABELS: Record<
  IntegrationAvailability,
  string
> = {
  available: "Disponível",
  connected: "Conectado",
  beta: "Beta",
  soon: "Em breve",
  unavailable: "Indisponível",
};

export const PROJECT_INTEGRATIONS = [
  {
    id: "meta",
    name: "Meta Ads",
    icon: "∞",
    color: "#0967d9",
    description: "Anúncios de Facebook e Instagram.",
    availability: "available" as const,
    maturity: "beta" as const,
    connectable: true,
    note: "OAuth oficial e coleta de anúncios disponíveis.",
  },
  {
    id: "instagram",
    name: "Instagram Business",
    icon: "◎",
    color: "#cf43a0",
    description: "Conteúdo e perfil orgânico.",
    availability: "soon" as const,
    connectable: false,
    note: "A coleta orgânica ainda não foi implementada.",
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: "f",
    color: "#2379df",
    description: "Conteúdo e página orgânica.",
    availability: "soon" as const,
    connectable: false,
    note: "A coleta orgânica ainda não foi implementada.",
  },
  {
    id: "google_ads",
    name: "Google Ads",
    icon: "A",
    color: "#33a56b",
    description: "Anúncios na pesquisa e na rede Google.",
    availability: "soon" as const,
    connectable: false,
    note: "OAuth e coleta do Google Ads ainda não foram implementados.",
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    icon: "▥",
    color: "#ed9638",
    description: "Eventos e navegação no site.",
    availability: "soon" as const,
    connectable: false,
    note: "A integração GA4 ainda não foi implementada.",
  },
  {
    id: "ifood",
    name: "iFood",
    icon: "iF",
    color: "#ed3948",
    description: "Pedidos do marketplace.",
    availability: "unavailable" as const,
    connectable: false,
    note: "Depende de acesso comercial e credenciais de API do iFood.",
  },
  {
    id: "cardapio",
    name: "Cardápio digital",
    icon: "C",
    color: "#744abd",
    description: "Pedidos do canal próprio.",
    availability: "unavailable" as const,
    connectable: false,
    note: "Selecione primeiro o fornecedor e valide a disponibilidade da API.",
  },
  {
    id: "google_business",
    name: "Perfil da Empresa no Google",
    icon: "G",
    color: "#277cc9",
    description: "Presença local e avaliações.",
    availability: "soon" as const,
    connectable: false,
    note: "OAuth e coleta ainda não foram implementados.",
  },
] as const;

