import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { profileTable } from "../../shared/db/schema/profile";
import { drizzlePg } from "clients/drizzle_postgres_client";

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Use service role key to access auth users

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface SupabaseUser {
  id: string;
  email: string;
  user_metadata?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    role?: string; // Add role to the interface
  };
  created_at: string;
}

async function syncUsers() {
  try {
    console.log("🔄 Starting user sync...");

    // Fetch all users from Supabase
    const { data: supabaseUsers, error } =
      await supabase.auth.admin.listUsers();

    if (error) {
      throw new Error(`Failed to fetch Supabase users: ${error.message}`);
    }

    console.log(`📥 Found ${supabaseUsers.users.length} Supabase users`);

    // Fetch profiles from Supabase profiles table
    const { data: supabaseProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, role");

    if (profilesError) {
      console.warn(
        `⚠️ Could not fetch Supabase profiles: ${profilesError.message}`
      );
    }

    // Create a map of user ID to role from Supabase profiles
    const roleMap = new Map<string, string>();
    if (supabaseProfiles) {
      supabaseProfiles.forEach((profile) => {
        roleMap.set(profile.id, profile.role || "user");
      });
    }

    // Fetch existing profiles from local database
    const existingProfiles = await drizzlePg
      .select({ id: profileTable.id, email: profileTable.email })
      .from(profileTable);
    const existingEmails = new Set(existingProfiles.map((p) => p.email));
    const existingIds = new Set(existingProfiles.map((p) => p.id));

    console.log(`📦 Found ${existingProfiles.length} existing profiles`);

    // Process each Supabase user
    const usersToCreate: Array<
      Omit<typeof profileTable.$inferInsert, "created_at" | "updated_at">
    > = [];
    const usersToUpdate: Array<
      Omit<typeof profileTable.$inferInsert, "created_at" | "updated_at">
    > = [];

    for (const user of supabaseUsers.users) {
      if (!user.email) {
        console.log(`⚠️  Skipping user ${user.id} - no email`);
        continue;
      }

      const userData = {
        id: user.id,
        email: user.email,
        first_name:
          user.user_metadata?.first_name ||
          user.user_metadata?.full_name?.split(" ")[0] ||
          null,
        last_name:
          user.user_metadata?.last_name ||
          user.user_metadata?.full_name?.split(" ").slice(1).join(" ") ||
          null,
        role: (roleMap.get(user.id) as "admin" | "user") || "user", // Cast to the correct type
      };

      if (existingIds.has(user.id)) {
        // User exists, might need to update
        usersToUpdate.push(userData);
      } else if (existingEmails.has(user.email)) {
        // Email exists but different ID - potential conflict
        console.log(
          `⚠️  Email conflict: ${user.email} exists with different ID`
        );
      } else {
        // New user to create
        usersToCreate.push(userData);
      }
    }

    // Create new profiles
    if (usersToCreate.length > 0) {
      console.log(`➕ Creating ${usersToCreate.length} new profiles...`);

      for (const userData of usersToCreate) {
        try {
          await drizzlePg.insert(profileTable).values(userData);
          console.log(`✅ Created profile for ${userData.email}`);
        } catch (error) {
          console.error(
            `❌ Failed to create profile for ${userData.email}:`,
            error
          );
        }
      }
    }

    // Update existing profiles if needed
    if (usersToUpdate.length > 0) {
      console.log(`🔄 Updating ${usersToUpdate.length} existing profiles...`);

      for (const userData of usersToUpdate) {
        try {
          await drizzlePg
            .update(profileTable)
            .set({
              email: userData.email,
              first_name: userData.first_name,
              last_name: userData.last_name,
              role: userData.role, // Also update the role
            })
            .where(eq(profileTable.id, userData.id));
          console.log(`✅ Updated profile for ${userData.email}`);
        } catch (error) {
          console.error(
            `❌ Failed to update profile for ${userData.email}:`,
            error
          );
        }
      }
    }

    console.log("🎉 User sync completed successfully!");

    // Summary
    const finalCount = await drizzlePg
      .select({ count: profileTable.id })
      .from(profileTable);
    console.log(`📊 Total profiles in database: ${finalCount.length}`);
  } catch (error) {
    console.error("💥 Sync failed:", error);
    process.exit(1);
  }
}

// Run the sync
syncUsers();
