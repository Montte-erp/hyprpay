# HyprPay vs Polar.sh — Billing Parity Capability Audit

## 1. Executive Summary

HyprPay is a **headless, BRL/Brazil-focused, self-hosted billing core** built as a plugin SDK over a single payment gateway (AbacatePay). Against Polar.sh — a multi-tenant, global Merchant-of-Record (MoR) billing platform — HyprPay achieves real parity on the *primitives* (products, prices, customers, checkouts, subscriptions, orders, refunds, discounts, events, seats, meters, entitlements all exist as typed schemas with persistence) but lags badly on the *operational surface area* that makes a billing platform usable in production. The dominant pattern across nearly every domain is identical: a capability is **modeled in the schema and exists at the database-adapter layer, but is never exposed on the public API** — there are almost no list/update/delete operations, no customer portal, no customer-state aggregation, and no API authentication. Two domains (Discounts and API/Transports) reach "mostly", everything else is "partial", and nothing reaches full parity. The single most serious *defect* (not a scope choice) is the complete absence of API authentication on a production billing surface; close behind are the missing customer portal/state model, no subscription plan-change/proration, no dunning, and no invoice/fiscal-document generation. Polar's global tax/MoR/multi-currency breadth is largely **out of scope by design** for a BRL-only self-hosted library — but a meaningful slice of what looks like "tax" (Brazilian NF-e/NFS-e fiscal documents, automatic tax computation, free/PWYW pricing, price stacking) are **genuine billing gaps**, not scope differences.

## 2. Capability Matrix

| Domain | HyprPay | Polar | Verdict |
|---|---|---|---|
| Products & Pricing | Fixed/recurring/metered/seat strategies, trials, metadata, lifecycle; single price per product, no stacking, BRL-only | Full pricing incl. PWYW/free/stacked, multi-currency, benefits, media | 🟡 partial |
| Customers & Portal | Create + getByExternalId; no portal, no state model, no list/update/delete | Hosted portal, sessions, customer-state, full CRUD | 🟡 partial |
| Checkout | Hosted redirect checkout via API, metadata, lifecycle events; create-only, no discounts/custom-fields/links | Embedded + hosted, discounts, custom fields, reusable links, PWYW | 🟡 partial |
| Subscriptions | Create/cancel/recordUsage, status lifecycle, trials; no update/plan-change/proration/dunning | Full lifecycle incl. proration, dunning, uncancel, portal | 🟡 partial |
| One-time Charges | Create charge, refunds, receipt URL, expiry; card non-functional, no read/list | Checkout sessions, benefits, invoices, card | 🟡 partial |
| Discounts / Coupons | Both types, durations, redemption cap, code lookup; no list/update/delete, no date windows, no product scope | Full coupon lifecycle incl. scheduling and product scoping | 🟡 partial → strong |
| Orders & Invoices | Order record, line items, refund tracking, events; no invoice/PDF/numbering, no billing identity | Orders + numbered invoices + PDF + billing identity | 🟡 partial |
| Refunds | Full/partial, over-refund guard, reasons, events; status hardcoded "succeeded", listByOrder only | Async status lifecycle, broad listing, benefit revocation, disputes | 🟡 partial |
| Usage / Meters / Events | Ingestion, idempotency, immutability, sum/count/max/last aggregation; no filters, no balances, not priced | Filters, bucketing, balances/credits, priced meters, no public route | 🟡 partial |
| Seat-based Billing | createPlan/assign/revoke/count/quote, included seats, events; no proration/tiers/invitation/charging | Tiered/volume seats, proration, invite+claim, portal, charging | 🟡 partial |
| Entitlements / Benefits | (customer,feature) flags + quota grant/check/consume; no license keys, no lifecycle automation, no revoke | Two-layer benefit catalog, license keys, auto grant/revoke | 🟡 partial |
| Webhooks & Events | Inbound HMAC verify, idempotency, typed taxonomy, audit trail; consumer-only, single gateway, no replay API | Outbound delivery, endpoint mgmt, retries, replay, multi-format | 🟡 partial |
| Tax / Merchant of Record | Pass-through taxAmount, tax-id capture; no calc, no MoR, no NF-e | Full MoR: auto tax, filing, remittance, reverse-charge | ❌ missing (mostly by design) |
| API / SDKs / Transports | oRPC + OpenAPI, typed TS surface, signed webhooks; no auth, TS-only, no framework adapters | Authenticated REST, multi-lang SDKs, adapters, MCP | 🟡 partial → strong |
| Analytics / Metrics | Meter aggregation primitives; no metrics API, no MRR/ARR/churn, no dashboard | MRR/ARR/churn/funnel metrics + dashboard | 🟡 partial |

