// Phone numbers as the WhatsApp Cloud API wants them: digits only, with the
// country code (E.164 without the "+"). Pure functions, no I/O.

// Country calling codes. Matched by prefix (1, 2 or 3 digits are unambiguous
// because no code is a prefix of another).
const CODES_1 = ["1", "7"];
const CODES_2 = [
  "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49",
  "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66",
  "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98",
];
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
const CODES_3 = [
  "212", "213", "216", "218", ...range(220, 258), ...range(260, 269), "290", "291", "297", "298", "299",
  ...range(350, 359), ...range(370, 389), "420", "421", "423", ...range(500, 509), ...range(590, 599),
  ...range(670, 692), "850", "852", "853", "855", "856", "880", "886", ...range(960, 968), ...range(970, 977),
  "992", "993", "994", "995", "996", "998",
];
const CALLING_CODES = new Set([...CODES_1, ...CODES_2, ...CODES_3]);

// Brazilian area codes (DDD) that exist.
const BRAZIL_DDD = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export function callingCodeOf(digits: string) {
  for (const length of [1, 2, 3]) {
    const candidate = digits.slice(0, length);
    if (CALLING_CODES.has(candidate)) return candidate;
  }
  return null;
}

export type PhoneResult =
  | { ok: true; e164: string; digits: string; countryCode: string }
  | { ok: false; message: string };

// Accepts what people type ("+55 (11) 99999-9999") and returns the canonical
// number or a message a person can act on. Numbers without "+" are read as
// Brazilian when they look Brazilian (10/11 digits); anything else needs the DDI.
export function normalizePhone(input: string): PhoneResult {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, message: "Informe o telefone do destinatário." };
  if (/[^\d\s()+\-.]/.test(raw)) return { ok: false, message: "O telefone só pode ter números, espaços, parênteses e hífen." };
  const hasPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!hasPlus && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  else if (!hasPlus && digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, message: "Telefone inválido: use o formato internacional, ex.: +5511999999999." };
  }
  const countryCode = callingCodeOf(digits);
  if (!countryCode) return { ok: false, message: "DDI inválido. Use o código do país, ex.: +55 para o Brasil." };
  if (countryCode === "55") {
    const national = digits.slice(2);
    if (national.length !== 11) {
      return {
        ok: false,
        message: "Celulares brasileiros têm DDD + 9 dígitos, ex.: +55 11 99999-9999.",
      };
    }
    if (!BRAZIL_DDD.has(national.slice(0, 2))) return { ok: false, message: `DDD ${national.slice(0, 2)} não existe.` };
    if (national[2] !== "9") return { ok: false, message: "Celulares brasileiros começam com 9 depois do DDD." };
  }
  return { ok: true, e164: `+${digits}`, digits, countryCode };
}

// What the history shows: enough to recognise the recipient, never the full number.
export function maskPhone(e164: string) {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 8) return "••••";
  const country = callingCodeOf(digits) ?? "";
  return `+${country} •••••${digits.slice(-4)}`;
}
