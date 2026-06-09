# HyprPay rearchitecture — FROZEN IMPLEMENTATION SPEC

This is the binding contract for the migration. Every agent MUST follow it exactly.
Cross-package export names below are FROZEN — do not rename. The design rationale lives in
`hyprpay-billing-core-rearchitecture.md`; this file is the executable contract.

## 0. Golden rules (read first)

1. **Read these reference files** to copy conventions exactly before writing any package:
   - Plugin shape: `plugins/catalog/src/catalog-plugin.ts`, `plugins/subscriptions/src/subscriptions-plugin.ts`
   - Result/Error: `plugins/catalog/src/results/billing-result.ts`, `plugins/catalog/src/errors/core-errors.ts`, `plugins/catalog/src/errors/core-error-catalog.ts`
   - Schemas: `plugins/catalog/src/schemas/shared-schema.ts`, `plugins/catalog/src/schemas/product-schema.ts`
   - Contracts: `plugins/catalog/src/contracts/catalog-database-adapter.ts`, `catalog-provider-adapter.ts`
   - Core plugin contract: `core/core/src/contracts/hyprpay-plugin.ts`
   - tsconfig + package.json templates: `plugins/catalog/tsconfig.json`, `plugins/catalog/package.json`
   - Drizzle hub: `orms/drizzle/src/index.ts`, `orms/drizzle/src/billing/drizzle-adapter.ts`, `orms/drizzle/src/billing/tables/billing-products.table.ts`
2. **Money is integer centavos (BRL only).** `currency` is always the literal `"BRL"`. Never floats.
3. **`BillingResult<T> = Result<T, BillingError>`** from `better-result`. Every async domain op returns it.
4. **Each plugin owns its own copies** of `results/billing-result.ts`, `errors/core-errors.ts`,
   `errors/core-error-catalog.ts`, `schemas/shared-schema.ts` — copy from catalog, change the
   `defineErrorCatalog("hyprpay.<ns>", …)` id and the `declare module "evlog"` key to the plugin's namespace.
5. **Do NOT run `bun install` / `bun add`.** Declare deps with explicit versions in `package.json`.
   The orchestrator runs a single root `bun install`.
6. **tsconfig**: every package copies the catalog tsconfig verbatim (`extends ../../tsconfig.base.json`,
   rootDir src, outDir dist, tsBuildInfoFile dist/.tsbuildinfo, include src/**/*.ts).
   base has `verbatimModuleSyntax` → use `import type` for type-only imports.
   base has `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` → optional fields must not be
   assigned `undefined` explicitly when the prop is omitted; guard array index access.
7. **package.json template** (per package): copy catalog's; set `name`, `main`/`types`/`exports` to the
   primary entry file's dist path, `files:["dist"]`, build/typecheck scripts identical.
8. ids via `crypto.randomUUID()`. Timestamps as ISO strings via `new Date().toISOString()`.
9. Plugin `id` = kebab-case, `namespace` = camelCase. Emit events through `runtime.emit`.

## 1. Target workspace graph (build order)

```
core/core                  @hyprpay/core         (unchanged)
shared/money               @hyprpay/money        NEW  (dinero.js, leaf)
shared/http                @hyprpay/http         NEW  (ky, leaf)
plugins/catalog            @hyprpay/catalog      EDIT (add billingStrategy)
plugins/customers          @hyprpay/customers    (unchanged)
plugins/checkouts          @hyprpay/checkouts    (unchanged)
plugins/charges            @hyprpay/charges      EDIT (demote: doc comment only)
plugins/subscriptions      @hyprpay/subscriptions(unchanged)
plugins/discounts          @hyprpay/discounts    NEW
plugins/orders             @hyprpay/orders       NEW  (financial center)
plugins/refunds            @hyprpay/refunds      NEW  (depends on orders)
plugins/meters             @hyprpay/meters       NEW
plugins/seats              @hyprpay/seats        NEW
plugins/entitlements       @hyprpay/entitlements (unchanged)
plugins/webhooks           @hyprpay/webhooks     EDIT (emit order on paid events)
orms/drizzle               @hyprpay/drizzle      EDIT (drizzle-orm/zod + new tables/repos)
transports/orpc            @hyprpay/orpc         NEW
integrations/better-auth   @hyprpay/better-auth  NEW
gateways/abacatepay        @hyprpay/abacatepay   EDIT (debloat + use @hyprpay/http)
```