## 3. Per-Domain Detail

### Products & Pricing — 🟡 partial
**Matches:** fixed-amount pricing in minor units, one-time vs recurring, week/month/year (plus quarter/half_year), metered & seat strategies as first-class, trials (0–90d), metadata, active/archived lifecycle, external provider product mapping.
**Real gaps:**
- **Price stacking (fixed base + usage), multi-dimension metered** — *high*. One amount per Price row; `hybrid` label exists but no schema to combine components. Blocks base-fee-plus-usage plans.
- **Metered pricing depth** (meter_id, unit_amount, caps, credits) — *high*. Only a `usageBased` boolean; meters plugin not wired into Price. Cannot actually price usage.
- **Update/delete/list/read on products & prices** — *high*. CatalogApi exposes only `products.create` + `prices.create`; `findById` exists at DB layer but isn't public. No update/archive/list.
- **Free tier** — *medium*. `.positive()` rejects zero.
- **PWYW / custom pricing** — *medium*. `.int().positive()` blocks variable amounts.
- **Product-attached benefits/entitlements** — *medium*. No benefit linkage in catalog.
- **Interval count** ("every 2 weeks") — *low*. Enum has no multiplier; quarter/half_year partially compensate.
- Product duplication, product media/custom checkout fields — *low*.

### Customers & Customer Portal — 🟡 partial
**Matches:** create customer, get-by-external-id as first-class lookup, key-value metadata, external IDs as integration primitive, email/name, provider-customer-id linkage.
**Real gaps (this is the weakest domain):**
- **Hosted Customer Portal** — *high*. No portal files/endpoints anywhere.
- **Customer Portal API** (build a branded portal: subs, orders, invoices, license keys, meters) — *high*. No session-authenticated surface.
- **Customer Sessions API** (pre-auth portal links/tokens) — *high*. No session/token mechanism.
- **Customer State object** (unified read: customer + subs + benefits + meter balances) + get-by-external-id — *high*. No aggregator; every domain queried separately.
- **List / search / filter / paginate customers** — *high*. No list method or endpoint.
- **Update customer (PATCH, incl. by-external-id)** — *high*. No update method anywhere.
- **Payment methods listing per customer** — *high*. Payment method lives per-subscription enum (pix/boleto/card); no customer-level concept.
- **customer.state_changed / updated / deleted webhooks** — *high* (partial). Only `billing.customer.created` is emitted; the critical sync events don't exist.
- **getByExternalId over HTTP** — *medium* (partial). Exists on the API but not in the oRPC router (router exposes only `create`).
- **Get customer by primary ID via public API** — *medium* (partial). `findById` is DB-layer only.
- **Billing address & tax_id** — *medium*. Only document (CPF/CNPJ), no structured address.
- **Delete customer (soft-delete)** — *medium*. No delete, no `deleted_at`.
- **Team customers + portal seats (invite/claim)** — *medium* (partial). Seat *billing* primitives exist; no team type, no claim lifecycle.
- Public Customer object missing timestamps/type/locale/etc. — *low* (partial).

### Checkout — 🟡 partial
**Matches:** create hosted session via API, returns `url` + provider id, customer linkage, success-URL redirect, metadata, product/price selection, created/completed events, persist + retrieve-by-id internally.
**Real gaps:**
- **Get/List/Update checkout sessions on the API** — *high* (partial). Only `create()`; `findById` exists at DB layer but isn't surfaced (contrast orders-router which has get/list).
- **Client-side / embedded confirm flow (client_secret)** — *high*. Purely redirect-based; no embed path.
- **Discounts / coupon codes at checkout** — *high*. Discounts plugin exists but is decoupled from CheckoutInput (no discountId/code field).
- **Flexible pricing at checkout** (PWYW, free, seats, metered, trials, upgrades) — *high* (partial). CheckoutInput is single-price only; no amount override, seats, trial, or subscription_id upgrade.
- **Custom fields collection** — *medium*. Only freeform metadata; no typed fields/validation.
- **Reusable checkout links with query-param overrides** — *medium*. Every session created fresh per call.
- Distinct cancel/return URL — *low* (partial). Has `cancelUrl` but no `{CHECKOUT_ID}` substitution.

