import { z } from "zod";
import { currencySchema, metadataSchema, paymentMethodSchema } from "./shared-schema";

/**
 * A typed custom field collected at checkout. `key` identifies the field, `label`
 * is the human-facing prompt, `value` is what the buyer supplied. Unlike freeform
 * `metadata`, custom fields carry an explicit label so they can be rendered and
 * persisted with their question intact.
 */
export const checkoutCustomFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
});

/**
 * Prefilled customer data collected/known at checkout time. All fields optional so
 * a partial prefill (e.g. just an email) is valid.
 */
export const checkoutCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  document: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
});

export const checkoutInputSchema = z.object({
  customerId: z.string().min(1),
  priceId: z.string().min(1),
  methods: z.array(paymentMethodSchema).min(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  metadata: metadataSchema.optional(),
  providerProductId: z.string().min(1).optional(),
  // Discounts: either an existing discount id or a coupon code may be supplied.
  // The computed amount is reduced by the resolved discount.
  discountId: z.string().min(1).optional(),
  discountCode: z.string().min(1).optional(),
  // Custom fields + prefilled customer data collected at checkout.
  customFields: z.array(checkoutCustomFieldSchema).optional(),
  customer: checkoutCustomerSchema.optional(),
  // Flexible pricing: PWYW / custom amount (centavos) overrides the catalog price
  // amount when the price allows custom pricing (billingStrategy custom/hybrid or
  // a price flagged custom-priced). Non-negative to allow free (0) tiers.
  customAmount: z.number().int().nonnegative().optional(),
  // Trial selection at checkout (days). Coordinates with subscription_with_trial
  // pricing strategies.
  trialDays: z.number().int().nonnegative().max(90).optional(),
  // Upgrade/plan-change context: the subscription this checkout amends.
  subscriptionId: z.string().min(1).optional(),
});

export const checkoutSchema = checkoutInputSchema.extend({
  id: z.string().min(1),
  providerCheckoutId: z.string().optional(),
  url: z.string().url(),
  amount: z.number().int().nonnegative(),
  currency: currencySchema,
  status: z.enum(["pending", "paid", "expired", "canceled", "refunded"]),
  // Discount applied to this checkout, if any. `discountAmount` is the centavos
  // subtracted from the gross price; `appliedDiscountId` is the resolved discount.
  discountAmount: z.number().int().nonnegative().default(0),
  appliedDiscountId: z.string().min(1).optional(),
});

export type CheckoutCustomField = z.infer<typeof checkoutCustomFieldSchema>;
export type CheckoutCustomer = z.infer<typeof checkoutCustomerSchema>;
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type Checkout = z.infer<typeof checkoutSchema>;