## 2. shared/money — @hyprpay/money

Entry `src/money.ts`. deps: `dinero.js`, `@dinero.js/currencies`, `better-result`. devDeps none extra.
- Use **dinero.js v2** if it types cleanly; define BRL as `{ code: "BRL", base: 10, exponent: 2 }`.
- **FALLBACK**: if dinero v2 alpha causes type/install problems, implement the SAME public API with
  pure integer arithmetic (no floats, round half-up). The public API must be identical either way and
  must NEVER leak a Dinero object — inputs/outputs are plain `number` (centavos) / `string`.
- Public API (FROZEN names):
  ```ts
  export const BRL: { code: "BRL"; base: 10; exponent: 2 };
  export function formatBRL(centavos: number): string;            // "R$ 10,00"
  export function percentageOf(centavos: number, percent: number): number;   // round half-up
  export function applyDiscount(centavos: number, discount: { type: "percentage" | "fixed"; value: number }): { discountAmount: number; net: number };
  export function allocate(centavos: number, ratios: number[]): number[];     // sums to input
  export function prorate(input: { periodStart: string; periodEnd: string; changeAt: string; amount: number }): number;
  export function sumAmounts(...amounts: number[]): number;
  export function multiplyQuantity(unitAmount: number, quantity: number): number;
  ```
- All amounts integer centavos, non-negative unless stated. Add a `src/money.test.ts` with bun tests.

## 3. shared/http — @hyprpay/http

Entry `src/index.ts`. deps: `ky`, `better-result`, `zod`.
- Public API (FROZEN):
  ```ts
  export interface HttpClientOptions { prefix: string; headers?: Record<string,string>; timeoutMs?: number; retry?: number; }
  export interface HttpClient { request<T>(opts: RequestOptions<T>): Promise<Result<T, HttpError>>; }
  export interface RequestOptions<T> { method: "GET"|"POST"|"PUT"|"PATCH"|"DELETE"; path: string; body?: unknown; searchParams?: Record<string,string>; schema: z.ZodType<T>; headers?: Record<string,string>; }
  export class HttpError extends TaggedError("HttpError")<{ message: string; status?: number; cause?: unknown }>() {}
  export function createHttpClient(options: HttpClientOptions): HttpClient;
  ```
- `request` wraps ky.create(prefix/headers/timeout/retry), does the call, safe-parses JSON, validates
  with `schema`, normalizes failures to `HttpError`. retry default 0. Files: `create-http-client.ts`,
  `http-error.ts`, `index.ts`. Add `src/index.test.ts` (can mock fetch via a stub schema path).

## 4. plugins/discounts — @hyprpay/discounts

deps: `@hyprpay/core`, `@hyprpay/money`, better-result, evlog, zod. Entry `src/discounts-plugin.ts`.
Catalog id `"hyprpay.discounts"`.
- Schemas (`src/schemas/discount-schema.ts`):
  ```ts
  discountTypeSchema = z.enum(["percentage","fixed"]);
  discountDurationSchema = z.enum(["once","forever","repeating"]);
  discountInputSchema = z.object({ code: z.string().min(1), type: discountTypeSchema, value: z.number().int().positive(), currency: z.literal("BRL").default("BRL"), duration: discountDurationSchema.default("once"), durationInCycles: z.number().int().positive().optional(), maxRedemptions: z.number().int().positive().optional(), active: z.boolean().default(true), metadata: metadataSchema.optional() });
  // value = percent (1..100) when type=percentage, centavos when type=fixed
  discountSchema = discountInputSchema.extend({ id: z.string().min(1), timesRedeemed: z.number().int().nonnegative().default(0), createdAt: z.string().min(1) });
  ```
