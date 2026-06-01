# Montte Billing — um Polar.sh para o Brasil

> Documento de produto/estratégia para explorar uma camada de monetização brasileira dentro do Montte: produtos, planos, cobranças, Pix, boleto, cartão, parcelamento, entitlements, fiscal, conciliação e revenue analytics.

## 1. Resumo executivo

A ideia é construir no Montte uma infraestrutura de billing voltada para o mercado brasileiro, com a simplicidade de plataformas como Polar.sh, mas adaptada para a realidade local:

- Pix;
- boleto;
- cartão parcelado;
- assinatura por cartão, Pix ou boleto;
- CPF/CNPJ;
- nota fiscal;
- inadimplência;
- conciliação;
- múltiplos gateways;
- revenue analytics;
- entitlements e controle de acesso.

O objetivo não é ser apenas um wrapper de gateways. O objetivo é criar uma camada completa de monetização:

```txt
Produto → Preço → Checkout → Cobrança → Pagamento → Acesso → Fiscal → Conciliação → Receita
```

Posicionamento possível:

> A forma mais simples de vender software, serviços e produtos digitais no Brasil.

Ou:

> O Polar.sh para o Brasil — com Pix, boleto, parcelamento e nota fiscal.

---

## 2. Problema

Cobrar no Brasil é complexo. Uma empresa que quer vender software, assinatura, serviço recorrente, produto digital, API ou créditos precisa lidar com várias camadas ao mesmo tempo.

### 2.1 Gateways fragmentados

Cada provedor tem sua própria API, modelo de dados e formato de webhook:

- Asaas;
- Pagar.me;
- Mercado Pago;
- Iugu;
- Efí/Gerencianet;
- PagSeguro;
- Stripe Brasil;
- AbacatePay;
- Celcoin;
- Stark Bank.

Cada um modela de forma diferente:

- cliente;
- cobrança;
- assinatura;
- fatura;
- pagamento;
- Pix;
- boleto;
- cartão;
- estorno;
- chargeback;
- split;
- recebíveis.

Resultado: empresas reconstroem billing do zero ou ficam presas a um gateway.

### 2.2 O Brasil não é Stripe-first

Ferramentas gringas normalmente partem de:

```txt
cartão → assinatura → webhook → acesso
```

No Brasil, isso é insuficiente. Uma solução local precisa tratar como cidadãos de primeira classe:

- Pix QR Code;
- Pix copia e cola;
- expiração de Pix;
- Pix recorrente quando aplicável;
- boleto;
- multa e juros;
- segunda via;
- cartão parcelado;
- juros do comprador ou vendedor;
- antecipação;
- assinatura por boleto;
- assinatura com Pix;
- CPF/CNPJ;
- nota fiscal;
- taxas e prazos de recebimento por método.

### 2.3 Billing não é só pagamento

Gerar uma cobrança é apenas uma parte do problema. Empresas também precisam responder:

- Qual plano o cliente comprou?
- Ele pode acessar quais features?
- Quantos assentos ele tem?
- Quantos créditos restam?
- Está inadimplente?
- Deve ser bloqueado?
- A nota fiscal foi emitida?
- Quanto foi pago bruto?
- Quanto foi descontado em taxa?
- Qual foi o valor líquido?
- Qual foi o MRR real?
- Qual foi o churn?
- Qual foi a expansão?

O Montte Billing deve resolver a jornada inteira.

---

## 3. Tese do produto

Empresas brasileiras não querem apenas integrar pagamentos. Elas querem vender, cobrar, liberar acesso, emitir nota, acompanhar receita e reduzir inadimplência.

A tese:

> Billing deve ser uma camada de produto, não uma coleção de integrações com gateways.

O Montte pode ser essa camada.

---

## 4. Público-alvo inicial

### 4.1 ICP principal

- SaaS B2B brasileiro;
- micro-SaaS;
- produtos digitais recorrentes;
- ferramentas de IA;
- APIs pagas;
- plataformas com planos;
- comunidades pagas;
- agências productizadas;
- consultorias com recorrência;
- infoprodutos com cobrança recorrente ou parcelada.

### 4.2 Perfil de adoção

Usuários com dor clara:

