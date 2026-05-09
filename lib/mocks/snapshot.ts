import type { CardapioMetrics, DashboardSnapshot } from "@/lib/types";

export const snapshot: DashboardSnapshot = {
  spend: 2940,
  spendDelta: 18.2,
  resultLabel: "Pedidos reais",
  resultValue: 80,
  resultDelta: -9.1,
  revenue: 8720,
  revenueDelta: 4.3,
  roas: 2.97,
  roasDelta: -11.4,
  cpa: 36.8,
  cpaDelta: 31.2,
  quickInsights: [
    {
      label: "O que aconteceu",
      title: "Investimento subiu 18%, mas pedidos cairam 9%.",
      description: "Os cliques cresceram, porem a conversao no cardapio perdeu eficiencia.",
      tone: "blue"
    },
    {
      label: "Por que importa",
      title: "CPA real foi de R$ 28,40 para R$ 36,80.",
      description: "A queda ficou concentrada no horario da noite e em duas campanhas de maior gasto.",
      tone: "orange"
    },
    {
      label: "Proxima acao",
      title: "Reduzir verba da campanha Frio e escalar Combo Hot.",
      description: "Prioridade alta: revisar criativo e oferta da campanha com maior dispersao.",
      tone: "green"
    }
  ],
  alerts: [
    {
      id: "al_1",
      title: "Investimento subiu e resultado caiu",
      description: "Revisar campanhas de maior gasto e a conversao no cardapio antes de escalar verba.",
      tone: "high"
    },
    {
      id: "al_2",
      title: "CPA piorou acima de 20%",
      description: "Custo atual em R$ 36,80. Compare criativos, publico e oferta ativa.",
      tone: "warning"
    },
    {
      id: "al_3",
      title: "Gargalo entre acesso ao cardapio e pedido",
      description: "Conversao de 3,7%. Vale revisar cardapio, frete, tempo e clareza de oferta.",
      tone: "high"
    },
    {
      id: "al_4",
      title: "Oportunidade de escala",
      description: "Combo Hot tem o menor custo por pedido e ticket 16% acima da media.",
      tone: "good"
    }
  ],
  healthScore: 74,
  healthLabel: "Atencao moderada",
  healthTone: "yellow",
  funnel: [
    { label: "Impressoes", value: 182400, color: "blue" },
    { label: "Cliques", value: 4920, color: "indigo" },
    { label: "Acessos ao cardapio", value: 3840, color: "purple" },
    { label: "Pedidos iniciados", value: 142, color: "orange" },
    { label: "Pedidos concluidos", value: 80, color: "green" }
  ],
  bottleneck: "Maior perda entre acessos ao cardapio e pedidos iniciados. O problema parece mais de conversao do que de volume.",
  strength: "Combo Hot segue com o melhor custo por pedido e melhor ticket medio da conta."
};

export const cardapio: CardapioMetrics = {
  faturamento: 8720,
  pedidos: 80,
  ticket: 109,
  conversao: 3.7
};
