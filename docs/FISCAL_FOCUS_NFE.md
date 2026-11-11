# Integracao Fiscal Focus NFe

## Arquitetura

O modulo fiscal da TECNOMOTOS usa uma camada backend:

TECNOMOTOS -> FiscalOperationService -> FiscalProvider -> MockFiscalProvider ou FocusNFeProvider -> Focus NFe.

Componentes React, checkout, PDV e paginas administrativas nao chamam a Focus diretamente.

## Variaveis De Ambiente

Padrao seguro inicial:

```env
FISCAL_PROVIDER=mock
FISCAL_ENVIRONMENT=mock
FISCAL_PRODUCTION_ENABLED=false
FISCAL_UF=MT
FISCAL_MODEL=55
FISCAL_CNPJ=22010781000138
FISCAL_IE=
FISCAL_CRT=
FISCAL_NFE_SERIES=1
FOCUS_NFE_HOMOLOGATION_TOKEN=
FOCUS_NFE_PRODUCTION_TOKEN=
FOCUS_NFE_WEBHOOK_SECRET=
```

Tokens Focus devem existir somente no backend/Vercel Environment Variables. Nunca coloque token, certificado, CSC ou senha no frontend ou no Git.

## Focus NFe

Documentacao oficial consultada:

- Autenticacao: HTTP Basic Auth, token como usuario e senha vazia.
- Ambiente: homologacao usa `https://homologacao.focusnfe.com.br`; producao usa `https://api.focusnfe.com.br`.
- Emissao NF-e: `POST /v2/nfe?ref={referencia}`.
- Consulta NF-e: `GET /v2/nfe/{referencia}`.
- Cancelamento NF-e: `DELETE /v2/nfe/{referencia}` com `justificativa` entre 15 e 255 caracteres.

## Banco

A migration `023_focusnfe_fiscal_integration.sql` adiciona:

- `fiscal_tax_profiles`
- `fiscal_operations`
- `fiscal_webhook_events`
- campos profissionais em `fiscal_documents`
- campos fiscais complementares em `products`
- indices unicos para `reference` e emissao ativa por venda

Ela nao apaga tabelas nem dados existentes.

## Emissao

Fluxo:

1. O frontend solicita emissao para `/api/fiscal/emit`.
2. O backend autentica e verifica `fiscal.create`.
3. O backend carrega o pedido pago e seus produtos reais.
4. `validateNfeSale` valida empresa, destinatario, pagamento e dados fiscais dos produtos.
5. `FiscalOperationService` cria ou reaproveita a `fiscal_operation`.
6. O provider emite a NF-e.
7. O resultado e salvo em `fiscal_documents` e `fiscal_events`.

Se uma venda ja possuir documento autorizado, processando ou cancelado, a rota retorna o documento existente e nao emite outra NF-e.

## Consulta E Cancelamento

Use `/api/fiscal/status` com `documentId` para consultar a NF-e pela referencia persistida.

Use `/api/fiscal/cancel` com `documentId` e `reason`. O backend valida permissao, status autorizado e tamanho da justificativa antes de chamar o provider.

## Webhook

Endpoint criado: `/api/webhooks/focusnfe`.

O webhook exige o cabecalho `x-focusnfe-webhook-secret`, calcula hash do payload para idempotencia em `fiscal_webhook_events`, localiza o documento pela referencia e atualiza o status. Ele responde rapidamente e nao armazena segredos.

No Painel API da Focus, crie o evento `nfe` apontando para:

```text
https://SEU-DOMINIO/api/webhooks/focusnfe
```

Defina `authorization_header` como `x-focusnfe-webhook-secret` e `authorization` com exatamente o mesmo valor de `FOCUS_NFE_WEBHOOK_SECRET` configurado no backend.

## Homologacao

Configure somente no backend:

```env
FISCAL_PROVIDER=focusnfe
FISCAL_ENVIRONMENT=homologation
FISCAL_PRODUCTION_ENABLED=false
FOCUS_NFE_HOMOLOGATION_TOKEN=token_de_homologacao
```

Depois teste em `/admin/fiscal/configuracoes` e emita NF-e de pedido pago com produtos fiscalmente completos.

## Producao

Producao exige simultaneamente:

```env
FISCAL_PROVIDER=focusnfe
FISCAL_ENVIRONMENT=production
FISCAL_PRODUCTION_ENABLED=true
FOCUS_NFE_PRODUCTION_TOKEN=token_de_producao
```

Nao ative producao antes de homologar, validar credenciamento, certificado e série fiscal e conferir tributacao dos produtos com contador.