- founder técnico que não quer construir billing do zero;
- time pequeno que precisa lançar cobrança rápido;
- empresa que usa Asaas/Pagar.me/Mercado Pago diretamente e sofre com webhooks;
- SaaS que quer cobrar em Pix, boleto e cartão sem perder controle de acesso;
- empresa que quer revenue analytics sem depender do PostHog Revenue Analytics;
- operação que precisa conciliar gateway, nota fiscal e inadimplência.

---

## 5. Produto proposto

Nome recomendado:

```txt
Montte Billing
```

Alternativas:

- Montte Pay;
- Montte Revenue;
- ReceitaKit;
- BillingKit Brasil;
- CobrançaKit.

Recomendação: **Montte Billing**, porque é B2B, extensível e conversa com ERP, financeiro e revenue operations.

---

## 6. Pilares do Montte Billing

## 6.1 Catálogo de produtos

A entidade central não deve ser o gateway. Deve ser o que a empresa vende.

Tipos de produto:

- plano SaaS;
- assinatura;
- pagamento único;
- pacote de créditos;
- API usage;
- licença anual;
- curso;
- comunidade;
- serviço recorrente;
- setup fee;
- add-on;
- pacote de horas;
- marketplace/split.

Exemplo conceitual em TypeScript:

```ts
const pro = product({
  id: "pro",
  name: "Plano Pro",
  description: "Para times em crescimento",
  prices: [
    price({
      id: "pro-monthly",
      amount: 9900,
      currency: "BRL",
      interval: "month",
    }),
    price({
      id: "pro-yearly",
      amount: 99000,
      currency: "BRL",
      interval: "year",
    }),
  ],
  features: {
    seats: 5,
    projects: "unlimited",
    aiCredits: 1000,
    support: "priority",
  },
});
```

---

## 6.2 Checkout universal

O checkout deve ser independente do gateway.

O usuário cria um checkout informando produto, cliente e métodos de pagamento. O Montte decide ou roteia para o gateway configurado.

```ts
await billing.checkout.create({
  productId: "pro",
  priceId: "pro-monthly",
  customer: {
    name: "Empresa XPTO",
    email: "financeiro@xpto.com.br",
    document: "12345678000199",
  },
  methods: ["pix", "boleto", "card"],
  successUrl: "https://app.exemplo.com/success",
  cancelUrl: "https://app.exemplo.com/cancel",
});
```

Por baixo, o checkout pode usar:

- Asaas;
- Pagar.me;
- Mercado Pago;
- Iugu;
- Efí;
- Stripe.

Mas o código do cliente não deve mudar se o gateway mudar.

---

## 6.3 Assinaturas

Assinaturas devem ser entidade central, não detalhe do gateway.

Tipos suportados:

- mensal;
- anual;
- trimestral;
- semestral;
- por assento;
- por uso;
- híbrida;
- com trial;
- com setup fee;
- com boleto recorrente;
- com cartão recorrente;
- com Pix manual ou recorrente, conforme suporte do gateway.

Estados possíveis:

```txt
trialing
active
past_due
paused
canceled
ended
incomplete
pending_payment
```

Exemplo:

```ts
await billing.subscriptions.create({
  customerId: "cus_123",
  priceId: "price_pro_monthly",
  paymentMethod: "card",
  trialDays: 14,
});
```

---

## 6.4 Entitlements

Esse é um dos principais diferenciais. O Montte Billing não deve apenas confirmar pagamento. Ele deve responder o que o cliente pode usar.

Perguntas que a API deve responder:

- cliente pode acessar determinada feature?
- quantos assentos pode criar?
- quantos créditos restam?
- qual limite mensal?
- está bloqueado por inadimplência?
- cancelou, mas ainda tem acesso até o fim do período?

Exemplo:

```ts
const access = await billing.entitlements.check({
  customerId: "cus_123",
  feature: "ai_assistant",
});

if (!access.allowed) {
  throw new Error("Feature não disponível no plano atual");
}
```

Consumo de uso:

```ts
await billing.entitlements.consume({
  customerId: "cus_123",
  feature: "ai_credits",
  amount: 10,
});
```

Features comuns:

- users;
- seats;
- projects;
- storage_gb;
- ai_credits;
- api_calls;
- premium_support;
- white_label;
- custom_domain;
- exports;
- integrations.

---

## 6.5 Webhooks normalizados

Cada gateway emite eventos diferentes. O Montte deve transformar tudo em eventos padronizados.

Eventos normalizados:

