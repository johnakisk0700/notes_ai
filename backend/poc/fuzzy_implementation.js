import Fuse from "fuse.js";
import { allWines } from "./wineList.js";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

// Generate n-grams
const generateNgrams = (text, maxN = 5) => {
  const words = text.split(" ");
  const ngrams = [];
  for (let n = 2; n <= maxN; n++) {
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
      matches[ngram] = result.map((wine) => `${wine.item} [${wine.score}]`);
    }
  });
  return matches;
};

// Filter overlapping matches
const filterOverlappingMatches = (matches) => {
  const sortedMatches = Object.keys(matches).sort(
    (a, b) => b.length - a.length
  );
  const filteredMatches = {};
  const usedIndices = new Set();

  sortedMatches.forEach((ngram, i) => {
    // console.log(
    //   `${colors.blue}Analyzing${colors.reset} [${ngram}]${
    //     usedIndices.has(i)
    //       ? ` - ${colors.cyan}Exiting because it exists${colors.reset}`
    //       : ""
    //   }`
    // );
    if (usedIndices.has(i)) return;
    filteredMatches[ngram] = matches[ngram];

    // Mark overlapping n-grams as used
    sortedMatches.forEach((otherNgram, j) => {
      if (i !== j && ngram.includes(otherNgram)) {
        // console.log(
        //   `${colors.yellow}Found${colors.reset} [${ngram}] includes [${otherNgram}]`
        // );
        usedIndices.add(j);
      }
    });
  });

  return filteredMatches;
};

// User input
// const userInput =
//   "Σήμερα πούλησα 500 μπουκάλια SILVA ΨΙΘΥΡΟΣ στον Γιώργο και άλλα 240 μπουκάλια PIGNAN CHATEAUNEUF DU PAPE ROUGE στον Αντρέα. Επίσης έδωσα 50 μπουκάλια BLANC CHATEAUNEUF DU PAPE στον μλκ τον Κώστα.";

const fuzzySearch = (wines, threshold, userInput) => {
  const ngrams = generateNgrams(userInput);
  // console.log("ngrams: ", ngrams);

  const fuse = new Fuse(allWines, {
    includeScore: true,
    threshold: threshold,
    minMatchCharLength: 5,
  });

  const matches = findMatches(ngrams, fuse);
  // console.log("matches: ", matches);

  // try and correct the whole phrase
  const filtered = filterOverlappingMatches(matches);
  // console.log("filtered: ", filtered);

  return filtered;
};

// for (let a = 0.1; a <= 0.5; a = a + 0.05) {
//   const answer = fuzzySearch(a);
//   console.log(`Threshold: ${colors.cyan}[${a}]${colors.reset}\n`);
//   Object.entries(answer).forEach(([key, val], i) => {
//     console.log(
//       `${colors.green}[${key}]${colors.reset} had ${colors.green}[${val.length}]${colors.reset} answers`
//     );
//     if (val.length > 0) {
//       console.log(`Answers: ${colors.magenta}[${val}]${colors.reset}\n`);
//     }
//   });
//   console.log(
//     `${colors.yellow}===================================================================================${colors.reset}\n`
//   );
// }

// console.log(
//   `\n${colors.red}[CONCLUSION]${colors.reset}: Chateauneuf Du Pape is the best wine in the whole universe.`
// );
