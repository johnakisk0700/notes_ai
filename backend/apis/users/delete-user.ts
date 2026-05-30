import { notesTable } from "@shared/db/schema/notes";
import { profileTable } from "@shared/db/schema/profile";
import { remindersTable } from "@shared/db/schema/reminders";
import { clerkClient } from "@clerk/express";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { qdrantClient } from "clients/qdrant_client";
import { notesRepo } from "repositories/notes";
import { eq } from "drizzle-orm";
import { logger } from "utils/logger";

// Admin-only: delete a user from Clerk and purge their local data.
export async function deleteUser(req, res) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  // Collect the user's note ids up front so we can drop their Qdrant vectors after the purge.
  const noteIds = await notesRepo.idsForUser(userId);

  await drizzlePg.transaction(async tx => {
    await tx.delete(remindersTable).where(eq(remindersTable.userId, userId));
    await tx.delete(notesTable).where(eq(notesTable.userId, userId));
    await tx.delete(profileTable).where(eq(profileTable.id, userId));
  });

  // Remove the identity from Clerk (authoritative). Unexpected failures propagate to errorHandler.
  await clerkClient.users.deleteUser(userId);

  // Qdrant cleanup is best-effort: the authoritative Postgres + Clerk deletes already
  // succeeded, so a Qdrant hiccup must not 500 the request. Orphaned vectors are harmless —
  // search_notes validates every hit against Postgres, and reembed-notes prunes them.
  if (noteIds.length > 0) {
    try {
      await qdrantClient.delete("notes", { points: noteIds });
    } catch (err) {
      logger.error(`Qdrant cleanup failed for deleted user ${userId} (vectors orphaned until reindex):`, err);
    }
  }

  res.status(200).json({ message: "User deleted." });
}
