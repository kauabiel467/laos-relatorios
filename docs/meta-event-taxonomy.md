# Taxonomia de eventos da Meta

A LAOS mantém uma lista ordenada de aliases para cada métrica em `lib/metrics/meta-events.ts`.
Quando a Meta devolve mais de um alias equivalente na mesma resposta, o motor escolhe o primeiro evento canônico disponível e não soma os aliases. Isso evita contar a mesma conversão duas vezes, por exemplo quando `offsite_conversion.fb_pixel_purchase` e `purchase` representam a mesma compra atribuída.

A ordem é uma regra de compatibilidade explícita. Alterações nessa prioridade precisam incluir uma fixture representativa da API e testes de reconciliação dos adaptadores moderno e legado. A fixture atual está em `tests/fixtures/meta-insights.json` e preserva o formato de `actions` e `action_values` retornado pelo Meta Insights.