### Subscriptions — 🟡 partial
**Matches:** create, status lifecycle (pending/active/past_due/canceled/…), period tracking, cancel-at-period-end intent, cancel op, trial config, usage/metered billing, seat billing, recurring intervals, lifecycle events, metadata, discount engine exists.
**Real gaps:**
- **Mid-lifecycle update (PATCH)** — *high*. API has only create/cancel/recordUsage; internal `update()` only used by cancel merge.
- **Upgrade/downgrade plan change** — *high*. No way to change priceId post-creation.
- **Proration behavior** — *high*. No proration model at all.
- **Automated dunning / retry on failed renewals** — *high*. `past_due` status exists but no retry engine — critical for churn recovery.
- **Uncancel** — *medium*. No op clears `cancelAtPeriodEnd`; no `subscription.uncanceled` event.
- **Grace period for benefit revocation** — *medium*. No configurable past_due grace window.
- **Trial editing on live subs (extend/end-now)** — *medium*. trialDays set only at creation.
- **Attach/change discount on existing subscription** — *medium* (partial). `apply()` is point-in-time only; no bind-to-subscription.
- **Auto benefit grant/revoke on lifecycle** — *medium* (partial). Entitlements plugin exists; no wiring to subscription events.
- **List/query subscriptions** — *medium* (partial). DB adapter has create/update/findById only.
- Distinct immediate-revoke vs graceful-cancel — *medium* (partial). Single cancel op.
- Reschedule billing cycle, interval count, PWYW, customer-portal self-service — *low–medium*.

### One-time Charges / Payments — 🟡 partial
**Matches:** create one-time charge, fixed-amount pricing, per-charge metadata, full/partial refunds linked to order, receipt URL, created/paid events, optional expiry, entitlement granting as separate concern, TS-native SDK.
**Real gaps:**
- **Card as a one-time method** — *high* (partial). Schema allows `card`, but the only gateway (AbacatePay) rejects it with `UNSUPPORTED_CAPABILITY`. Schema-declared but non-functional.
- **Read/list operations on charges** — *medium* (missing; corrected from partial). ChargesApi exposes only `create()`; findById/update are DB-internal. Orders is the read layer but `orders.list()` filters only by customerId/subscriptionId, not a `purchase` billing-reason filter.
- **Invoice (PDF) generation** — *medium*. Only pass-through receiptUrl; no invoice, billing name/address, or NF-e capture.
- **Pre-built benefit types** (license keys, downloads, GitHub, Discord) — *medium* (partial). Only generic grant/check/consume.
- **Hosted checkout extras** (no-code links, URL substitution, prefill, theming) — *medium* (partial). Checkouts are provider-delegated URLs.
- **PWYW / ad-hoc pricing at charge time** — *medium*. `.int().positive()` blocks it.

### Discounts / Coupons — 🟡 partial (strongest non-MoR domain)
**Matches:** percentage + fixed types, once/forever/repeating durations, repeating cycle count, global max-redemptions + counter, code lookup, metadata, create, get/findByCode, active flag, discount math with round-half-up.
**Real gaps:**
- **List / filter / paginate discounts** — *high*. API has only create/get/findByCode/apply/redeem.
- **Time-window scheduling (starts_at/ends_at)** — *high*. No date fields or enforcement.
- **Scope discount to specific products** — *high*. `apply()` takes only {code, amount}; no product scoping.
- **Recurring-duration enforcement** — *high* (partial). duration/durationInCycles stored but never read; `apply()` is one-shot, no renewal integration.
- **Update an existing discount** — *medium* (partial). `update()` exists in adapter but isn't public; effectively immutable via API.
- **Delete a discount** — *medium*. No delete anywhere; retirement needs the missing update.
- **Redemption counting integrated with application** — *medium* (partial). `apply()` ignores caps; caller must separately call `redeem()` — easy to double/under-count.