```txt
checkout.created
checkout.completed
payment.created
payment.pending
payment.paid
payment.failed
payment.refunded
payment.chargeback_created
subscription.created
subscription.activated
subscription.renewed
subscription.past_due
subscription.canceled
subscription.ended
invoice.created
invoice.paid
invoice.overdue
invoice.canceled
entitlement.granted
entitlement.revoked
fiscal_invoice.issued
fiscal_invoice.failed
```

Exemplo de handler:

```ts
billing.webhooks.handle(request, {
  onPaymentPaid: async event => {
    await unlockAccess(event.customerId);
  },

  onSubscriptionCanceled: async event => {
    await revokeAtPeriodEnd(event.customerId);
  },

  onInvoiceOverdue: async event => {
    await notifyCustomer(event.customerId);
  },
});
```

---

## 6.6 Pix first

Pix precisa ser tratado como método principal, não fallback.

Funcionalidades necessárias:

- QR Code;
- copia e cola;
- expiração;
- status pending/paid/expired;
- devolução;
- webhook de confirmação;
- link de pagamento;
- envio por email/WhatsApp;
- reconciliação.

Exemplo:

```ts
await billing.charges.create({
  customerId: "cus_123",
  amount: 19900,
  currency: "BRL",
  method: "pix",
  expiresInMinutes: 30,
});
```

Resposta esperada:

```ts
{
  id: "charge_123",
  status: "pending",
  pix: {
    qrCodeUrl: "https://...",
    copyPaste: "00020126580014br.gov.bcb.pix...",
    expiresAt: "2026-06-01T15:30:00Z"
  }
}
```

---

## 6.7 Boleto de verdade

Boleto não deve ser apenas um link. Precisa ter semântica operacional:

- vencimento;
- segunda via;
- multa;
- juros;
- desconto até data;
- compensação;
- baixa;
- cancelamento;
- inadimplência.

Exemplo:

```ts
await billing.charges.create({
  customerId: "cus_123",
  amount: 49900,
  method: "boleto",
  dueDate: "2026-06-10",
  boleto: {
    finePercent: 2,
    interestPercentPerMonth: 1,
    instructions: "Não receber após 30 dias do vencimento",
  },
});
```

---

## 6.8 Cartão e parcelamento

Parcelamento é obrigatório para muitos modelos brasileiros.

Funcionalidades:

- cartão à vista;
- cartão recorrente;
- parcelamento;
- juros para comprador;
- juros para vendedor;
- tokenização;
- retentativa;
- antifraude;
- chargeback;
- estorno.

Exemplo:

```ts
await billing.charges.create({
  customerId: "cus_123",
  amount: 120000,
  method: "card",
  installments: 12,
  card: {
    token: "card_token_123",
  },
});
```

---

## 6.9 Fiscal

No Brasil, billing fica incompleto sem nota fiscal.

Integrações possíveis:

- NFE.io;
- Focus NFe;
- PlugNotas;
- eNotas;
- Omie;
- Conta Azul;
- provedores municipais via parceiros.

Fluxo ideal:

```txt
payment.paid
  → validar dados fiscais
  → emitir NFS-e
  → salvar nota
  → enviar ao cliente
  → anexar ao financeiro
```

Entidade conceitual:

```txt
FiscalInvoice
├─ provider
├─ serviceCode
├─ status
├─ amount
├─ taxAmount
├─ pdfUrl
├─ xmlUrl
├─ issuedAt
└─ errorReason
```

---

## 6.10 Conciliação

Conciliação é onde o produto pode se diferenciar de um simples SDK.

O Montte deve mostrar:

- valor bruto;
- taxa do gateway;
- taxa antifraude;
- valor líquido;
- data prevista de recebimento;
- data realizada de recebimento;
- gateway;
- método;
- status.

Exemplo de visão:

```txt
Pagamento #pay_123

Valor bruto: R$ 100,00
Taxa gateway: -R$ 3,49
Taxa antifraude: -R$ 0,40
Valor líquido: R$ 96,11
Recebimento previsto: 10/06/2026
Recebido em: 10/06/2026
Gateway: Pagar.me
Método: Cartão 3x
```

---

## 6.11 Revenue Analytics

Com billing controlado pelo Montte, o revenue analytics fica mais confiável do que em ferramentas genéricas.

Métricas:

