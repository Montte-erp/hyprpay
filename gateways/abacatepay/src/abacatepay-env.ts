import { z } from "zod";

export const abacatePayEnvironmentSchema = z.enum(["sandbox", "production"]);

export const abacatePayAdapterOptionsSchema = z.object({
  apiKey: z.string().min(1),
  environment: abacatePayEnvironmentSchema.default("sandbox"),
  webhookSecret: z.string().min(1).optional(),
});

export const ABACATEPAY_PUBLIC_WEBHOOK_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

export type AbacatePayAdapterOptions = z.infer<typeof abacatePayAdapterOptionsSchema>;