### Orders & Invoices — 🟡 partial
**Matches:** order record with status lifecycle, aligned billing reasons (+manual), line items with per-line breakdown, line-level proration, integer-cents amounts (subtotal/discount/tax/total/refunded), get-by-id with 404, list by customer/subscription, relations to customer/subscription/checkout, refund tracking, paid/refunded events, metadata.
**Real gaps:**
- **Invoice resource + PDF generation** — *high*. `invoice.*` event types exist but are type-only; no table, plugin, handlers, or PDF.
- **invoice_number / receipt_number + numbered Receipt documents** — *high*. No numbered-document resource of any kind.
- **Billing identity on order** (billing_name, billing_address) — *high*. Only a customerId reference; customer table also lacks address. Blocks issuing any invoice without external lookup.
- **Update order billing details then freeze (PATCH)** — *medium*. Router exposes create/get/list/markPaid/recordRefund only; DB `update()` not transport-exposed and only touches status/amounts/metadata.
- **Customer-facing order/invoice self-service** — *medium*. No customer-portal endpoints.
- net_amount + customer-balance/credit fields, platform_fee, seats-on-order, custom_field_data — *low* (partial).

### Refunds — 🟡 partial
**Matches:** create refund, read by id, full + partial refunds, over-refund prevention, refund reason enum, metadata, refunds linked to order with amount tracked, refund.created event, optional provider integration.
**Real gaps:**
- **Async refund status lifecycle** (pending → succeeded/failed/canceled) + status events — *high* (partial). **Status enum exists but is hardcoded to `"succeeded"` at creation and never transitions** (refunds-plugin.ts:110); `billing.refund.succeeded` is declared but never emitted. Real PSP refunds (Pix/boleto/card) are often async and can fail — this risks reconciliation drift.
- **List refunds with filters/pagination/sort** (org/customer/subscription) — *medium* (partial). Only `listByOrder(orderId)`.
- **Benefit/access revocation on refund** — *medium*. Refund doesn't touch entitlements.
- **Dispute/chargeback modeling** — *medium*. Reason enum has no dispute_prevention; no dispute object.
- **Net-amount-aware cap with balance accounting** — *medium* (partial). Caps on gross `totalAmount`; can be wrong for orders with tax/credits.
- Internal audit comment, customer_id/subscription_id on the refund object — *low*.

### Usage Billing / Meters / Events — 🟡 partial
**Matches:** event ingestion with customer id + value, idempotency/dedup, event immutability (append-only), optional backdated timestamp, per-event metadata, meter + aggregation abstraction, COUNT/SUM/MAX, period-scoped aggregation, customer/subscription association.
**Real gaps:**
- **Meter filters** (clauses over event properties) — *high*. `eventName`/`valueProperty` stored but `aggregateValues()` never applies them.
- **Per-customer meter balance / credit tracking** — *high*. No balance/consumed/credited fields; `recordUsage` is a separate unconnected model.
- **Metered pricing on products + credits integration** — *high*. No `meter_id` binding; meters decoupled from pricing/orders by design (spec §7).
- **AVERAGE/MIN/UNIQUE aggregations** — *medium* (partial). Only sum/count/max/last.
- **Time-bucketed quantities** (`/meters/{id}/quantities`) — *medium*. Returns a single scalar snapshot, not buckets.
- **Customer-state snapshot across meters** — *medium*. Must call `aggregate()` per meter.
- **Event listing/query API with pagination** — *medium*. No public route; meters plugin isn't even in the oRPC router.
- Ingestion-strategies SDK, display formatting, documented metadata caps — *low*.