- MRR;
- ARR;
- receita bruta;
- receita líquida;
- New MRR;
- Expansion MRR;
- Contraction MRR;
- Churned MRR;
- Net New MRR;
- Gross Revenue Retention;
- Net Revenue Retention;
- ARPA;
- ARPU;
- LTV;
- churn rate;
- trial conversion;
- inadimplência;
- receita por plano;
- receita por gateway;
- receita por método de pagamento;
- receita por segmento.

Movements:

```txt
Cliente A  +R$ 299  new
Cliente B  +R$ 100  expansion
Cliente C  -R$ 50   contraction
Cliente D  -R$ 199  churn
```

---

## 7. Tipos de cobrança suportados

### 7.1 Assinatura fixa

```txt
R$ 99/mês
```

### 7.2 Assinatura anual

```txt
R$ 990/ano
```

### 7.3 Por assento

```txt
R$ 49/mês por usuário
```

Exemplo:

```txt
10 usuários × R$ 49 = R$ 490/mês
```

### 7.4 Uso medido

```txt
R$ 0,10 por chamada de API
R$ 0,05 por crédito de IA
R$ 1,00 por GB extra
```

### 7.5 Pré-pago

```txt
Compra R$ 500 em créditos
Consome ao longo do mês
Recarrega quando acabar
```

### 7.6 Híbrido

```txt
R$ 99/mês + excedente por uso
```

### 7.7 Pagamento único

- curso;
- licença;
- setup fee;
- consultoria;
- produto digital.

### 7.8 Parcelado

```txt
R$ 1.200 em 12x
```

Com controle de:

- parcela;
- taxa;
- valor líquido;
- antecipação;
- inadimplência.

### 7.9 Boleto recorrente

```txt
todo mês gera boleto
envia para cliente
acompanha pagamento
bloqueia se atrasar
```

### 7.10 Marketplace/split

```txt
cliente paga R$ 100
plataforma fica com R$ 10
fornecedor recebe R$ 90
```

---

## 8. Arquitetura conceitual

```txt
Montte Billing
├─ Core domain
├─ Provider adapters
├─ Webhook normalizer
├─ Entitlement engine
├─ Checkout engine
├─ Fiscal engine
├─ Reconciliation engine
├─ Revenue analytics
├─ Dashboard
└─ Public API / SDK
```

Pacotes possíveis:

```txt
@montte/billing-core
@montte/billing-asaas
@montte/billing-pagarme
@montte/billing-mercadopago
@montte/billing-iugu
@montte/billing-efi
@montte/billing-stripe
@montte/billing-react
@montte/billing-orpc
```

Interface conceitual de adapter:

```ts
interface PaymentProviderAdapter {
  id: string;

  createCustomer(input: CreateCustomerInput): Promise<ProviderCustomer>;

  createCheckout(input: CreateCheckoutInput): Promise<ProviderCheckout>;

  createCharge(input: CreateChargeInput): Promise<ProviderCharge>;

  createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<ProviderSubscription>;

  cancelSubscription(
    input: CancelSubscriptionInput,
  ): Promise<ProviderSubscription>;

  refundPayment(input: RefundPaymentInput): Promise<ProviderRefund>;

  parseWebhook(input: ParseWebhookInput): Promise<BillingEvent>;
}
```

---

## 9. Modelo de dados inicial

### 9.1 Produtos

```txt
billing_products
- id
- organization_id
- name
- description
- type
- status
- metadata
- created_at
- updated_at
```

### 9.2 Preços

```txt
billing_prices
- id
- product_id
- currency
- amount
- interval
- interval_count
- pricing_type
- usage_type
- trial_days
- metadata
```

### 9.3 Clientes

```txt
billing_customers
- id
- organization_id
- external_id
- name
- email
- document
- document_type
- phone
- address
- metadata
```

### 9.4 Assinaturas

```txt
billing_subscriptions
- id
- customer_id
- product_id
- price_id
- provider
- provider_subscription_id
- status
- current_period_start
- current_period_end
- trial_start
- trial_end
- canceled_at
- cancel_at_period_end
```

### 9.5 Cobranças

```txt
billing_charges
- id
- customer_id
- provider
- provider_charge_id
- amount
- currency
- method
- status
- due_date
- paid_at
- failed_at
- refunded_at
```

### 9.6 Pagamentos

