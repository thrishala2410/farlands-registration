import { provisionAdminAccount } from "../lib/auth";
import { getAdminClient } from "../lib/supabase/admin";

async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_USERNAME) throw new Error("ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_USERNAME are required");
  if (ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");

  const email = ADMIN_EMAIL.trim().toLowerCase();
  try {
    const user = await provisionAdminAccount(email, ADMIN_PASSWORD, ADMIN_USERNAME.trim());
    console.log(`Provisioned admin ${user.id}`);
  } catch (err) {
    const admin = getAdminClient();
    const { data } = await admin.auth.admin.listUsers();
    const existing = data?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, { password: ADMIN_PASSWORD });
      await admin.from("auth_profiles").upsert({ user_id: existing.id, role: "admin", username: ADMIN_USERNAME.trim() });
      console.log(`Admin user already exists. Verified and updated credentials for ${existing.id}`);
      return;
    }
    throw err;
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Admin provisioning failed"); process.exitCode = 1; });
