// Pure formatters for the share options, kept out of the React tree so the
// exact WhatsApp/e-mail text can be tested.

// yyyy-mm-dd -> dd/mm/yyyy without going through Date, so no timezone can shift the day.
export function formatShareDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export interface ShareMessageInput {
  clientName: string;
  since: string;
  until: string;
  link: string;
}

export function buildWhatsAppShareUrl({ clientName, since, until, link }: ShareMessageInput) {
  const text = [
    "Olá!",
    "",
    `Segue o relatório de desempenho de ${clientName}.`,
    "",
    "Período:",
    `${formatShareDate(since)} a ${formatShareDate(until)}`,
    "",
    "Acesse o relatório:",
    link,
  ].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function buildEmailShareUrl({ clientName, since, until, link }: ShareMessageInput) {
  const subject = `Relatório de desempenho — ${clientName}`;
  const body = [
    "Olá,",
    "",
    `Segue o relatório de desempenho referente ao período de ${formatShareDate(since)} a ${formatShareDate(until)}.`,
    "",
    link,
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