```txt
billing_payments
- id
- charge_id
- provider
- provider_payment_id
- gross_amount
- fee_amount
- net_amount
- currency
- status
- method
- paid_at
- expected_settlement_date
- settled_at
```

### 9.7 Entitlements

```txt
billing_entitlements
- id
- customer_id
- subscription_id
- feature_key
- limit_value
- used_value
- reset_interval
- reset_at
- status
```

### 9.8 Revenue movements

```txt
billing_revenue_movements
- id
- customer_id
- subscription_id
- type
- amount
- currency
- effective_at
- previous_mrr
- new_mrr
```

Tipos:

```txt
new
expansion
contraction
churn
reactivation
```

---

## 10. API pública desejada

### 10.1 Criar cliente

```ts
await billing.customers.create({
  name: "Empresa XPTO",
  email: "financeiro@xpto.com.br",
  document: "12345678000199",
});
```

### 10.2 Criar checkout

```ts
await billing.checkout.create({
  customerId: "cus_123",
  priceId: "price_pro_monthly",
  methods: ["pix", "boleto", "card"],
});
```

### 10.3 Criar assinatura

```ts
await billing.subscriptions.create({
  customerId: "cus_123",
  priceId: "price_pro_monthly",
  paymentMethod: "card",
});
```

### 10.4 Criar cobrança avulsa

```ts
await billing.charges.create({
  customerId: "cus_123",
  amount: 29900,
  currency: "BRL",
  method: "pix",
});
```

### 10.5 Checar acesso

```ts
await billing.entitlements.check({
  customerId: "cus_123",
  feature: "ai_credits",
});
```

### 10.6 Consumir uso

```ts
await billing.entitlements.consume({
  customerId: "cus_123",
  feature: "ai_credits",
  amount: 20,
});
```

---

## 11. Dashboard no Montte

Menu sugerido:

```txt
Financeiro
├─ Visão geral
├─ Clientes
├─ Produtos
├─ Preços
├─ Checkouts
├─ Assinaturas
├─ Cobranças
├─ Pagamentos
├─ Inadimplência
├─ Recebíveis
├─ Notas fiscais
├─ Revenue Analytics
├─ Gateways
└─ Configurações
```

### 11.1 Visão geral

Cards:

- MRR;
- ARR;
- receita do mês;
- pagamentos pendentes;
- inadimplência;
- churn;
- Expansion MRR;
- valor a receber.

### 11.2 Produtos

Colunas:

- produto;
- preço;
- métodos aceitos;
- clientes ativos;
- MRR;
- churn;
- status.

### 11.3 Assinaturas

Colunas:

- cliente;
- plano;
- status;
- valor;
- renovação;
- método;
- gateway.

Ações:

- alterar plano;
- cancelar;
- pausar;
- reenviar cobrança;
- gerar segunda via;
- ver histórico.

### 11.4 Inadimplência

Colunas:

- cliente;
- valor em aberto;
- dias em atraso;
- última tentativa;
- método;
- status da cobrança;
- próxima ação.

Ações:

- reenviar boleto;
- gerar Pix;
- retentar cartão;
- enviar email;
- enviar WhatsApp;
- bloquear acesso;
- negociar.

### 11.5 Revenue Analytics

Métricas principais:

- MRR atual;
- Net New MRR;
- New MRR;
- Expansion;
- Contraction;
- Churn;
- NRR;
- GRR.

Gráfico de movements:

```txt
+ New
+ Expansion
- Contraction
- Churn
= Net New
```

---

## 12. MVP recomendado

Objetivo: entregar a promessa central com menor escopo possível.

### 12.1 Incluir no MVP

- produtos;
- preços;
- clientes;
- checkout hospedado;
- Asaas como primeiro gateway;
- Pix;
- boleto;
- cartão simples;
- assinaturas;
- webhooks normalizados;
- entitlements simples;
- dashboard básico de receita.

### 12.2 Deixar para depois

- multi-gateway completo;
- nota fiscal;
- split;
- usage-based billing avançado;
- cartão parcelado avançado;
- conciliação profunda;
- antecipação;
- marketplace.

### 12.3 Por que Asaas primeiro

Asaas cobre bem o primeiro escopo:

- Pix;
- boleto;
- cartão;
- assinatura;
- cobrança avulsa;
- webhooks;
- clientes.

É um bom gateway para validar a tese no Brasil sem começar com complexidade excessiva.

---

## 13. Roadmap

### Fase 1 — Foundation

