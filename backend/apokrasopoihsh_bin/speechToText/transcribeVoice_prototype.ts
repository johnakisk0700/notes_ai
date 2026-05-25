import { protos, SpeechClient } from "@google-cloud/speech";
import { openai } from "clients/openai_client";
import { colors } from "utils/cli_colors";
import fs from "fs";
import { AppError } from "middleware/common/AppError";
import { speechTranscriptionPrompts } from "utils/gptPrompts";
import { askWhisperAI } from "clients/whisper_ai";
import Fuse from "fuse.js";

const speechClient = new SpeechClient({
  keyFilename: "./sommellier-58a3d9b6d631.json",
});

export async function transcribeVoice(req, res) {
  const base64Audio = req.body.audio.content;

  if (!base64Audio) {
    throw new AppError("No audio data provided");
  }

  const readKrasia = fs.readFileSync(
    "./proofOfConcept/output/gptNormalizedWines_v2.json",
    {
      encoding: "utf8",
    }
  );
  const krasia = JSON.parse(readKrasia);
  const krasiaPrompt = krasia.map((krasi) => `<${krasi.brand_name}>`).join("");

  // Call Whisper API
  const transcription = await askWhisperAI(
    base64Audio,
    "el",
    "This conversation includes wine and beverage names such as CHATEAUNEUF DU PAPE, Bordeaux, Merlot, Sauvignon Blanc, ΟΥΖΟ, ΤΣΙΠΟΥΡΟ, Μαλαγουζιά, Ασυρτικο."
  );

  // Call GPT to help fix the sentence
  const enhancedTranscript = await getChatGPTCorrection(transcription);
  const gptAnswer = enhancedTranscript.choices[0].message.content;

  // console.log(
  //   `${colors.red}Enhanced Transcript search${colors.reset}: [${gptAnswer}]`
  // );
  const detectedBeverages = extractBracketWords(gptAnswer);
  // console.log(`Detected beverages: ${detectedBeverages}`);

  const searchResults = await Promise.all(
    detectedBeverages.map(async (beverage) => {
      // Turn the response to embeddings
      const { data } = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: beverage,
      });
      const embeddedTranscription = data[0].embedding;
      const { matches } = await pineBeverageIndex.query({
        vector: embeddedTranscription,
        topK: 50,
        includeMetadata: true,
      });

      return matches; // Ensure each result is returned
    })
  );

  // log
  const flatPineconeResult = searchResults
    .flat()
    .map((match) => `<${match.metadata.source_string}>`);
  // console.log(`pinecone result: `, flatPineconeResult);

  const doubleEnhancedScript = await getChatGPTFinalCorrection(
    `initial transcription: ${transcription}`,
    flatPineconeResult.join("")
  );
  const gptFinalAnswer = doubleEnhancedScript.choices[0].message.content;

  console.log(
    `\n${colors.red}Arxiko${colors.reset}: [${transcription}]\n${colors.cyan}Enhanced${colors.reset}: [${gptAnswer}]\n${colors.green}Ultra${colors.reset}: [${gptFinalAnswer}]`
  );

  const detectedBeveragesFromEnhanced = extractBracketWords(gptFinalAnswer);
  console.log("detected beverages: ", detectedBeveragesFromEnhanced);
  const parsedItems = detectedBeveragesFromEnhanced.map((item) =>
    parseBoughtItem(item)
  );
  console.log("parsed beverages: ", parsedItems);
  const fuzzyResults = fuzzySearch(krasia, 0.25, parsedItems);
  // console.log("fuzzy: ", fuzzyResults);

  res.json({
    success: true,
    transcript: transcription,
    gptAnswer: gptFinalAnswer,
    fuzzyResults,
  });
}

async function getChatGPTCorrection(transcription) {
  const response = await openai.chat.completions.create({
    model: "o1-mini",
    messages: [
      // {
      //   role: "system",
      //   content: speechTranscriptionPrompts.firstPrompt,
      // },
      {
        role: "user",
        content: speechTranscriptionPrompts.firstPrompt.concat(transcription),
      },
    ],
  });
  return response;
}