- `DiscountsApi`: `create(DiscountInput)`, `get(id)`, `findByCode(code)`, `apply(input:{code:string; amount:number}) → BillingResult<{ discountAmount:number; net:number; discount:Discount }>` (uses money.applyDiscount; percentage→percentageOf), `redeem(id)`.
- `contracts/discounts-database-adapter.ts`: `DiscountsDatabaseAdapter { discounts: { create(Discount), findById(id), findByCode(code), update(Discount) → BillingResult<…|null where noted> } }`. Export `DiscountLookupAdapter = Pick<…,"discounts">`.
- Events: `DiscountPluginEvent = { type:"billing.discount.created"; payload: Discount } | { type:"billing.discount.redeemed"; payload: Discount }`.
- FROZEN exports: `discounts`, `DiscountsApi`, `DiscountsPluginOptions`, `DiscountsDatabaseAdapter`, `DiscountLookupAdapter`, `DiscountPluginEvent`, `discountInputSchema`, `discountSchema`, `discountTypeSchema`, `discountDurationSchema`, types `Discount`, `DiscountInput`, plus `BillingError`, `billingErrors`, `BillingResult`.

## 5. plugins/orders — @hyprpay/orders  (FINANCIAL CENTER)

deps: `@hyprpay/core`, `@hyprpay/money`, better-result, evlog, zod. Entry `src/orders-plugin.ts`.
Catalog id `"hyprpay.orders"`.
- Schemas (`src/schemas/order-schema.ts`):
  ```ts
  billingReasonSchema = z.enum(["purchase","subscription_create","subscription_cycle","subscription_update","manual"]);
  orderStatusSchema = z.enum(["pending","paid","refunded","partially_refunded","canceled"]);
  orderLineTypeSchema = z.enum(["product","usage","proration","discount","tax"]);
  orderLineSchema = z.object({ id: z.string().min(1), label: z.string().min(1), priceId: z.string().optional(), type: orderLineTypeSchema.default("product"), quantity: z.number().int().positive().default(1), unitAmount: z.number().int(), amount: z.number().int() });
  orderInputSchema = z.object({ customerId: z.string().min(1), billingReason: billingReasonSchema, currency: z.literal("BRL").default("BRL"), items: z.array(orderLineInputSchema).min(1), checkoutId: z.string().optional(), subscriptionId: z.string().optional(), discountAmount: z.number().int().nonnegative().default(0), taxAmount: z.number().int().nonnegative().default(0), metadata: metadataSchema.optional() });
  // orderLineInputSchema = orderLineSchema without id/amount (computed); compute amount = multiplyQuantity(unitAmount,quantity)
  orderSchema = z.object({ id, customerId, status: orderStatusSchema, billingReason, currency:"BRL", items: orderLineSchema[], subtotalAmount, discountAmount, taxAmount, totalAmount, amountRefunded: default 0, checkoutId?, subscriptionId?, providerOrderId?, metadata, createdAt });
  ```
  Totals computed with @hyprpay/money: subtotal = sum(line.amount), total = subtotal - discountAmount + taxAmount (>=0).
- `OrdersApi` (FROZEN): `create(OrderInput) → BillingResult<Order>`, `get(id) → BillingResult<Order|null>`, `list(filter:{customerId?:string; subscriptionId?:string}) → BillingResult<Order[]>`, `markPaid(id) → BillingResult<Order>`, `recordRefund(input:{orderId:string; amount:number}) → BillingResult<Order>` (increments amountRefunded, sets status refunded/partially_refunded, guards over-refund → INVALID_INPUT).
- `contracts/orders-database-adapter.ts`: `OrdersDatabaseAdapter { orders: { create(Order), findById(id), update(Order), list(filter) } }`. Export `OrdersLookupAdapter = Pick<…,"orders">`.
- `OrdersRefundPort` (FROZEN, in `src/orders-plugin.ts`): `{ recordRefund(input:{orderId:string;amount:number}): Promise<BillingResult<Order>>; get(id:string): Promise<BillingResult<Order|null>> }` — refunds plugin consumes this; it is a structural subset of `OrdersApi`.
- Events: `OrderPluginEvent = {type:"billing.order.created";payload:Order} | {type:"billing.order.paid";payload:Order} | {type:"billing.order.refunded";payload:Order}`.
- FROZEN exports: `orders`, `OrdersApi`, `OrdersPluginOptions`, `OrdersDatabaseAdapter`, `OrdersLookupAdapter`, `OrdersRefundPort`, `OrderPluginEvent`, schemas listed, types `Order`,`OrderInput`,`OrderLine`,`BillingReason`,`OrderStatus`, plus `BillingError`,`billingErrors`,`BillingResult`.

