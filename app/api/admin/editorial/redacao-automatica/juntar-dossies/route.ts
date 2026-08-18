import { NextResponse } from "next/server";

import {
  fetchSupabaseAdminTable,
} from "@/lib/supabase";
import {
  createEditorialSourcePackage,
  markEditorialSourcePackageArticleUsed,
  readEditorialSourcePackage,
} from "@/lib/redacao-automatica/editorial-source-package";
import {
  EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES,
  isEditorialSourcePackageLocation,
  normalizeEditorialSourcePackageSelections,
  type EditorialSourcePackageSelection,
} from "@/lib/redacao-automatica/editorial-source-package-internal";

export const runtime = "nodejs";
export const maxDuration = 300;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DossierRef = Readonly<{
  year: string;
  month: string;
  packageId: string;
  articlePosition: number;
  publishedArticleId: string;
  publishedSlug: string;
}>;

type PublishedArticleRow = Readonly<{
  id: string;
  title: string | null;
  slug: string | null;
  status: string | null;
}>;

type SourceCandidate = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  usedAt: number;
  order: number;
}>;

function cleanText(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function dossierIdentity(ref: DossierRef): string {
  return [
    ref.year,
    ref.month,
    ref.packageId,
    ref.articlePosition,
  ].join(":");
}

function parseDossierRef(value: FormDataEntryValue): DossierRef | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;

  const ref = {
    year: cleanText(candidate.year),
    month: cleanText(candidate.month),
    packageId: cleanText(candidate.packageId).toLowerCase(),
    articlePosition: Number(candidate.articlePosition),
    publishedArticleId:
      cleanText(candidate.publishedArticleId).toLowerCase(),
    publishedSlug: cleanText(candidate.publishedSlug),
  };

  return (
    isEditorialSourcePackageLocation(ref)
    && Number.isInteger(ref.articlePosition)
    && ref.articlePosition > 0
    && UUID_PATTERN.test(ref.publishedArticleId)
    && Boolean(ref.publishedSlug)
  )
    ? ref
    : null;
}

function redirectToUsed(params: Record<string, string>) {
  const url = new URL(
    "/admin/editorial/redacao-automatica",
    "https://jornada.local",
  );

  url.searchParams.set("view", "used");

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `${url.pathname}${url.search}`,
    },
  });
}

