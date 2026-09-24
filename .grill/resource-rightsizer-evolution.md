# Grill: resource-rightsizer evolution
Date: 2026-09-24

## Intent

Evoluir o Action JEV Resource RightSizer em releases incrementais, preservando o
contrato de não-mutação de infraestrutura, tornando os conectores úteis para
frotas reais e expondo evidência suficiente para depuração e confiança.

## Constraints

- O trabalho deve preservar as alterações locais já iniciadas na branch
  `feat/0.1.6-resource-filters`.
- Cada fatia deve ter testes e uma versão/release própria.
- O Action continua sem mutar infraestrutura; recomendações por recurso são
  apenas informativas.
- Tokens e segredos não podem aparecer em erros, logs ou payloads de diagnóstico.
- Tags e artefatos de release serão criados localmente; publicação remota requer
  push explícito do usuário.

## Key decisions

- Decision: continuar a sequência a partir de `v0.1.6`, pois `v0.1.2` a `v0.1.5`
  já estão presentes no histórico. Reason: evita reescrever releases existentes.
  Alternative considered: recriar todas as tags desde `v0.1.2`; rejected because
  isso reescreveria histórico público.
- Decision: filtros incluem/excluem por glob contra `resource_id`, `service` ou
  `resource_kind`, mantendo recursos excluídos visíveis. Reason: preserva
  auditabilidade sem influenciar Jev. Alternative considered: remover recursos;
  rejected because consumers precisam distinguir ausência de exclusão.
- Decision: `balanced` preserva os thresholds atuais; `production` usa
  `conservative` por padrão e ambientes não produtivos usam `balanced`.
  Reason: é a política recomendada para reduzir falsos scale-down em produção.
  Alternative considered: deixar todos os ambientes iguais; rejected because a
  solicitação pede perfis por ambiente.
- Decision: cada connector retorna um batch de métricas normalizadas por recurso,
  com unidades explícitas e paginação/múltiplas séries tratadas no collector.
  Reason: elimina diferenças artificiais entre providers.
- Decision: criar releases locais `v0.1.6` a `v0.1.11` para as seis fatias ainda
  pendentes: filtros, batch de connectors, recomendações por recurso, perfis,
  tendência/custo e smoke e2e CI.

## Surfaced assumptions

- A janela temporal continua sendo fornecida pelo Action e será reutilizada para
  slope/trend; não haverá persistência externa de séries nesta evolução.
- A ponte de custo estima impacto mensal a partir de `cost_hourly` e de um fator
  configurável, sem prometer precisão de billing.
- O workflow smoke usará servidor HTTP mock local e fixture golden, sem tokens ou
  chamadas a provedores reais.

## Open questions

- A política de thresholds/presets deve ser revisada pelo mantenedor caso os
  valores conservativo/agressivo recomendados não reflitam o perfil operacional.

## Out of scope

- Aplicar resize, alterar Terraform/Kubernetes ou chamar APIs de escrita cloud.
- Publicar tags/releases no GitHub remoto sem uma ação explícita de push.