## 6. plugins/refunds — @hyprpay/refunds  (depends on orders)

deps: `@hyprpay/core`, `@hyprpay/orders`, `@hyprpay/money`, better-result, evlog, zod. Entry `src/refunds-plugin.ts`.
Catalog id `"hyprpay.refunds"`.
- Schemas (`src/schemas/refund-schema.ts`):
  ```ts
  refundStatusSchema = z.enum(["pending","succeeded","failed","canceled"]);
  refundReasonSchema = z.enum(["requested_by_customer","duplicate","fraudulent","other"]);
  refundInputSchema = z.object({ orderId: z.string().min(1), amount: z.number().int().positive().optional(), reason: refundReasonSchema.default("requested_by_customer"), metadata: metadataSchema.optional() }); // amount omitted = full remaining
  refundSchema = refundInputSchema.extend({ id, amount: z.number().int().positive(), currency: z.literal("BRL"), status: refundStatusSchema, providerRefundId: z.string().optional(), createdAt: z.string().min(1) });
  ```
- `RefundsApi` (FROZEN): `create(RefundInput) → BillingResult<Refund>`, `get(id)`, `listByOrder(orderId) → BillingResult<Refund[]>`.
  create flow: load order via `options.orders.get`; compute remaining = totalAmount - amountRefunded; default amount=remaining; guard amount<=remaining (else INVALID_INPUT); optionally call `options.provider?.createRefund` (provider optional); persist refund; call `options.orders.recordRefund({orderId, amount})`; emit `billing.refund.created`.
- `contracts/refunds-database-adapter.ts`: `RefundsDatabaseAdapter { refunds: { create(Refund), findById(id), listByOrder(orderId) } }`.
- `contracts/refunds-provider-adapter.ts`: `RefundsProviderAdapter { id: string; createRefund?(input:{orderId:string;amount:number;providerOrderId?:string}): Promise<BillingResult<{providerRefundId:string}>> }`.
- `RefundsPluginOptions { database: RefundsDatabaseAdapter; orders: import("@hyprpay/orders").OrdersRefundPort; provider?: RefundsProviderAdapter }`.
- Events: `RefundPluginEvent = {type:"billing.refund.created";payload:Refund} | {type:"billing.refund.succeeded";payload:Refund}`.
- FROZEN exports: `refunds`, `RefundsApi`, `RefundsPluginOptions`, `RefundsDatabaseAdapter`, `RefundsProviderAdapter`, `RefundPluginEvent`, schemas, types `Refund`,`RefundInput`, plus errors.

## 7. plugins/meters — @hyprpay/meters

deps: `@hyprpay/core`, `@hyprpay/money`, better-result, evlog, zod. Entry `src/meters-plugin.ts`. Catalog id `"hyprpay.meters"`.
- Schemas: `meterAggregationSchema = z.enum(["sum","count","max","last"])`.
  `meterInputSchema = z.object({ slug, name, eventName: z.string().min(1), aggregation: meterAggregationSchema.default("sum"), valueProperty: z.string().optional(), active: z.boolean().default(true), metadata? })`; `meterSchema = .extend({id, createdAt})`.
  `meterEventInputSchema = z.object({ meterId, customerId, subscriptionId?, value: z.number().nonnegative().default(1), timestamp: z.string().optional(), idempotencyKey?: z.string().optional(), metadata? })`; `meterEventSchema = .extend({id, timestamp: z.string()})`.
  `usageSnapshotSchema = z.object({ id, meterId, subscriptionId, periodStart, periodEnd, aggregatedValue: z.number(), createdAt })`.
- `MetersApi` (FROZEN): `createMeter(MeterInput) → BillingResult<Meter>`, `ingest(MeterEventInput) → BillingResult<MeterEvent>` (idempotent on idempotencyKey), `aggregate(input:{meterId; subscriptionId; periodStart; periodEnd}) → BillingResult<UsageSnapshot>` (applies aggregation over events in window).
- `contracts/meters-database-adapter.ts`: `MetersDatabaseAdapter { meters:{create,findById,findBySlug}; meterEvents:{append, listForPeriod(input:{meterId;subscriptionId?;periodStart;periodEnd}), findByIdempotencyKey(key)}; snapshots:{create} }`.
- Events: `MeterPluginEvent = {type:"billing.meter.created";payload:Meter} | {type:"billing.meter.event.ingested";payload:MeterEvent}`.
- FROZEN exports: `meters`, `MetersApi`, `MetersPluginOptions`, `MetersDatabaseAdapter`, `MeterPluginEvent`, schemas, types `Meter`,`MeterInput`,`MeterEvent`,`MeterEventInput`,`UsageSnapshot`,`MeterAggregation`, errors.

