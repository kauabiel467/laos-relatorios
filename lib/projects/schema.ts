import { z } from "zod";
import { METRICS, SECTIONS } from "./model";
export const configSchema = z
  .object({
    preset: z.enum(["last_7d", "last_30d", "last_month", "custom"]),
    since: z.string().date(),
    until: z.string().date(),
    comparison: z.enum(["previous", "none", "custom"]),
    compare_since: z.string().date().optional(),
    compare_until: z.string().date().optional(),
    campaign_ids: z.array(z.string().regex(/^\d+$/)).max(100),
    metrics: z
      .array(z.string().refine((x) => x in METRICS))
      .min(1)
      .max(30),
    sections: z
      .array(z.string().refine((x) => x in SECTIONS))
      .min(1)
      .max(20),
    subtitle: z.string().max(240),
    analysis: z.string().max(20000),
    template: z.string().max(100),
  })
  .superRefine((c, ctx) => {
    function check(a: string, b: string) {
      const d = (Date.parse(b) - Date.parse(a)) / 86400000;
      if (d < 0 || d > 366)
        ctx.addIssue({
          code: "custom",
          message: "Selecione um período de até 366 dias.",
        });
    }
    check(c.since, c.until);
    if (c.comparison === "custom") {
      if (!c.compare_since || !c.compare_until)
        ctx.addIssue({
          code: "custom",
          message: "Informe as datas de comparação.",
        });
      else check(c.compare_since, c.compare_until);
    }
    if (
      new Set(c.metrics).size !== c.metrics.length ||
      new Set(c.sections).size !== c.sections.length
    )
      ctx.addIssue({ code: "custom", message: "Remova blocos repetidos." });
  });