async function getChatGPTFinalCorrection(transcription, pineconeResults) {
  const response = await openai.chat.completions.create({
    model: "o1-mini",
    messages: [
      // {
      //   role: "system",
      //   content: ,
      // },
      {
        role: "user",
        content: speechTranscriptionPrompts.finalPrompt
          .concat(pineconeResults)
          .concat(transcription),
      },
    ],
  });
  return response;
}

const fuzzySearch = (wines, threshold, userInput) => {
  const searchResults = {};

  const fuse = new Fuse(wines, {
    includeScore: true,
    threshold: threshold,
    minMatchCharLength: 5,
    keys: [
      { name: "product_name", weight: 0.8 },
      { name: "brand_name", weight: 0.5 },
      { name: "producer", weight: 0.5 },
      { name: "source_string", weight: 0.25 },
    ],
  });

  // Using forEach:
  userInput.forEach(({ quantity, name }) => {
    searchResults[name] = fuse.search(name);
  });

  return searchResults;
};

const nGramfuzzySearch = (wines, threshold, userInput) => {
  const ngrams = generateNgrams(userInput);
  // console.log("ngrams: ", ngrams);

  const fuse = new Fuse(wines, {
    includeScore: true,
    threshold: threshold,
    minMatchCharLength: 5,
    keys: [
      { name: "product_name", weight: 0.8 },
      { name: "brand_name", weight: 0.5 },
      { name: "producer", weight: 0.5 },
    ],
  });

  const matches = findMatches(ngrams, fuse);
  // console.log("matches: ", matches);

  // try and correct the whole phrase
  const filtered = filterOverlappingMatches(matches);
  // console.log("filtered: ", filtered);

  return filtered;
};

// Generate n-grams
const generateNgrams = (text, maxN = 5) => {
  const words = text.split(" ");
  const ngrams = [];
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(" "));
    }
  }
  return ngrams;
};

const findMatches = (ngrams, fuse) => {
  const matches = {};
  ngrams.forEach((ngram, idx) => {
    const result = fuse.search(ngram);
    if (result.length > 0) {
      matches[ngram] = result.map(
        (wine) => `${wine.item.source_string} [${wine.score}]`
      );
    }
  });
  return matches;
};

// Filter overlapping matches
const filterOverlappingMatches = (matches) => {
  const sortedNgrams = Object.keys(matches).sort((a, b) => {
    // First compare by best match score
    const aScore = Math.min(...matches[a].map((m) => m.score));
    const bScore = Math.min(...matches[b].map((m) => m.score));
    if (Math.abs(aScore - bScore) > 0.1) {
      // threshold for considering scores different
      return aScore - bScore;
    }
    // If scores are similar, prefer longer matches
    return b.length - a.length;
  });

  const filteredMatches = {};
  const usedPhrases = new Set();

  for (const ngram of sortedNgrams) {
    // Check if this ngram is contained within any already-used phrases
    if ([...usedPhrases].some((used) => used.includes(ngram))) {
      continue;
    }

    filteredMatches[ngram] = matches[ngram];
    usedPhrases.add(ngram);
  }

  return filteredMatches;
};

async function askGoogleCloudAI(audioBase64) {
  // Configure the request
  const request = {
    audio: {
      content: audioBase64,
    },
    config: {
      encoding:
        protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS,
      sampleRateHertz: 48000,
      languageCode: "el-GR",
      // Optional: configure additional settings
      enableAutomaticPunctuation: true,
      alternativeLanguageCodes: ["en-US", "fr-FR"],
      // model: 'default', // or 'phone_call', 'video', etc.
    },
  };

  // Perform the transcription
  const [response] = await speechClient.recognize(request);

  // Get transcription from response
  const transcription = response.results
    .map((result) => result.alternatives[0].transcript)
    .join("\n");

  return transcription;
}

function extractBracketWords(str) {
  return (str.match(/\[(.*?)\]/g) || []).map((match) => match.slice(1, -1));
}

function parseBoughtItem(item) {
  const [_, quantity, name] = item.match(/(\d+)x\s(.+)/) || [];
  return { quantity: quantity ? +quantity : null, name: name || item };
}
