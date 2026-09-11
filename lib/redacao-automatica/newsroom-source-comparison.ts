export type ComparedParagraph = Readonly<{ text: string; changed: boolean }>;

export function sourceParagraphs(body: unknown): readonly string[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((item): string[] => {
    if (!item || typeof item !== "object" || !("text" in item) || typeof item.text !== "string") return [];
    return item.text.trim() ? [item.text] : [];
  });
}

/** Paragraph LCS: no AI inference; inserts/removals are grounded in the two stored copies. */
export function compareSourceParagraphs(before: unknown, after: unknown): Readonly<{
  before: readonly ComparedParagraph[]; after: readonly ComparedParagraph[]; exactAlignment: boolean;
}> {
  const a = sourceParagraphs(before), b = sourceParagraphs(after);
  const normalize = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
  const x = a.map(normalize), y = b.map(normalize);
  const sameA = new Set<number>(), sameB = new Set<number>();
  const exactAlignment = (a.length + 1) * (b.length + 1) <= 250_000;
  if (exactAlignment) {
    const width = b.length + 1;
    const dp = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
      dp[i * width + j] = x[i] === y[j] ? 1 + dp[(i + 1) * width + j + 1]
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (x[i] === y[j]) { sameA.add(i++); sameB.add(j++); }
      else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) i++;
      else j++;
    }
  } else {
    // Bounded fallback for exceptionally long sources. Both full texts stay visible.
    const setA = new Set(x), setB = new Set(y);
    x.forEach((text, index) => { if (setB.has(text)) sameA.add(index); });
    y.forEach((text, index) => { if (setA.has(text)) sameB.add(index); });
  }
  return {
    before: a.map((text, index) => ({ text, changed: !sameA.has(index) })),
    after: b.map((text, index) => ({ text, changed: !sameB.has(index) })), exactAlignment,
  };
}