## 8. plugins/seats — @hyprpay/seats

deps: `@hyprpay/core`, `@hyprpay/money`, better-result, evlog, zod. Entry `src/seats-plugin.ts`. Catalog id `"hyprpay.seats"`.
- Schemas: `seatAssignmentStatusSchema = z.enum(["active","revoked"])`.
  `seatPlanInputSchema = z.object({ priceId: z.string().min(1), includedSeats: z.number().int().nonnegative().default(0), perSeatAmount: z.number().int().nonnegative(), metadata? })`; `seatPlanSchema = .extend({id, createdAt})`.
  `seatAssignInputSchema = z.object({ subscriptionId, memberId: z.string().min(1), memberEmail: z.string().email().optional(), metadata? })`; `seatAssignmentSchema = z.object({ id, subscriptionId, memberId, memberEmail?, status: seatAssignmentStatusSchema, assignedAt, revokedAt? })`.
- `SeatsApi` (FROZEN): `createPlan(SeatPlanInput) → BillingResult<SeatPlan>`, `assign(SeatAssignInput) → BillingResult<SeatAssignment>` (idempotent per (subscriptionId,memberId) active), `revoke(input:{assignmentId}) → BillingResult<SeatAssignment>`, `count(subscriptionId) → BillingResult<number>` (active), `quote(input:{subscriptionId; planId}) → BillingResult<{seats:number; amount:number}>` (amount via money: max(0, activeSeats - includedSeats) * perSeatAmount).
- `contracts/seats-database-adapter.ts`: `SeatsDatabaseAdapter { seatPlans:{create,findById}; assignments:{create,update,findById,listActive(subscriptionId), findActiveByMember(input:{subscriptionId;memberId})} }`.
- Events: `SeatPluginEvent = {type:"billing.seat.assigned";payload:SeatAssignment} | {type:"billing.seat.revoked";payload:SeatAssignment}`.
- FROZEN exports: `seats`, `SeatsApi`, `SeatsPluginOptions`, `SeatsDatabaseAdapter`, `SeatPluginEvent`, schemas, types `SeatPlan`,`SeatPlanInput`,`SeatAssignment`,`SeatAssignInput`, errors.

## 9. plugins/catalog — EDIT (billingStrategy)

In `src/schemas/shared-schema.ts` add:
```ts
export const billingStrategySchema = z.enum(["one_time","subscription","subscription_with_trial","metered","hybrid","seat"]);
```
In `src/schemas/price-schema.ts`: add `billingStrategy: billingStrategySchema.optional()` to `priceInputSchema`
(keep `usageBased` for back-compat). Export `billingStrategySchema` from `catalog-plugin.ts`. Do not break
existing exports. The orms drizzle prices table must gain a nullable `billing_strategy` column (handled by drizzle agent).

## 10. plugins/charges — EDIT (demote)

Add a top-of-file doc comment in `src/charges-plugin.ts` stating charges is now a low-level payment detail,
superseded by `@hyprpay/orders` as the financial record. NO behavioral change, NO export removal.

## 11. plugins/webhooks — EDIT (emit to orders)

Add OPTIONAL `orders?: import("@hyprpay/orders").OrdersLookupAdapter` to `WebhooksPluginOptions` and a new
event arm `{ type:"billing.order.paid"; payload: import("@hyprpay/orders").Order }` is NOT required here —
instead keep webhooks decoupled: when a `payment.paid`/`checkout.completed` event resolves and an
`orderId` (from event metadata `order_id` or `normalizedResult.data` if present) is available and
`options.orders` is set, look up the order and `runtime.emit({type:"billing.order.paid", payload: order})`.
Keep it additive and guarded; do NOT break existing charge/checkout emission. Add `@hyprpay/orders` to deps.
If wiring proves to need a billing-event field that does not exist, SKIP the order emission gracefully
(guarded) rather than inventing schema changes — leave a `// TODO` and keep build green.

