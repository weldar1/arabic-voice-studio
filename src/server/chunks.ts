// Long text is spoken in pieces, cut where sentences end.

export const CHUNK_LIMIT = 1500;

const SENTENCE = /[^.!?؟۔\n]+[.!?؟۔\n]*/g;

/** The text in pieces of at most `limit` characters, cut at sentence ends where possible. */
export function splitIntoChunks(text: string, limit = CHUNK_LIMIT): string[] {
  const sentences = text.match(SENTENCE) ?? [];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (current.length + sentence.length <= limit) {
      current += sentence;
      continue;
    }
    push();
    if (sentence.length <= limit) {
      current = sentence;
      continue;
    }
    // One sentence longer than a piece: cut at spaces, else anywhere.
    let rest = sentence;
    while (rest.length > limit) {
      let cut = rest.lastIndexOf(" ", limit);
      if (cut < limit / 2) cut = limit;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut);
    }
    current = rest;
  }
  push();
  return chunks;
}
