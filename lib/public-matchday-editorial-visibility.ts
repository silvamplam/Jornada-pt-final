export type PublicMatchdayEditorialVisibilityInput = {
  hasHeadline: boolean;
  hasSideBlock: boolean;
  highlightCount: number;
  roundupCount: number;
  hasComplementaryStory: boolean;
  latestNewsCount: number;
  importantNewsCount: number;
};

export type PublicMatchdayEditorialCoverLayout =
  | "feature-main-news"
  | "feature-main"
  | "feature-news"
  | "main-news"
  | "feature"
  | "main"
  | "news"
  | "none";

export type PublicMatchdayEditorialVisibility = {
  showHeadline: boolean;
  showSideBlock: boolean;
  showBelowHeadline: boolean;
  showComplementaryStory: boolean;
  showLatestZone: boolean;
  showImportantNews: boolean;
  showMainLower: boolean;
  showMainColumn: boolean;
  showCoverPanel: boolean;
  showAnyEditorialContent: boolean;
  mainLowerIsSingle: boolean;
  coverLayout: PublicMatchdayEditorialCoverLayout;
};

function nonNegativeCount(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function buildPublicMatchdayEditorialVisibility(
  input: PublicMatchdayEditorialVisibilityInput
): PublicMatchdayEditorialVisibility {
  const showHeadline = input.hasHeadline === true;
  const showSideBlock = input.hasSideBlock === true;
  const showBelowHeadline =
    nonNegativeCount(input.highlightCount) > 0 ||
    nonNegativeCount(input.roundupCount) > 0;
  const showComplementaryStory = input.hasComplementaryStory === true;
  const showLatestZone = nonNegativeCount(input.latestNewsCount) > 0;
  const showImportantNews = nonNegativeCount(input.importantNewsCount) > 0;
  const showMainLower = showBelowHeadline || showComplementaryStory;
  const showMainColumn = showHeadline || showMainLower;
  const showCoverPanel = showSideBlock || showMainColumn || showLatestZone;
  const showAnyEditorialContent = showCoverPanel || showImportantNews;
  const mainLowerIsSingle = showBelowHeadline !== showComplementaryStory;

  const coverParts = [
    showSideBlock ? "feature" : null,
    showMainColumn ? "main" : null,
    showLatestZone ? "news" : null
  ].filter((part): part is "feature" | "main" | "news" => part !== null);

  return {
    showHeadline,
    showSideBlock,
    showBelowHeadline,
    showComplementaryStory,
    showLatestZone,
    showImportantNews,
    showMainLower,
    showMainColumn,
    showCoverPanel,
    showAnyEditorialContent,
    mainLowerIsSingle,
    coverLayout:
      coverParts.length > 0
        ? (coverParts.join("-") as PublicMatchdayEditorialCoverLayout)
        : "none"
  };
}
