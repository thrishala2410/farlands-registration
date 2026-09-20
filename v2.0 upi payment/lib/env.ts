import { z } from "zod";

const supabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

const manualPaymentSchema = z.object({
  PAYMENT_UPI_ID: z.string().trim().min(3).max(120),
});

export type SupabaseEnvironment = z.infer<typeof supabaseSchema>;
export type ManualPaymentEnvironment = z.infer<typeof manualPaymentSchema>;

function validate<T>(schema: z.ZodType<T>, values: unknown, label: string): T {
  const parsed = schema.safeParse(values);
  if (!parsed.success) throw new Error(`${label} configuration is missing or invalid`);
  return parsed.data;
}

export function getSupabaseEnv(): SupabaseEnvironment {
  return validate(supabaseSchema, process.env, "Supabase");
}

/** The UPI ID is configured server-side and returned only to an authenticated team payment page. */
export function getManualPaymentEnv(): ManualPaymentEnvironment {
  return validate(manualPaymentSchema, process.env, "Manual payment");
}
