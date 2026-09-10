import { z } from "zod";
import { METRICS, SECTIONS } from "./model";
const metricKey = z.string().refine((value) => value in METRICS);
const customMetric = z
  .object({
    id: z.string().regex(/^custom_[a-z0-9_-]{4,70}$/i),
    kind: z.enum(["manual", "calculated"]),
    label: z.string().trim().min(1).max(80),
    description: z.string().max(240),
    format: z.enum(["money", "number", "percent", "ratio"]),
    lower: z.boolean().optional(),
    value: z.number().finite().optional(),
    left: metricKey.optional(),
    right: metricKey.optional(),
    operation: z.enum(["add", "subtract", "divide", "percentage"]).optional(),
  })
  .superRefine((metric, ctx) => {
    if (metric.kind === "manual" && metric.value == null)
      ctx.addIssue({ code: "custom", message: "Informe o valor manual." });
    if (
      metric.kind === "calculated" &&
      (!metric.left || !metric.right || !metric.operation)
    )
      ctx.addIssue({
        code: "custom",
        message: "Configure os componentes da métrica calculada.",
      });
  });
export const configSchema = z
  .object({
    preset: z.enum(["last_7d", "last_30d", "last_month", "custom"]),
    since: z.string().date(),
    until: z.string().date(),
    comparison: z.enum(["previous", "none", "custom"]),
    compare_since: z.string().date().optional(),
    compare_until: z.string().date().optional(),
    campaign_ids: z.array(z.string().regex(/^\d+$/)).max(100),
    metrics: z.array(metricKey).min(1).max(30),
    sections: z
      .array(z.string().refine((x) => x in SECTIONS))
      .min(1)
      .max(20),
    subtitle: z.string().max(240),
    analysis: z.string().max(20000),
    template: z.string().max(100),
    custom_metrics: z.array(customMetric).max(12).optional(),
    metric_order: z.array(z.string().max(80)).max(42).optional(),
    metric_sizes: z
      .record(z.string().max(80), z.enum(["compact", "wide", "full"]))
      .optional(),
    chart_metric: metricKey.optional(),
    funnel_metrics: z.array(metricKey).min(2).max(6).optional(),
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
    const customIds = (c.custom_metrics ?? []).map((metric) => metric.id);
    if (new Set(customIds).size !== customIds.length)
      ctx.addIssue({ code: "custom", message: "Há métricas personalizadas repetidas." });
    if (
      c.funnel_metrics &&
      new Set(c.funnel_metrics).size !== c.funnel_metrics.length
    )
      ctx.addIssue({ code: "custom", message: "Remova etapas repetidas do funil." });
    const allowedOrder = new Set([...c.metrics, ...customIds]);
    if (
      c.metric_order?.some((metric) => !allowedOrder.has(metric)) ||
      (c.metric_order && new Set(c.metric_order).size !== c.metric_order.length)
    )
      ctx.addIssue({ code: "custom", message: "A ordem das métricas é inválida." });
  });