function failure(code: string) {
  return redirectToUsed({
    dossier_join_error: code,
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const parsedRefs = formData
    .getAll("dossier_ref")
    .map(parseDossierRef);

  if (
    parsedRefs.length < 2
    || parsedRefs.some((ref) => ref === null)
  ) {
    return failure("input_invalid");
  }

  const refs = parsedRefs as DossierRef[];

  const uniqueRefs = new Map(
    refs.map((ref) => [dossierIdentity(ref), ref]),
  );

  if (uniqueRefs.size !== refs.length) {
    return failure("input_invalid");
  }

  const canonical = parseDossierRef(
    formData.get("canonical_dossier_ref") ?? "",
  );

  if (
    !canonical
    || !uniqueRefs.has(dossierIdentity(canonical))
  ) {
    return failure("canonical_invalid");
  }

  const packageResults = await Promise.all(
    refs.map((ref) => readEditorialSourcePackage({
      year: ref.year,
      month: ref.month,
      packageId: ref.packageId,
    })),
  );

  if (packageResults.some((result) => !result.ok)) {
    return failure("package_read_failed");
  }

  const packages = packageResults.map((result) => (
    result.ok ? result.value : null
  ));

  if (packages.some((value) => value === null)) {
    return failure("package_read_failed");
  }

  let canonicalArticle: PublishedArticleRow | null = null;

  try {
    const rows = await fetchSupabaseAdminTable<PublishedArticleRow>(
      "editorial_articles"
      + "?select=id,title,slug,status"
      + `&id=eq.${encodeURIComponent(canonical.publishedArticleId)}`
      + "&limit=2",
    );

    canonicalArticle = rows.length === 1 ? rows[0] : null;
  } catch {
    return failure("canonical_read_failed");
  }

  if (
    !canonicalArticle
    || canonicalArticle.status !== "published"
    || cleanText(canonicalArticle.slug) !== canonical.publishedSlug
  ) {
    return failure("canonical_invalid");
  }

  const canonicalIndex = refs.findIndex(
    (ref) => dossierIdentity(ref) === dossierIdentity(canonical),
  );

  const canonicalPackage = packages[canonicalIndex];

  if (!canonicalPackage) {
    return failure("canonical_invalid");
  }

  const candidates = new Map<string, SourceCandidate>();
  let preferredImageArticleId: string | null = null;
  let globalOrder = 0;

  for (const [refIndex, ref] of refs.entries()) {
    const packageValue = packages[refIndex];

    if (!packageValue) {
      return failure("package_read_failed");
    }

    const entries = packageValue.manifest.entries
      .filter(
        (entry) => entry.articlePosition === ref.articlePosition,
      )
      .sort(
        (left, right) =>
          left.position - right.position,
      );

    if (entries.length < 1) {
      return failure("dossier_empty");
    }

    for (const entry of entries) {
      const newsroomArticleId =
        cleanText(entry.newsroomArticleId).toLowerCase();
      const newsroomSnapshotId =
        cleanText(entry.newsroomSnapshotId).toLowerCase();

      if (
        !UUID_PATTERN.test(newsroomArticleId)
        || !UUID_PATTERN.test(newsroomSnapshotId)
      ) {
        continue;
      }

      if (
        refIndex === canonicalIndex
        && entry.imagePreferred
        && !preferredImageArticleId
      ) {
        preferredImageArticleId = newsroomArticleId;
      }

      const usedAt = entry.usedAt
        && !Number.isNaN(Date.parse(entry.usedAt))
        ? Date.parse(entry.usedAt)
        : 0;

      const current = candidates.get(newsroomArticleId);

      if (
        !current
        || usedAt > current.usedAt
      ) {
        candidates.set(newsroomArticleId, {
          newsroomArticleId,
          newsroomSnapshotId,
          usedAt,
          order: current?.order ?? globalOrder,
        });
      }

      globalOrder += 1;
    }
  }

  const orderedCandidates = [...candidates.values()]
    .sort(
      (left, right) =>
        left.order - right.order
        || left.newsroomArticleId.localeCompare(
          right.newsroomArticleId,
        ),
    );

  if (
    orderedCandidates.length < 1
    || orderedCandidates.length
      > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES
  ) {
    return failure("source_limit_exceeded");
  }

  const rawSelections: EditorialSourcePackageSelection[] =
    orderedCandidates.map((candidate) => ({
      newsroomArticleId: candidate.newsroomArticleId,
      newsroomSnapshotId: candidate.newsroomSnapshotId,
      articleGroup: 1,
      ...(candidate.newsroomArticleId === preferredImageArticleId
        ? { imagePreferred: true }
        : {}),
    }));

  const selections =
    normalizeEditorialSourcePackageSelections(rawSelections);

  if (!selections) {
    return failure("source_normalization_failed");
  }

  const packageId = crypto.randomUUID();

  const created = await createEditorialSourcePackage({
    packageId,
    selections,
    editorial: {
      genre: canonicalPackage.manifest.genre,
      genreLabel: canonicalPackage.manifest.genreLabel,
      suggestedTitle:
        cleanText(canonicalArticle.title)
        || canonicalPackage.manifest.suggestedTitle
        || "",
      additionalInstructions:
        canonicalPackage.manifest.additionalInstructions
        || "",
    },
  });

  if (!created.ok) {
    return failure(created.error.code);
  }

  const marked = await markEditorialSourcePackageArticleUsed({
    year: created.value.manifest.year,
    month: created.value.manifest.month,
    packageId: created.value.manifest.packageId,
    articlePosition: 1,
    publishedArticleId: canonicalArticle.id,
    publishedSlug: canonical.publishedSlug,
  });

  if (!marked.ok) {
    return failure("usage_mark_failed");
  }

  return redirectToUsed({
    dossiers_joined: "1",
    joined_sources: String(selections.length),
  });
}