### Seat-based Billing — 🟡 partial
**Matches:** seat as first-class strategy, fixed per-seat pricing, included/free seats, assign (by id or email), revoke, status enum (active/revoked), revoke-and-reassign, per-plan metadata, assigned/revoked events, count, server-side management API.
**Real gaps:**
- **Automatic proration on scale up/down** — *high*. Quote is static; proration helper exists in `@hyprpay/money` but seats never calls it.
- **Graduated (tiered) per-seat pricing** — *high*. Single `perSeatAmount` only.
- **Volume per-seat pricing** — *high*. No bulk discounts.
- **Invitation + claim-link flow** (pending → claimed) — *high*. Status enum is active/revoked only; no tokens.
- **Gateway/payment implementation for seat charges** — *high*. Seats is DB + quote only; nothing creates charges/invoices/line items.
- **Benefits/entitlements per claimed seat** — *high* (partial). Emits events but doesn't grant; entitlements use customerId+feature, not memberId — host must wire manually.
- Customer-portal seat self-service, billing-manager (non-consuming) abstraction, enforced seat limits, claimed status/event — *medium*.
- (*false-alarm, skipped:* per-seat metadata on assignments — spec intentionally omits it from the returned type.)

### Entitlements / Benefits / License Keys — 🟡 partial
**Matches:** feature-flag access control via (customerId, feature), usage-quota with limit/used/remaining + atomic consume, programmatic check endpoint, per-customer grant, pluggable persistence (Drizzle + in-memory).
**Real gaps:**
- **License Keys benefit** (issuance, validate/activate/deactivate, expiration, device limits) — *high*. Zero implementation.
- **Typed reusable benefit catalog attached to products/tiers** — *high*. Schema is (id, customerId, feature, limit, used, …); no productId, no benefit-type enum.
- **Auto grant/revoke driven by subscription & order lifecycle** — *high*. No `hooks.onEvent()`; plugin doesn't subscribe to billing events. Manual only.
- **Period/cycle credit grants, rollover, expiration/TTL** — *high*. No expiresAt/period fields; grants persist indefinitely.
- **Grant lifecycle status + explicit revoke** — *medium*. No status field, no `revoke()`; re-grant resets `used` to 0.
- **Customer State read-model + state_changed webhook** — *medium*. Per-feature check only.
- **Payment-failure grace period before revocation** — *medium*. No revoke + no delayed execution.
- Benefit metadata/descriptions, fulfillment types (downloads/GitHub/Discord/custom) — *low*.

### Webhooks & Events — 🟡 partial
**Matches:** HMAC-SHA256 signature verification with timing-safe compare, idempotent re-processing (unique provider+externalId), typed `billingEventSchema`, persisted audit trail, checkout/subscription/order/refund/dispute event types, per-consumer dispatch with catch-all.
**Real gaps:**
- **Delivery retries with backoff + auto-disable** — *medium*. No retry queue/dead-letter; relies on upstream re-sends.
- **Delivery history inspection + manual replay** — *medium* (partial). Events persist but adapter exposes only append/hasProcessed — no findById/list/query, so no replay.
- **Local webhook testing tooling (CLI listen/sandbox)** — *medium*.
- **Customer-state / entitlement-sync consolidated event** — *medium*. No `customer.*` event types.
- **Multi-gateway ingestion coverage** — *medium* (partial). Provider-agnostic abstraction exists but only AbacatePay implements it.
- First-class orderId on event schema — *low* (partial). Best-effort `deriveOrderId` with a TODO; silent failure if id is elsewhere.
- (*Out-of-scope by architecture:* outbound delivery, endpoint-management dashboard, pluggable formats — HyprPay is a consumer, not a producer.)

