import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { billingSeatAssignments } from "../tables/billing-seat-assignments.table";
import { billingSeatPlans } from "../tables/billing-seat-plans.table";

export const billingSeatPlanDbInsertSchema = createInsertSchema(billingSeatPlans);
export const billingSeatPlanDbSelectSchema = createSelectSchema(billingSeatPlans);
export const billingSeatPlanDbUpdateSchema = createUpdateSchema(billingSeatPlans);

export const billingSeatAssignmentDbInsertSchema = createInsertSchema(billingSeatAssignments);
export const billingSeatAssignmentDbSelectSchema = createSelectSchema(billingSeatAssignments);
export const billingSeatAssignmentDbUpdateSchema = createUpdateSchema(billingSeatAssignments);
