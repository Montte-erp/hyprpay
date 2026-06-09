import { jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

const billing = pgSchema("billing");

export const billingSeatInvitations = billing.table("seat_invitations", {
  id: text("id").primaryKey(),
  subscriptionId: text("subscription_id").notNull(),
  memberEmail: text("member_email").notNull(),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by"),
  status: text("status").notNull(),
  invitedAt: text("invited_at").notNull(),
  claimedAt: text("claimed_at"),
  revokedAt: text("revoked_at"),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
