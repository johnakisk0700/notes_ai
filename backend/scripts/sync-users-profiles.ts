import "dotenv/config";
import { clerkClient } from "@clerk/express";
import { profileTable } from "@shared/db/schema/profile";
import { drizzlePg } from "clients/drizzle_postgres_client";

// Backfill local `profile` rows from Clerk. Identity lives in Clerk; this keeps
// our Postgres profile table (role/settings) in sync. Run: `bun run scripts/sync-users-profiles.ts`.
async function syncUsers() {
  console.log("🔄 Starting Clerk → profile sync...");

  let synced = 0;
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data: clerkUsers } = await clerkClient.users.getUserList({
      limit,
      offset,
    });

    if (clerkUsers.length === 0) break;

    for (const user of clerkUsers) {
      const email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses?.[0]?.emailAddress;

      if (!email) {
        console.log(`⚠️  Skipping ${user.id} - no email`);
        continue;
      }

      await drizzlePg
        .insert(profileTable)
        .values({
          id: user.id,
          email,
          first_name: user.firstName ?? null,
          last_name: user.lastName ?? null,
          role: "user",
        })
        .onConflictDoUpdate({
          target: profileTable.id,
          set: {
            email,
            first_name: user.firstName ?? null,
            last_name: user.lastName ?? null,
            updated_at: new Date(),
          },
        });

      synced++;
      console.log(`✅ Synced ${email}`);
    }

    offset += clerkUsers.length;
    if (clerkUsers.length < limit) break;
  }

  const finalCount = await drizzlePg
    .select({ id: profileTable.id })
    .from(profileTable);
  console.log(
    `🎉 Sync complete. Synced ${synced} Clerk users. Total profiles in database: ${finalCount.length}`
  );
}

syncUsers().catch((error) => {
  console.error("💥 Sync failed:", error);
  process.exit(1);
});
