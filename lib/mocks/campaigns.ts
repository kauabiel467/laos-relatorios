import type { AdItem, CampaignMetric } from "@/lib/types";

export const campaigns: CampaignMetric[] = [
  { id: "cmp_1", name: "Combo Hot - Raio 4km", status: "ACTIVE", objective: "Vendas", resultLabel: "Vendas", spend: 980, reach: 18200, ctr: 4.7, roas: 4.18, result: 44 },
  { id: "cmp_2", name: "Frio - Publico Aberto", status: "ACTIVE", objective: "Vendas", resultLabel: "Vendas", spend: 812, reach: 22500, ctr: 2.6, roas: 1.72, result: 12 },
  { id: "cmp_3", name: "Visitas Perfil Instagram", status: "PAUSED", objective: "Trafego", resultLabel: "Visitas ao perfil", spend: 520, reach: 9400, clicks: 142, followers: 31, ctr: 5.3, roas: 2.94, result: 18 },
  { id: "cmp_4", name: "Mensagens Centro", status: "ACTIVE", objective: "Mensagens", resultLabel: "Conversas", spend: 410, reach: 8700, ctr: 3.9, roas: 2.1, result: 23 }
];

export const adsByCampaign: Record<string, AdItem[]> = {
  cmp_1: [
    { id: "ad_1", name: "Video combo salmao", type: "video", ctr: 5.2, cpc: 1.38, spend: 310, top: true },
    { id: "ad_2", name: "Carousel desconto almoco", type: "carousel", ctr: 4.8, cpc: 1.44, spend: 275 },
    { id: "ad_3", name: "Imagem sashimi premium", type: "image", ctr: 4.2, cpc: 1.63, spend: 210 }
  ],
  cmp_2: [
    { id: "ad_4", name: "Video frio broad", type: "video", ctr: 2.3, cpc: 2.84, spend: 380 },
    { id: "ad_5", name: "Imagem cupom frio", type: "image", ctr: 2.8, cpc: 2.17, spend: 280 }
  ],
  cmp_3: [
    { id: "ad_6", name: "Story cardapio retarget", type: "image", ctr: 5.5, cpc: 1.22, spend: 210 },
    { id: "ad_7", name: "Carousel combos volta", type: "carousel", ctr: 5.1, cpc: 1.28, spend: 190 }
  ],
  cmp_4: [
    { id: "ad_8", name: "Anuncio inbox jantar", type: "video", ctr: 4.0, cpc: 1.62, spend: 200 },
    { id: "ad_9", name: "Imagem mensagem urgente", type: "image", ctr: 3.7, cpc: 1.71, spend: 150 }
  ]
};