- Core billing domain;
- Product/Price/Customer;
- Asaas adapter;
- Checkout hosted;
- Charges;
- Subscriptions;
- Webhook normalizer;
- Basic entitlements;
- Basic dashboard.

### Fase 2 — Billing brasileiro real

- boleto avançado;
- Pix completo;
- cartão parcelado;
- dunning;
- inadimplência;
- payment links;
- emails transacionais.

### Fase 3 — Multi-gateway

- Pagar.me;
- Mercado Pago;
- Iugu;
- Efí;
- Stripe;
- gateway routing;
- fallback por método.

### Fase 4 — Fiscal

- NFS-e;
- NFE.io/Focus/PlugNotas/eNotas;
- emissão automática;
- reenvio;
- tratamento de falhas fiscais;
- configuração municipal.

### Fase 5 — Revenue Analytics

- MRR;
- ARR;
- movements;
- churn;
- expansion;
- contraction;
- cohorts;
- forecast;
- revenue by plan/customer/segment.

### Fase 6 — FinOps e margem

- custos SaaS;
- Railway/Vercel/Neon/OpenAI;
- margem por cliente;
- unit economics;
- LTV/CAC.

---

## 14. Diferenciais competitivos

### 14.1 Contra gateways

Gateways resolvem pagamento. Montte Billing resolve monetização.

```txt
Gateway:
"gerei uma cobrança"

Montte Billing:
"esse cliente comprou esse plano, pagou via Pix, recebeu acesso,
teve nota emitida, entrou no MRR e será bloqueado se ficar inadimplente"
```

### 14.2 Contra Stripe/Polar

Stripe e Polar são excelentes, mas não são brasileiros por padrão.

Montte Billing entende:

- Pix;
- boleto;
- CPF/CNPJ;
- cartão parcelado;
- NFS-e;
- inadimplência brasileira;
- gateway local;
- recebíveis;
- conciliação.

### 14.3 Contra ERPs tradicionais

ERPs tradicionais geralmente são pouco developer-friendly.

Montte Billing deve ser:

- API-first;
- SDK TypeScript;
- webhooks limpos;
- checkout moderno;
- dashboard operacional;
- integrado ao financeiro.

---

## 15. Moat potencial

O moat vem de combinar coisas que normalmente ficam separadas:

```txt
billing
gateway abstraction
entitlements
fiscal
ERP financeiro
revenue analytics
cost analytics
customer margin
```

Com o tempo, o Montte poderia responder:

- quanto o cliente paga;
- quanto custa atender esse cliente;
- qual margem ele dá;
- quais features ele usa;
- qual risco de churn;
- qual plano deveria comprar;
- qual método de pagamento reduz inadimplência;
- qual gateway tem melhor taxa/recebimento para aquele tipo de cobrança.

Isso é mais forte do que apenas processar pagamento.

---

## 16. Estratégia de entrada

A melhor wedge é começar como billing simples para SaaS brasileiro:

```txt
Produtos + checkout + Pix/boleto/cartão + assinatura + entitlements
```

Depois expandir para:

```txt
inadimplência → fiscal → conciliação → revenue analytics → margem por cliente
```

Estratégia curta:

> Começar como billing para SaaS brasileiro. Expandir para revenue operations, fiscal, conciliação e margem por cliente.

---

## 17. Conclusão

Montte Billing pode ser uma das wedges mais fortes do produto.

Não é apenas uma feature de pagamento. É uma plataforma para monetização brasileira:

- vender produtos e planos;
- aceitar Pix, boleto e cartão;
- suportar parcelamento;
- controlar acesso;
- normalizar webhooks;
- lidar com inadimplência;
- emitir nota fiscal;
- conciliar taxas e recebíveis;
- medir MRR, churn e expansão;
- conectar receita com custos e margem.

Caminho recomendado:

```txt
1. Construir Montte Billing como camada de monetização.
2. Começar com Asaas + Pix + boleto + cartão + assinaturas.
3. Adicionar entitlements desde o início.
4. Criar checkout hosted e API simples.
5. Evoluir para multi-gateway.
6. Adicionar fiscal e conciliação.
7. Fechar com revenue analytics e margem por cliente.
```

Resumo final:

> Montte Billing pode ser a infraestrutura de monetização para produtos brasileiros — simples como Polar, mas feita para a realidade do Brasil.
