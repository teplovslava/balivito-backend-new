import { lemmaMap } from '../data/lemma.js';
import { stopWords } from '../data/stopWords.js';

export const SIMILARITY_THRESHOLD = 0.85;


export function tokenize(text) {
  const stop = new Set(stopWords || []);
  const lemmas = lemmaMap || {};

  const words = [];
  const numbers = [];

  const normalizedText = text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/(\p{L})(\d)/gu, '$1 $2')
    .replace(/(\d)(\p{L})/gu, '$1 $2');

  normalizedText.split(' ').forEach(token => {
    if (stop.has(token)) return;
    if (token.length === 1 && !/^\d$/.test(token)) return;
    
    const normalized = lemmas[token] || token;
    if (/^\d+$/.test(normalized)) {
      numbers.push(normalized);
    } else {
      words.push(normalized);
    }
  });

  return {
    words: new Set(words),
    numbers: new Set(numbers)
  };
}

function jaccard(setA, setB) {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export const jaccardSimilarity = (textA, textB) => {
  const { words: wordsA, numbers: numsA } = tokenize(textA);
  const { words: wordsB, numbers: numsB } = tokenize(textB);

  if ((numsA.size > 0 && numsB.size === 0) || (numsA.size === 0 && numsB.size > 0)) {
    return 0;
  }

  if (numsA.size > 0 && numsB.size > 0 && ![...numsA].some(n => numsB.has(n))) {
    return 0;
  }

  const wordScore = jaccard(wordsA, wordsB);
  return wordScore;
};