### Tax / Merchant of Record — ❌ missing (mostly by design)
**Matches:** per-order `taxAmount` persisted, tax folded into total (exclusive add-on), customer tax-id capture (CPF/CNPJ).
**Real gaps:**
- **Automatic tax calculation** — *high*. taxAmount is pass-through; **no ICMS/ISS/PIS/COFINS computation even within Brazil** — a genuine functional gap.
- **Tax-compliant fiscal document generation (NF-e/NFS-e)** — *high*. Zero code; "invoice" appears only as event labels. **High-impact for a Brazil product.**
- **Merchant of Record** — *high* (by design out of scope; a library can't be a legal reseller).
- Tax registration/filing/remittance, EU B2B reverse-charge — *medium–low* (by design out of scope).
- **Typed/validated tax-id + tax-driven exemptions** — *medium* (partial). Length heuristic only (11=CPF else CNPJ); no check-digit validation, never drives tax treatment.
- **Business-vs-individual + billing-address capture** — *medium*. No is_business flag, no address model.
- tax_behavior (inclusive/exclusive) + tax-aware refunds — *low*.

### API / SDKs / Integrations / Transports — 🟡 partial (strong)
**Matches:** oRPC routers for core resources under `/billing/*`, OpenAPI handler, end-to-end typed TS surface with zod, signed webhooks + normalized taxonomy, usage ingestion, subscription create/cancel, refunds over API, sandbox/production flag (provider-level).
**Real gaps:**
- **API authentication (token-based)** — *high*. **The standout defect.** Context carries only `{ api }`; no procedure checks a token; zero auth middleware across all routers; `onRequest` hooks exist but no plugin implements them. The error mapper *can* emit 401/403 but nothing produces them.
- **Multi-language SDKs (Python/Go/PHP)** — *medium* (partial). Ships only the server-side OpenAPI handler; no published TS *client*, no other languages.
- **Framework adapters (Next/Express/Fastify/Hono)** — *medium*. Manual wiring only.
- **Hosted API with documented rate limits/retries/pagination** — *medium*. Only `orders.list` paginates; no general conventions (architecture-appropriate for a library).
- **Entitlements/discounts/seats/meters over HTTP** — *medium*. These plugins exist but aren't mounted in the oRPC router; callable only via `hyprpay.api.*` in-process.
- OAuth/OIDC, MCP server — *low* (architecture-appropriate).

### Analytics / Metrics / Reporting — 🟡 partial
**Matches:** meter definitions with aggregation (sum/count/max/last — a subset of Polar's), idempotent ingestion, time-windowed UsageSnapshot, integer minor-unit currency.
**Real gaps:**
- **Metrics API** (query usage over a date range with bucketing) — *high*. No meters router; snapshots are write-only (`create()` only).
- **Subscription & revenue metrics** (MRR/ARR/ARPU/LTV/AOV/revenue) — *high*. No aggregation logic anywhere.
- **Churn & cancellation metrics** — *high*. `canceled` status exists but no churn-rate/reason aggregation API.
- **Checkout funnel/conversion metrics** — *medium*. No checkout list/query.
- **Built-in dashboard** (date range, bucketing, filtering) — *medium*. Headless; no UI.
- Finance/ledger reporting — *low* (partial). Orders list exists but no net-of-fee/payout ledger.
- Cost-insights/margin, seat-based metrics — *low*.

## 4. Prioritized Gaps (most important first)

**High impact**
1. **API authentication** (API/Transports) — *Build:* token middleware (OAT + scoped customer tokens) on the oRPC context; wire `onRequest` to enforce it. This is the only true production-blocker defect.
2. **Customer Portal API + Customer Sessions** (Customers) — *Build:* a session-token mechanism and a customer-scoped API (subs, orders, invoices, license keys, meters).
3. **Customer State aggregator + state_changed webhook** (Customers/Entitlements) — *Build:* a single `getCustomerState(externalId)` returning customer + active subs + granted benefits + meter balances, plus the `customer.state_changed` event.
4. **List/update operations across resources** (Customers, Discounts, Checkouts, Subscriptions, Orders, Charges) — *Build:* surface the already-existing DB-adapter `findById`/`list`/`update` methods on the public API + oRPC routers; add list/filter/paginate.
5. **Subscription plan change + proration** (Subscriptions) — *Build:* PATCH subscription with priceId swap and a `proration_behavior` (invoice/prorate/next_period) engine.
6. **Automated dunning / retry on failed renewals** (Subscriptions) — *Build:* a retry schedule + grace-period state machine on `past_due`, with auto-revoke.
7. **Async refund status lifecycle** (Refunds) — *Build:* stop hardcoding `"succeeded"`; model pending→succeeded/failed/canceled driven by provider callbacks; emit status events.
8. **Invoice/receipt resource + PDF + numbering + billing identity** (Orders) — *Build:* invoice table, sequential numbering, billing_name/address snapshot, PDF generation.
9. **Brazilian fiscal documents (NF-e/NFS-e) + automatic tax calc** (Tax) — *Build:* fiscal-provider integration and tax computation; the genuinely-missing slice of "tax" for a BR product.
10. **Meter filters, balances/credits, and meter→pricing binding** (Meters) — *Build:* filter clauses in `aggregateValues`, per-customer credit balances, and a `meter_id` on Price wired into orders.
11. **Discounts at checkout + checkout pricing flexibility** (Checkout) — *Build:* discountId/code, custom fields, PWYW/seats/trial/upgrade fields on CheckoutInput.
12. **Seat proration + tiered/volume pricing + invite-claim + charging** (Seats) — *Build:* proration on scale, tiered schema, pending/claimed invitation flow, and actual charge creation.
13. **Entitlement lifecycle automation + benefit catalog + license keys** (Entitlements) — *Build:* event-driven grant/revoke wiring, a product-attached benefit-type catalog, and a license-key benefit.
14. **Price stacking + metered pricing depth + PWYW/free tiers** (Products) — *Build:* multi-component prices, meter binding, allow zero/variable amounts.
15. **Metrics API + revenue/churn metrics** (Analytics) — *Build:* a meters/metrics HTTP surface plus MRR/ARR/churn rollups.

**Medium impact**
16. **Embedded/client_secret checkout + reusable checkout links** (Checkout).
17. **Per-customer payment-method storage & listing** (Customers).
18. **Webhook replay/history API + retry/backoff** (Webhooks).
19. **Discount scheduling (date windows) + product scoping + recurring enforcement** (Discounts).
20. **Multi-language SDKs + framework adapters** (API/Transports).
21. **Benefit revocation + dispute modeling on refunds; broad refund listing** (Refunds).
22. **Uncancel, trial editing, discount-on-subscription wiring** (Subscriptions).

## 5. Scope Note — Out-of-Scope-by-Design vs Genuine Gaps

**Legitimately out of scope for a BRL-focused, self-hosted, non-MoR library** (flagging these as Polar gaps overstates the comparison):
- **Multi-currency** — `z.literal("BRL")` is a deliberate, repeated design choice across every plugin. Polar's 130+ currencies with geolocation target cross-border SaaS.
- **Merchant of Record + global tax** — VAT/GST/US-sales-tax calculation, EU B2B reverse-charge, jurisdiction registration, filing & remittance. A self-hosted library *cannot* be a legal reseller; the seller stays liable. Polar's MoR breadth is a different product class.
- **Outbound webhook delivery, endpoint-management dashboard, pluggable delivery formats** — HyprPay is a webhook *consumer* by architecture, not a producer.
- **OAuth/OIDC, MCP server, hosted-platform rate limits** — appropriate for a multi-tenant SaaS, not a self-hosted core.
- **Hosted analytics dashboard / UI** — HyprPay is headless by design (no `.tsx`/`.vue` in repo).
- Tax-refund proration, tax_behavior, EU constructs — tied to the MoR scope decision.

**Genuine missing billing features (NOT excused by the BR/self-hosted scope — these matter for the stated market):**
- **API authentication** — non-negotiable for any production billing surface, hosted or not.
- **Customer portal/state, list/update/delete across resources** — operational basics independent of geography or MoR status.
- **Subscription plan change, proration, dunning, uncancel** — core subscription-business mechanics; churn recovery is geography-neutral.
- **Async refund status** — the hardcoded-`succeeded` bug is a data-integrity risk specifically *because* Brazilian Pix/boleto/card refunds are async and can fail.
- **Automatic tax computation + NF-e/NFS-e fiscal documents** — while *global* MoR is out of scope, *Brazilian* fiscal compliance (NF-e/NFS-e) and even domestic ICMS/ISS computation are squarely in-scope and entirely absent.
- **Invoice/receipt generation + numbering + billing identity** — required to issue any Brazilian fiscal document.
- **Meter filters, balances, and meter→price binding** — without these, usage-based billing is non-functional regardless of currency.
- **Free and PWYW pricing** — common, currency-neutral billing models blocked by `.positive()`.
- **Card payments** — schema-declared but rejected by the only gateway; a functional gap, not a scope choice.

**Bottom line:** HyprPay has built a clean, well-typed *foundation* of billing primitives, but ships them as a thin create-only API over a single gateway. To match Polar *within its own BR/self-hosted scope*, the priority is not chasing global MoR/multi-currency — it's adding **auth, the full CRUD/portal/state surface, subscription lifecycle mechanics (proration/dunning), real refund-status handling, and Brazilian fiscal-document generation.**