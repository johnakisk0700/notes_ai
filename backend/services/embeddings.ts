import { profileTable } from "@shared/db/schema/profile";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { openai } from "clients/openai_client";
import { qdrantClient } from "clients/qdrant_client";
import { eq } from "drizzle-orm";
import { logger } from "utils/logger";
export async function createAndSaveNoteEmbedding(userId, reminder, note) {
  const userInfo = await drizzlePg.select().from(profileTable).where(eq(profileTable.id, userId));
  logger.info(userInfo);

  const formattedDate = formatDateForNote(note.created_at);
  const reminderFormatted = reminder && formatDateForNote(reminder.remind_at);

  const noteToEmbed = `[Χρήστης/User: ${userInfo[0]?.first_name} ${
    userInfo[0]?.last_name
  }] [Δημιουργήθηκε/Created at: ${formattedDate}] [Υπενθύμιση/Reminder: ${
    reminderFormatted || "none"
  }] [Τιτλος/Title: ${note.title}] [Σημείωση/Note: ${note.content}]`;

  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: noteToEmbed,
  });
  const embedding = response.data[0].embedding;

  const point = {
    id: note.id,
    vector: embedding,
    payload: {
      concatenated: noteToEmbed,
      user_id: note.userId,
      content: note.content,
      created_at: note.created_at,
      updated_at: note.updated_at,
    },
  };

  await qdrantClient.upsert("notes", { wait: true, points: [point] });
}

function formatDateForNote(date: string) {
  return new Date(date).toLocaleString("en-US", {
    timeZone: "Europe/Athens",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