## 12. orms/drizzle — EDIT (drizzle-orm/zod + new tables/repos)

- **Phase-3 schema discipline**: replace the alias files in `src/billing/zod/*` so DB schemas come from
  `drizzle-orm/zod`: `createInsertSchema(table)`, `createSelectSchema(table)`, `createUpdateSchema(table)`.
  Rename exports to the FROZEN db names: e.g. `billingCustomerDbInsertSchema`, `billingCustomerDbSelectSchema`,
  `billingCustomerDbUpdateSchema` (and product/price/subscription equivalents). Update `drizzle-adapter.ts`
  and `index.ts` to use the new names. Keep old export names as deprecated aliases (`export { billingCustomerDbInsertSchema as billingCustomerInsertSchema }`) so existing imports do not break.
  Import from `drizzle-orm/zod`. If a generated schema's optionality fights `exactOptionalPropertyTypes`,
  refine with `.partial()`/`.extend()` minimally.
- **New tables** under `src/billing/tables/` (pgSchema "billing"), integer centavos as `integer(...)`,
  jsonb metadata default {}, text ids, timestamptz createdAt:
  `billing-orders.table.ts` (billingOrders), `billing-order-lines.table.ts` (billingOrderLines, FK orderId),
  `billing-refunds.table.ts`, `billing-discounts.table.ts`, `billing-meters.table.ts`,
  `billing-meter-events.table.ts`, `billing-usage-snapshots.table.ts`, `billing-seat-plans.table.ts`,
  `billing-seat-assignments.table.ts`, `billing-auth-links.table.ts` (unique authUserId, unique billingCustomerId).
  Also add nullable `billing_strategy` text column to `billing-prices.table.ts`.
- **Repositories/adapters**: implement each new plugin's `*DatabaseAdapter` contract over Drizzle, following
  the existing `drizzle-adapter.ts` map/parse pattern. Add factory exports to `src/index.ts` (FROZEN names):
  `createDrizzleOrdersAdapter`, `createDrizzleRefundsAdapter`, `createDrizzleDiscountsAdapter`,
  `createDrizzleMetersAdapter`, `createDrizzleSeatsAdapter`, `createDrizzleBillingAuthLinkStore`.
  Extend `createDrizzleAdapters` to include orders/refunds/discounts/meters/seats. Merge new tables into
  `hyprpayDrizzleSchema`. Add deps `@hyprpay/orders`, `@hyprpay/refunds`, `@hyprpay/discounts`,
  `@hyprpay/meters`, `@hyprpay/seats` to package.json. Remove dead `dayjs` dep.

## 13. transports/orpc — @hyprpay/orpc (NEW)

deps: `@orpc/server`, `@orpc/openapi`, `zod`, `@hyprpay/core`, `better-result`, and type-only the plugin packages
whose api shapes you expose. Entry `src/index.ts`.
- Build with the orpc server builder (`os` / `implement` from `@orpc/server`) + `OpenAPIHandler` from `@orpc/openapi`.
  CONSULT installed `node_modules/@orpc/*` d.ts for the exact current API; keep it minimal and COMPILING.
- `src/error/billing-result-to-orpc-error.ts`: `unwrap<T>(result: BillingResult<T>): T` that throws an `ORPCError`
  built from `error.status ?? error.error.status` and `error.message`. Never serialize `Result` to the client.
- Routers in `src/routers/`: `catalog-router.ts`, `customers-router.ts`, `checkouts-router.ts`,
  `subscriptions-router.ts`, `orders-router.ts`, `refunds-router.ts`. Each procedure declares explicit
  `method` + `path` under `/billing/...` (e.g. `POST /billing/customers`, `GET /billing/orders/{id}`,
  `POST /billing/refunds`), validates input with zod, calls `hyprpay.api.<ns>.<op>`, unwraps the result.
  Use `inputStructure: "detailed"` where headers/params/body matter (idempotency, ids).
- `src/create-hyprpay-orpc-router.ts` composes routers; `src/create-hyprpay-openapi-handler.ts` returns an
  `OpenAPIHandler` over the router. Accept the typed `hyprpay` instance (its `.api`) as context.
