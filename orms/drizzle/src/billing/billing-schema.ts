import { billingCharges } from "./tables/billing-charges.table";
import { billingCheckouts } from "./tables/billing-checkouts.table";
import { billingCustomers } from "./tables/billing-customers.table";
import { billingDiscounts } from "./tables/billing-discounts.table";
import { billingInvoiceSequences } from "./tables/billing-invoice-sequences.table";
import { billingInvoices } from "./tables/billing-invoices.table";
import { billingMeterCredits } from "./tables/billing-meter-credits.table";
import { billingMeterEvents } from "./tables/billing-meter-events.table";
import { billingMeters } from "./tables/billing-meters.table";
import { billingOrderLines } from "./tables/billing-order-lines.table";
import { billingOrders } from "./tables/billing-orders.table";
import { billingPrices } from "./tables/billing-prices.table";
import { billingProducts } from "./tables/billing-products.table";
import { billingRefunds } from "./tables/billing-refunds.table";
import { billingSeatAssignments } from "./tables/billing-seat-assignments.table";
import { billingSeatChargeLines } from "./tables/billing-seat-charge-lines.table";
import { billingSeatInvitations } from "./tables/billing-seat-invitations.table";
import { billingSeatPlans } from "./tables/billing-seat-plans.table";
import { billingSubscriptions } from "./tables/billing-subscriptions.table";
import { billingUsageSnapshots } from "./tables/billing-usage-snapshots.table";
import { billingWebhookEvents } from "./tables/billing-webhook-events.table";

export const billingSchema = {
  billingProducts,
  billingPrices,
  billingCustomers,
  billingCheckouts,
  billingSubscriptions,
  billingCharges,
  billingWebhookEvents,
  billingOrders,
  billingOrderLines,
  billingInvoices,
  billingInvoiceSequences,
  billingRefunds,
  billingDiscounts,
  billingMeters,
  billingMeterEvents,
  billingMeterCredits,
  billingUsageSnapshots,
  billingSeatPlans,
  billingSeatAssignments,
  billingSeatInvitations,
  billingSeatChargeLines,
};
