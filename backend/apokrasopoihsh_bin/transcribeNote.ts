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
import { askWhisperAI } from "clients/whisper_ai";
import { AppError } from "middleware/common/AppError";
import {
  iosifsprompt,
  noteTranscriptionPrompts,
  speechTranscriptionPrompts,
} from "utils/gptPrompts";

export const transcribeNote = async (req, res, next) => {
  const startTime = performance.now();
  const base64Audio = req.body.audio.content;
  if (!base64Audio) throw new AppError({ message: "No audio data provided" });

  // Call Whisper API
  const transcript = await askWhisperAI(
    base64Audio,
    "el",
    "Ο χρήστης θα αναφέρει γαλλικά και αγγλικά ονόματα στις ελληνικές του προτάσεις. Πρέπει να διατηρήσεις την ελληνικοποιημένη εκδοχή τους στην μεταγραφή. Παρακαλώ, απάντησε στα Ελληνικά."
  );

  // Call GPT to help fix the sentence
  const prompt = noteTranscriptionPrompts.main.concat(transcript);
  const unscrambledTranscript = await gptSimpleQuery("gpt-4.1", prompt);

  const text = unscrambledTranscript?.choices[0]?.message?.content
    ?.replace("```json", "")
    .replace("```", "");
  const parsed = await JSON.parse(text ? text : "");

  const beverageList = parsed.entities
    .filter((entity) => entity.type === "Beverage")
    .map(
      (filtered) =>
        `${filtered.normalized} <> ${filtered?.possibleAlternatives?.join(
          " <> "
        )}`
    )
    .join("-");

  const customerList = parsed.entities
    .filter((entity) => entity.type === "Shop")
    .map(
      (filtered) =>
        `${filtered.normalized} <> ${filtered?.possibleAlternatives?.join(
          " <> "
        )}`
    )
    .join("-");

  // Search Sales, Customers and Beverages in pinecone and create
  // a list of hints for GPT in <name hint> format
  const [beverageEmbedding, customerEmbedding] = await Promise.all([
    getQueryEmbedding(beverageList),
    getQueryEmbedding(customerList),
  ]);

  const [beveragesList, customersList, salesList] = await Promise.all([
    findSimilarBeverages(beverageEmbedding),
    findSimilarCustomers(customerEmbedding),
    findSimilarSales(customerEmbedding),
  ]);

  console.log("pinecone) beverage list: ", beveragesList);
  console.log("(pinecone) customer list: ", customersList);
  const suggestionsList = [
    ...beveragesList,
    ...salesList,
    ...customersList,
  ].join("");

  const finalSentence = await gptSystemUserQuery("gpt-4.1", {
    systemQuery: speechTranscriptionPrompts.finalPrompt,
    userQuery: `Here is the list of possible beverage/shop names: ${suggestionsList} ---- Here is the user's transcript: ${transcript}`,
  });

  const endTime = performance.now();
  const executionTime = (endTime - startTime) / 1000; // Μετατροπή σε seconds
  console.log(
    `Η συνάρτηση εκτελέστηκε σε ${executionTime.toFixed(2)} δευτερόλεπτα`
  );

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
async function findSimilarBeverages(embeddedTranscription) {
  const { matches: beverageMatches } = await pineBeverageIndex.query({
    vector: embeddedTranscription,
    topK: 25,
    includeMetadata: true,
  });
  return beverageMatches
    .flat()
    .map((match) => `@${match?.metadata?.source_string}@`);
}

// search sales
async function findSimilarSales(embeddedTranscription) {
  const { matches: salesMatches } = await pineSalesIndex.query({
    vector: embeddedTranscription,
    topK: 50,
    includeMetadata: true,
  });
  return salesMatches.flat().map((match) => `^${match?.metadata?.name}^`);
}

// search customers
async function findSimilarCustomers(embeddedTranscription) {
  const { matches: customerMatches } = await pineCustomerIndex.query({
    vector: embeddedTranscription,
    topK: 50,
    includeMetadata: true,
  });

  return customerMatches
    .flat()
    .map((match) => `[${match?.metadata?.concatenated}]`);
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