- **Webhooks stay raw** — add a code comment; do NOT route webhooks through orpc.
- If a precise orpc API call is uncertain after checking the d.ts, prefer the simplest compiling form and
  leave a focused `// TODO` rather than guessing a broken signature. Keep the package building.

## 14. integrations/better-auth — @hyprpay/better-auth (NEW)

deps: `@hyprpay/customers`, `better-result`, `zod`; peerDep `better-auth` (also add to deps for typecheck). Entry `src/index.ts`.
- `src/store/billing-auth-link-store.ts`: `BillingAuthLink` type ({id, authUserId, billingCustomerId, provider, providerAccountId?, lastSyncedAt, createdAt, updatedAt}); `BillingAuthLinkStore` interface
  ({findByAuthUserId, findByBillingCustomerId, upsert}); plus `createInMemoryBillingAuthLinkStore()`.
- `src/mappers/map-user-to-customer-draft.ts`: type `MapUserToCustomerDraft = (user) => CustomerInput | null`
  (null when fiscal data missing).
- `src/create-better-auth-billing-sync.ts`: `createBetterAuthBillingSync({ customers: import("@hyprpay/customers").CustomersApi, store: BillingAuthLinkStore, mapUserToCustomerDraft: MapUserToCustomerDraft })`.
  Two-level sync (idempotent): always upsert the auth↔billing link; create a PSP customer ONLY when
  `mapUserToCustomerDraft` returns a non-null draft. Constraints: unique authUserId, unique billingCustomerId.
- `src/hooks/create-auth-sync-hooks.ts`: builds Better Auth `after` hooks that, on user create/sign-in, invoke
  the sync. Type better-auth hook context LOOSELY (consult installed `better-auth` types; keep minimal/compiling).
- FROZEN exports: `createBetterAuthBillingSync`, `createInMemoryBillingAuthLinkStore`, `createAuthSyncHooks`,
  types `BillingAuthLink`, `BillingAuthLinkStore`, `MapUserToCustomerDraft`.

## 15. gateways/abacatepay — EDIT (debloat)

Refactor toward the doc's target. Concrete required changes (keep it COMPILING & behavior-preserving where possible):
1. Use `@hyprpay/http` for the HTTP client (`createAbacatePayClient` builds on `createHttpClient`) instead of
   importing `ky` directly. Remove `ky` direct usage from the gateway.
2. `environment` MUST select base URL: sandbox vs production. Define both URLs in `abacatepay-endpoints.ts`
   (or env file) and pick by `parsed.data.environment`. (Use `https://api.abacatepay.com/v2` for production;
   for sandbox use the same base unless a sandbox host is known — leave a `// TODO` documenting the assumption.)
3. Remove the dead `dayjs` dependency from package.json.
4. Collapse the `operations/` + `mappers/` split: each capability provider module under `src/providers/`
   contains input-map + HTTP call + output-map together (catalog/customers/checkouts/subscriptions/webhooks).
   You MAY keep small pure status-mapper helpers under `src/shared/`. Delete now-empty `operations/`,`mappers/`.
5. Replace `invalidConfigGateway` per-method stubs with a single `withClient()` helper: validate config once;
   on invalid config every capability returns the shared `invalidAbacatePayConfig()` error via the helper.
6. `webhookSecret`: keep the HMAC signature verification in the webhooks provider; the query-string
   `webhookSecret` check is a weak secondary gate — keep it but document it; do NOT make it the primary check.
7. Keep `id`(local) vs `providerCustomerId` separation already present; ensure new code preserves it.
8. Keep the public factory name `createAbacatePayGateway` (+ `createAbacatePayAdapter` alias) and the
   `AbacatePayGateway` shape unchanged so the composition root keeps working.
Add `@hyprpay/http` to deps.

## 16. Verification contract for every agent

Before finishing, each agent: (a) ensures its package.json deps are declared (no install), (b) re-reads its
new files for obvious type errors against `exactOptionalPropertyTypes`/`verbatimModuleSyntax`,
(c) returns a structured summary: files created/edited, deps added, and any `// TODO`/risk left open.
Do NOT run `bun run build` (deps not installed yet). The orchestrator installs + typechecks centrally.
