export type PublicMatchdayEditorialVisibilityInput = {
  hasHeadline: boolean;
  hasSideBlock: boolean;
  highlightCount: number;
  roundupCount: number;
  hasComplementaryStory: boolean;
  latestNewsCount: number;
  latestZonePlacement?: "top" | "hidden" | "four_news";
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


export type PublicMatchdayRoundupContentInput = {
  title?: string | null;
  image_url?: string | null;
  video_url?: string | null;
};

export function hasPublicMatchdayRoundupContent(item: PublicMatchdayRoundupContentInput) {
  return Boolean(item.title?.trim() || item.image_url?.trim() || item.video_url?.trim());
}

export type PublicMatchdayEditorialVisibility = {
  showHeadline: boolean;
  showSideBlock: boolean;
  showHighlights: boolean;
  showRoundup: boolean;
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
  const showHighlights = nonNegativeCount(input.highlightCount) > 0;
  const showRoundup = nonNegativeCount(input.roundupCount) > 0;
  const showBelowHeadline = showHighlights;
  const showComplementaryStory = input.hasComplementaryStory === true;
  const showLatestZone =
    input.latestZonePlacement !== "hidden"
    && input.latestZonePlacement !== "four_news"
    && nonNegativeCount(input.latestNewsCount) > 0;
  const showImportantNews = nonNegativeCount(input.importantNewsCount) > 0;
  const showMainLower = showRoundup || showComplementaryStory;
  const showMainColumn = showHeadline || showHighlights;
  const showCoverPanel = showSideBlock || showMainColumn || showLatestZone || showMainLower;
  const showAnyEditorialContent = showCoverPanel || showImportantNews;
  const mainLowerIsSingle = showRoundup !== showComplementaryStory;

  const coverParts = [
    showSideBlock ? "feature" : null,
    showMainColumn ? "main" : null,
    showLatestZone ? "news" : null
  ].filter((part): part is "feature" | "main" | "news" => part !== null);

  return {
    showHeadline,
    showSideBlock,
    showHighlights,
    showRoundup,
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
