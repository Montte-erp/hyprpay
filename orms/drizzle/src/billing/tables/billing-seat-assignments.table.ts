import { jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { SeatAssignment } from "../../seats-plugin";

const billing = pgSchema("billing");

export const billingSeatAssignments = billing.table("seat_assignments", {
  id: text("id").primaryKey(),
  subscriptionId: text("subscription_id").notNull(),
  memberId: text("member_id").notNull(),
  memberEmail: text("member_email"),
  status: text("status").notNull(),
  assignedAt: text("assigned_at").notNull(),
  revokedAt: text("revoked_at"),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
