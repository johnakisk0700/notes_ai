import { qdrantClient } from "clients/qdrant_client";
import { supabase } from "clients/supabase/client";
import fs from "fs";
import { embedWithGPT } from "utils/embedWithGPT";
import { qdrantBatchUpsert } from "utils/qdrantUpsert";

export async function init_collections() {
  const collections = ["notes", "beverages", "customers", "sales", "polites"];

  for (const col of collections) {
    try {
      await qdrantClient.getCollection(col);
    } catch (e: any) {
      if (e.status === 404) {
        try {
          await qdrantClient.createCollection(col, {
            vectors: { size: 1536, distance: "Cosine" },
          });
        } catch (e: any) {
          if (e.statusText !== "Conflict") {
            throw new Error("kati phge ontws strava"); // Assuming this is intentional
          }
          // If it's a conflict, it means the collection is being created concurrently.
          // You might want to log this or handle it differently.  For example:
          console.warn(
            `Collection ${col} creation conflict. Likely created concurrently.`
          );
        }
      }
    }
  }
}

async function migrateNotes() {
  await supabase.auth.signInWithPassword({
    email: process.env.SUPABASE_ADMIN_EMAIL
      ? process.env.SUPABASE_ADMIN_EMAIL
      : "",
    password: process.env.SUPABASE_ADMIN_PASS
      ? process.env.SUPABASE_ADMIN_PASS
      : "",
  });
  const { data: profiles } = await supabase.from("profiles").select();
  const { data: reminders } = await supabase.from("reminders").select();
  const { data: notes } = await supabase.from("notes").select();

  const notesToEmbed = notes?.map((note) => {
    const profile = profiles?.find((p) => p.id === note.user_id);
    const date = new Date(note.created_at).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const reminder = reminders?.find((r) => r.note_id === note.id)?.remind_at;
    const formattedReminder =
      reminder &&
      new Date(reminder).toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

    return `[Χρήστης/User: ${profile?.first_name} ${profile?.last_name}] [Δημιουργήθηκε/Created at: ${date}] [Υπενθύμιση/Reminder: ${formattedReminder || "none"}] [Σημείωση/Note: ${note.content}]`;
  });

  const embeddings = notesToEmbed && (await embedWithGPT(notesToEmbed));

  const points =
    embeddings &&
    notes &&
    embeddings.map((emb, i) => ({
      id: notes[i].id,
      vector: emb,
      payload: {
        user_id: notes[i].user_id,
        concatenated: notesToEmbed[i],
        content: notes[i].content,
        created_at: notes[i].created_at,
        updated_at: notes[i].updated_at,
      },
    }));

  await qdrantBatchUpsert("notes", points);
}

async function migrateBeverages() {
  const beverages = JSON.parse(
    fs.readFileSync("./data/gptNormalizedWines_v2_grouped.json", {
      encoding: "utf8",
    })
  );
  const beverageEmbeddings = JSON.parse(
    fs.readFileSync("./data/BEVERAGES_embeddings.json", {
      encoding: "utf8",
    })
  );

  const points = beverageEmbeddings.map((emb, i) => ({
    id: i,
    vector: emb,
    payload: beverages[i],
  }));

  await qdrantBatchUpsert("beverages", points);
}

async function migrateCustomersNew() {
  const customers = JSON.parse(
    fs.readFileSync("./data/polites.json", {
      encoding: "utf8",
    })
  ).Sheet;
  const customerEmbeddings = JSON.parse(
    fs.readFileSync("./data/polites_embeddings.json", {
      encoding: "utf8",
    })
  );

  const points = customerEmbeddings.map((emb, i) => ({
    id: i,
    vector: emb,
    payload: {
      concatenated: `Shop/Μαγαζί: ${customers[i].name} ${customers[i].title} Πωλητής/Salesman: ${customers[i].salesman}`,
      ...customers[i],
    },
  }));

  await qdrantBatchUpsert("polites", points);
}

async function migrateSales() {
  const sales = JSON.parse(
    fs.readFileSync("./data/polites.json", {
      encoding: "utf8",
    })
  ).Sheet;
  const salesEmbeddings = JSON.parse(
    fs.readFileSync("./data/polites_embeddings.json", {
      encoding: "utf8",
    })
  );

  const points = salesEmbeddings.map((emb, i) => ({
    id: i,
    vector: emb,
    payload: sales[i],
  }));

  await qdrantBatchUpsert("sales", points);
}

async function main() {
  await qdrantClient.deleteCollection("polites");
  await init_collections();
  // await migrateCustomersNew();
  // await migrateNotes();
  // await migrateBeverages();
  // await migrateCustomers();
  // await migrateSales();
}

main();
