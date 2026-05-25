import {
  gptSimpleQuery,
  gptSystemUserQuery,
  openai,
} from "clients/openai_client";
import {
  pineBeverageIndex,
  pineCustomerIndex,
  pineSalesIndex,
} from "clients/pinecone_client";
import { qdrantClient } from "clients/qdrant_client";
import { askWhisperAI } from "clients/whisper_ai";
import { AppError } from "middleware/common/AppError";
import {
  iosifsprompt,
  noteTranscriptionPrompts,
  speechTranscriptionPrompts,
} from "utils/gptPrompts";

export const transcribeNoteExperimental = async (req, res, next) => {
  const startTime = performance.now();
  const base64Audio = req.body.audio.content;
  if (!base64Audio) throw new AppError({ message: "No audio data provided" });

  const sTranscript = performance.now();
  // Call Whisper API
  const transcript = await askWhisperAI(
    base64Audio,
    "el",
    ""
    // "Ο χρήστης θα αναφέρει γαλλικά και αγγλικά ονόματα στις ελληνικές του προτάσεις. Πρέπει να διατηρήσεις την ελληνικοποιημένη εκδοχή τους στην μεταγραφή. Παρακαλώ, απάντησε στα Ελληνικά."
  );
  const transcriptTime = (performance.now() - sTranscript).toFixed(2);
  console.log(`transcript: [${transcript}]`);

  const sFirstQuery = performance.now();
  const result = await gptSystemUserQuery("chatgpt-4.1", {
    systemQuery: noteTranscriptionPrompts.faster,
    userQuery: `Here's the transcript: [${transcript}]`,
  });
  const firstQueryTime = (performance.now() - sFirstQuery).toFixed(2);
  const fixedText = result.choices[0]?.message?.content;

  const [beverages, shops] = parseEntityList(fixedText);
  const beverageList = [
    ...beverages.map((bev) => bev.name),
    ...beverages.map((bev) => bev.swaps),
  ].flat();
  const customerList = [
    ...shops.map((shop) => shop.name),
    ...shops.map((shop) => shop.swaps),
  ].flat();

  // Search Sales, Customers and Beverages in pinecone and create
  // a list of hints for GPT in <name hint> format
  const sEmbeddings = performance.now();

  if (!beverageList.length && !customerList.length) {
    res.json({ gptAnswer: transcript, transcript: transcript });
    return;
  }

  const { data: embeddings } = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: [...beverageList, ...customerList],
  });

  const beverageEmbeddings = embeddings
    .slice(0, beverageList.length)
    .map((emb) => emb.embedding);
  const customerEmbeddings = embeddings
    .slice(beverageList.length, embeddings.length)
    .map((emb) => emb.embedding);

  const [beveragesList, customersList, salesList] = await Promise.all([
    findSimilarBeverages(beverageEmbeddings),
    findSimilarCustomers(customerEmbeddings),
    findSimilarSales(customerEmbeddings),
  ]);
  const embeddingsCreateAndSearchTime = (
    performance.now() - sEmbeddings
  ).toFixed(2);

  const sFinalQuery = performance.now();
  const suggestionsList = [
    ...beveragesList,
    ...salesList,
    ...customersList,
  ].join("");
  // console.log("suggestions: [", suggestionsList, "]");

  const finalSentence = await gptSystemUserQuery("chatgpt-4.1", {
    systemQuery: speechTranscriptionPrompts.finalPrompt,
    userQuery: `Here is the list of possible beverage/shop names: ${suggestionsList} ---- Here is the user's transcript: ${transcript}`,
  });

  // Logs
  const finalQueryTime = (performance.now() - sFinalQuery).toFixed(2);
  const endTime = performance.now();
  const executionTime = (endTime - startTime) / 1000; // Μετατροπή σε seconds

  console.log("--------Transcribe--------");
  console.log(`Transcription time: [${transcriptTime}]`);
  console.log(`First query time: [${firstQueryTime}]`);
  console.log(
    `Embeddings and search pinecone time: [${embeddingsCreateAndSearchTime}]`
  );
  console.log(`Final query time: [${finalQueryTime}]`);

  console.log(
    `Η συνάρτηση εκτελέστηκε σε ${executionTime.toFixed(2)} δευτερόλεπτα`
  );
  console.log("--------------------------");

  res.status(200).json({
    transcript: transcript,
    gptAnswer: finalSentence.choices[0].message.content,
  });
};

async function getQueryEmbedding(transcript) {
  // Turn the response to embeddings

  const { data } = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: transcript,
  });
  return data[0].embedding;
}

// search beverages
async function findSimilarBeverages(embeddings) {
  const req = embeddings.map((emb) => ({
    vector: emb,
    with_payload: true,
    limit: 2,
  }));

  const beverages = await qdrantClient.searchBatch("beverages", {
    searches: req,
  });
  return beverages.map((res) =>
    res.map((bev) => `<${bev.payload?.source_string}>`)
  );
}

// search sales
async function findSimilarSales(embeddings) {
  const req = embeddings.map((emb) => ({
    vector: emb,
    with_payload: true,
    limit: 2,
  }));

  const sales = await qdrantClient.searchBatch("sales", { searches: req });
  return sales.map((res) => res.map((sale) => `<${sale.payload?.name}>`));
}

// search customers
async function findSimilarCustomers(embeddings) {
  const req = embeddings.map((emb) => ({
    vector: emb,
    with_payload: true,
    limit: 2,
  }));
  const customers = await qdrantClient.searchBatch("polites", {
    searches: req,
  });
  return customers.map((res) =>
    res.map((cust) => `[${cust.payload?.name} - ${cust.payload?.title}]`)
  );
}

export async function embedWithGPT(textsToEmbed) {
  const embeddings: number[][] = [];

  // Embed arrays using text-embedding-ada-002
  for (let i = 0; i < textsToEmbed.length; i += 100) {
    const batch = textsToEmbed.slice(i, i + 100);

    try {
      console.log(`Processing batch ${i / 100 + 1}...`);
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: batch,
      });

      // Extract embeddings
      const batchEmbeddings = response.data.map((entry) => entry.embedding);
      embeddings.push(...batchEmbeddings);
    } catch (error) {
      console.error("Error fetching embeddings:", error);
    }
  }

  return embeddings;
}

function parseEntityList(text) {
  const lines = text.trim().split("\n"); // Split text into lines
  const beverages: { name: string; swaps: string[] }[] = [];
  const shops: { name: string; swaps: string[] }[] = [];

  lines.forEach((line) => {
    const parts = line.split("|").map((p) => p.trim()); // Trim each part to remove extra spaces

    if (parts.length < 3) {
      console.warn(`Skipping invalid line: ${line}`);
      return;
    }

    const type = parts[0]; // "BEVERAGE" or "SHOP"
    const originalName = parts[1]; // Original phonetic name
    const swaps = parts.slice(2); // All possible correct names

    const entity = {
      name: originalName,
      swaps: swaps,
    };

    if (type === "BEVERAGE") {
      beverages.push(entity);
    } else if (type === "SHOP") {
      shops.push(entity);
    } else {
      console.warn(`Skipping unknown type: ${type}`);
    }
  });

  return [beverages, shops]; // Return as two separate arrays
}
