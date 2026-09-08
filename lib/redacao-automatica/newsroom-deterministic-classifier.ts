import type {
  ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import {
  normalizeTeamIdentityKey,
} from "@/lib/team-identity-key";

export const NEWSROOM_CLASSIFICATION_EVIDENCE_FIELDS = [
  "title",
  "subtitle",
  "summary",
  "body",
] as const;

export type NewsroomClassificationEvidenceField =
  (typeof NEWSROOM_CLASSIFICATION_EVIDENCE_FIELDS)[number];

export type NewsroomClassificationAliasSource =
  | "name"
  | "public_name"
  | "short_name"
  | "slug"
  | "code"
  | "team_alias";

export type NewsroomClassificationTeamInput = Readonly<{
  id: string;
  name: string;
  publicName: string | null;
  shortName: string | null;
  slug: string;
  code: string | null;
}>;

export type NewsroomClassificationAliasInput = Readonly<{
  teamId: string;
  alias: string;
  normalizedAlias: string;
}>;

export type BuildNewsroomClassificationSeasonContextInput = Readonly<{
  seasonId: string;
  competitionId: string;
  participantTeamIds: readonly string[];
  teams: readonly NewsroomClassificationTeamInput[];
  aliases: readonly NewsroomClassificationAliasInput[];
}>;

export type NewsroomClassificationTeam = Readonly<{
  id: string;
  slug: string;
  participating: boolean;
  classificationKey: ArticleClassificationKey;
  aliases: readonly string[];
}>;

export type NewsroomClassificationSeasonContext = Readonly<{
  seasonId: string;
  competitionId: string;
  teams: readonly NewsroomClassificationTeam[];
}>;

export type NewsroomArticleClassificationEvidence = Readonly<{
  newsroomArticleId: string;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  body: string | null;
}>;

export type NewsroomDeterministicClassificationReason =
  | "single_big_three"
  | "participant_team"
  | "known_outside_team"
  | "explicit_outside_context"
  | "competing_big_three"
  | "conflicting_team_identity"
  | "body_mixed_subjects"
  | "no_authoritative_evidence";

export type NewsroomDeterministicClassificationResult = Readonly<{
  state: "classified" | "ambiguous" | "insufficient_evidence";
  classificationKey: ArticleClassificationKey | null;
  reason: NewsroomDeterministicClassificationReason;
  evidenceField: NewsroomClassificationEvidenceField | null;
  matchedTeamIds: readonly string[];
}>;

export type NewsroomArticleDeterministicClassification = Readonly<{
  newsroomArticleId: string;
  result: NewsroomDeterministicClassificationResult;
}>;

type AliasCandidate = Readonly<{
  value: string | null;
  source: NewsroomClassificationAliasSource;
}>;

type TeamMatch = Readonly<{
  team: NewsroomClassificationTeam;
  alias: string;
  start: number;
  end: number;
}>;

const BIG_THREE_BY_CANONICAL_TEAM_SLUG: Readonly<
  Partial<Record<string, ArticleClassificationKey>>
> = Object.freeze({
  benfica: "benfica",
  sporting: "sporting",
  "fc-porto": "fc_porto",
});

// Estes dois contextos editoriais explícitos são os únicos casos não-clube
// de alta confiança preservados do classificador histórico do Bank.
const EXPLICIT_OUTSIDE_CONTEXTS = [
  "selecao nacional",
  "futebol internacional",
] as const;

const BIG_THREE_KEYS = new Set<ArticleClassificationKey>([
  "benfica",
  "sporting",
  "fc_porto",
]);

export function normalizeNewsroomClassificationEvidence(value: string): string {
  return normalizeTeamIdentityKey(value).replace(/-/g, " ");
}

function normalizedAlias(candidate: AliasCandidate): string | null {
  const normalized = candidate.value
    ? normalizeNewsroomClassificationEvidence(candidate.value)
    : "";
  const compactLength = normalized.replace(/ /g, "").length;
  if (compactLength < 3) return null;
  if (
    (candidate.source === "code" || candidate.source === "short_name")
    && !normalized.includes(" ")
    && compactLength < 4
  ) {
    return null;
  }
  return normalized;
}

function canonicalSlug(value: string): string {
  return normalizeTeamIdentityKey(value);
}

function classificationKeyForTeam(
  slug: string,
  participating: boolean,
): ArticleClassificationKey {
  if (!participating) return "outside_liga_other";
  return BIG_THREE_BY_CANONICAL_TEAM_SLUG[slug] ?? "other_liga_clubs";
}

export function buildNewsroomClassificationSeasonContext(
  input: BuildNewsroomClassificationSeasonContextInput,
): NewsroomClassificationSeasonContext | null {
  const seasonId = input.seasonId.trim().toLowerCase();
  const competitionId = input.competitionId.trim().toLowerCase();
  if (!seasonId || !competitionId || input.teams.length === 0) return null;

  const teamIds = input.teams.map((team) => team.id.trim().toLowerCase());
  const teamSlugs = input.teams.map((team) => canonicalSlug(team.slug));
  if (
    teamIds.some((id) => !id)
    || teamSlugs.some((slug) => !slug)
    || new Set(teamIds).size !== teamIds.length
    || new Set(teamSlugs).size !== teamSlugs.length
  ) {
    return null;
  }

  const participantIds = input.participantTeamIds.map(
    (id) => id.trim().toLowerCase(),
  );
  const participantSet = new Set(participantIds);
  const knownTeamIds = new Set(teamIds);
  if (
    participantIds.length === 0
    || participantSet.size !== participantIds.length
    || participantIds.some((id) => !knownTeamIds.has(id))
    || input.aliases.some(
      (alias) => !knownTeamIds.has(alias.teamId.trim().toLowerCase()),
    )
  ) {
    return null;
  }

  const aliasesByTeamId = new Map<string, AliasCandidate[]>();
  for (const alias of input.aliases) {
    const teamId = alias.teamId.trim().toLowerCase();
    const candidates = aliasesByTeamId.get(teamId) ?? [];
    candidates.push(
      { value: alias.alias, source: "team_alias" },
      {
        value: alias.normalizedAlias.replace(/-/g, " "),
        source: "team_alias",
      },
    );
    aliasesByTeamId.set(teamId, candidates);
  }

  const teams = input.teams.map((team, index): NewsroomClassificationTeam => {
    const id = teamIds[index]!;
    const slug = teamSlugs[index]!;
    const aliasCandidates: AliasCandidate[] = [
      { value: team.name, source: "name" },
      { value: team.publicName, source: "public_name" },
      { value: team.shortName, source: "short_name" },
      { value: team.slug.replace(/-/g, " "), source: "slug" },
      { value: team.code, source: "code" },
      ...(aliasesByTeamId.get(id) ?? []),
    ];
    const aliases = [...new Set(
      aliasCandidates.flatMap((candidate) => {
        const normalized = normalizedAlias(candidate);
        return normalized ? [normalized] : [];
      }),
    )].sort((left, right) => (
      right.split(" ").length - left.split(" ").length
      || right.length - left.length
      || left.localeCompare(right)
    ));
    const participating = participantSet.has(id);

    return {
      id,
      slug,
      participating,
      classificationKey: classificationKeyForTeam(slug, participating),
      aliases,
    };
  });

  if (teams.some((team) => team.aliases.length === 0)) return null;

  return {
    seasonId,
    competitionId,
    teams: teams.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function tokenSequenceStartsAt(
  textTokens: readonly string[],
  aliasTokens: readonly string[],
  start: number,
): boolean {
  return aliasTokens.every((token, index) => textTokens[start + index] === token);
}

function allTeamMatches(
  normalizedText: string,
  context: NewsroomClassificationSeasonContext,
): readonly TeamMatch[] {
  const textTokens = normalizedText.split(" ").filter(Boolean);
  const candidates: TeamMatch[] = [];

  for (const team of context.teams) {
    for (const alias of team.aliases) {
      const aliasTokens = alias.split(" ").filter(Boolean);
      if (aliasTokens.length === 0 || aliasTokens.length > textTokens.length) {
        continue;
      }
      for (
        let start = 0;
        start <= textTokens.length - aliasTokens.length;
        start += 1
      ) {
        if (tokenSequenceStartsAt(textTokens, aliasTokens, start)) {
          candidates.push({
            team,
            alias,
            start,
            end: start + aliasTokens.length - 1,
          });
        }
      }
    }
  }

  return candidates.filter((candidate) => !candidates.some((other) => (
    other.start <= candidate.start
    && other.end >= candidate.end
    && other.end - other.start > candidate.end - candidate.start
  )));
}

function hasExplicitOutsideContext(normalizedText: string): boolean {
  const padded = ` ${normalizedText} `;
  return EXPLICIT_OUTSIDE_CONTEXTS.some(
    (context) => padded.includes(` ${context} `),
  );
}

function result(
  state: NewsroomDeterministicClassificationResult["state"],
  classificationKey: ArticleClassificationKey | null,
  reason: NewsroomDeterministicClassificationReason,
  evidenceField: NewsroomClassificationEvidenceField | null,
  matches: readonly TeamMatch[],
): NewsroomDeterministicClassificationResult {
  return {
    state,
    classificationKey,
    reason,
    evidenceField,
    matchedTeamIds: [...new Set(matches.map((match) => match.team.id))].sort(),
  };
}

function classifyField(
  value: string | null,
  field: NewsroomClassificationEvidenceField,
  context: NewsroomClassificationSeasonContext,
): NewsroomDeterministicClassificationResult | null {
  const normalized = value ? normalizeNewsroomClassificationEvidence(value) : "";
  if (!normalized) return null;

  const matches = allTeamMatches(normalized, context);
  const matchClassesBySpan = new Map<string, Set<ArticleClassificationKey>>();
  for (const match of matches) {
    const spanKey = `${match.start}:${match.end}`;
    const classes = matchClassesBySpan.get(spanKey) ?? new Set();
    classes.add(match.team.classificationKey);
    matchClassesBySpan.set(spanKey, classes);
  }
  if ([...matchClassesBySpan.values()].some((classes) => classes.size > 1)) {
    return result(
      "ambiguous",
      null,
      "conflicting_team_identity",
      field,
      matches,
    );
  }

  const teamMatches = new Map(
    matches.map((match) => [match.team.id, match] as const),
  );
  const uniqueMatches = [...teamMatches.values()];
  const bigThreeKeys = new Set(
    uniqueMatches
      .map((match) => match.team.classificationKey)
      .filter((key) => BIG_THREE_KEYS.has(key)),
  );

  if (bigThreeKeys.size > 1) {
    return result(
      "ambiguous",
      null,
      "competing_big_three",
      field,
      uniqueMatches,
    );
  }
  if (bigThreeKeys.size === 1) {
    if (field === "body" && uniqueMatches.length > 1) {
      return result(
        "ambiguous",
        null,
        "body_mixed_subjects",
        field,
        uniqueMatches,
      );
    }
    return result(
      "classified",
      [...bigThreeKeys][0]!,
      "single_big_three",
      field,
      uniqueMatches,
    );
  }

  if (hasExplicitOutsideContext(normalized)) {
    return result(
      "classified",
      "outside_liga_other",
      "explicit_outside_context",
      field,
      uniqueMatches,
    );
  }

  if (uniqueMatches.some((match) => match.team.participating)) {
    return result(
      "classified",
      "other_liga_clubs",
      "participant_team",
      field,
      uniqueMatches,
    );
  }
  if (uniqueMatches.length > 0) {
    return result(
      "classified",
      "outside_liga_other",
      "known_outside_team",
      field,
      uniqueMatches,
    );
  }
  return null;
}

export function classifyNewsroomArticleDeterministically(
  evidence: NewsroomArticleClassificationEvidence,
  context: NewsroomClassificationSeasonContext,
): NewsroomDeterministicClassificationResult {
  const fields: ReadonlyArray<
    readonly [NewsroomClassificationEvidenceField, string | null]
  > = [
    ["title", evidence.title],
    ["subtitle", evidence.subtitle],
    ["summary", evidence.summary],
    ["body", evidence.body],
  ];

  for (const [field, value] of fields) {
    const classification = classifyField(value, field, context);
    if (classification) return classification;
  }

  return result(
    "insufficient_evidence",
    null,
    "no_authoritative_evidence",
    null,
    [],
  );
}

export function classifyNewsroomArticlesDeterministically(
  evidenceItems: readonly NewsroomArticleClassificationEvidence[],
  context: NewsroomClassificationSeasonContext,
): readonly NewsroomArticleDeterministicClassification[] {
  return evidenceItems.map((evidence) => ({
    newsroomArticleId: evidence.newsroomArticleId,
    result: classifyNewsroomArticleDeterministically(evidence, context),
  }));
}
