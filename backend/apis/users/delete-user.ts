import { notesTable } from "@shared/db/schema/notes";
import { profileTable } from "@shared/db/schema/profile";
import { remindersTable } from "@shared/db/schema/reminders";
import { clerkClient } from "@clerk/express";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { qdrantClient } from "clients/qdrant_client";
import { eq } from "drizzle-orm";

// Admin-only: delete a user from Clerk and purge their local data.
export async function deleteUser(req, res) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    // Collect the user's note IDs so we can drop their Qdrant vectors.
    const userNotes = await drizzlePg
      .select({ id: notesTable.id })
      .from(notesTable)
      .where(eq(notesTable.userId, userId));

    await drizzlePg.transaction(async (tx) => {
      await tx.delete(remindersTable).where(eq(remindersTable.userId, userId));
      await tx.delete(notesTable).where(eq(notesTable.userId, userId));
      await tx.delete(profileTable).where(eq(profileTable.id, userId));
    });

    if (userNotes.length > 0) {
      await qdrantClient.delete("notes", {
        points: userNotes.map((n) => n.id),
      });
    }

    // Finally remove the identity from Clerk.
    await clerkClient.users.deleteUser(userId);

    res.status(200).json({ message: "User deleted." });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
}
