import { NextResponse } from "next/server";

import {
  EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES,
  isEditorialSourcePackageLocation,
  normalizeEditorialSourcePackageEditorialInput,
  normalizeEditorialSourcePackageSelections,
  type EditorialSourcePackageSelection,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  createEditorialSourcePackage,
  readEditorialSourcePackage,
} from "@/lib/redacao-automatica/editorial-source-package";

export const runtime = "nodejs";
export const maxDuration = 300;

function cleanText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function redirectTo(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, "https://jornada.local");

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `${url.pathname}${url.search}` },
  });
}

function selectionsFromFormData(
  formData: FormData,
): readonly EditorialSourcePackageSelection[] | null {
  const articleIds = formData.getAll("newsroom_article_id");
  if (
    articleIds.length < 1
    || articleIds.length > EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES
  ) {
    return null;
  }

  const selections = articleIds.flatMap((value): EditorialSourcePackageSelection[] => {
    const newsroomArticleId = typeof value === "string" ? value.trim() : "";
    const newsroomSnapshotId = cleanText(
      formData.get(`source_snapshot_${newsroomArticleId}`),
    );
    const articleGroupValue = cleanText(
      formData.get(`source_group_${newsroomArticleId}`),
    );
    const articleGroup = Number(articleGroupValue);
    const imagePreferred = cleanText(
      formData.get(`source_image_preferred_${newsroomArticleId}`),
    ) === "1";

    return newsroomArticleId && newsroomSnapshotId
      ? [{
          newsroomArticleId,
          newsroomSnapshotId,
          ...(Number.isInteger(articleGroup) && articleGroup > 0 ? { articleGroup } : {}),
          ...(imagePreferred ? { imagePreferred: true } : {}),
        }]
      : [];
  });

  return selections.length === articleIds.length
    ? normalizeEditorialSourcePackageSelections(selections)
    : null;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const selectedAdditions = selectionsFromFormData(formData);
  const editorial = normalizeEditorialSourcePackageEditorialInput({
    genre: cleanText(formData.get("editorial_genre")),
    suggestedTitle: cleanText(formData.get("suggested_title")),
    additionalInstructions: cleanText(formData.get("editorial_instructions")),
  });

  if (!selectedAdditions || !editorial) {
    return redirectTo("/admin/editorial/redacao-automatica", {
      package_error: "input_invalid",
    });
  }

  const reuseYear = cleanText(formData.get("reuse_year"));
  const reuseMonth = cleanText(formData.get("reuse_month"));
  const reusePackageId = cleanText(formData.get("reuse_package"));
  const reuseArticlePosition = Number(
    cleanText(formData.get("reuse_article")),
  );
  const reuseRequested = Boolean(
    reuseYear
    || reuseMonth
    || reusePackageId
    || cleanText(formData.get("reuse_article")),
  );

  let selections = selectedAdditions;

  if (reuseRequested) {
    const reuseLocation = {
      year: reuseYear,
      month: reuseMonth,
      packageId: reusePackageId,
    };

    if (
      !isEditorialSourcePackageLocation(reuseLocation)
      || !Number.isInteger(reuseArticlePosition)
      || reuseArticlePosition < 1
    ) {
      return redirectTo("/admin/editorial/redacao-automatica", {
        package_error: "input_invalid",
      });
    }

    const previous = await readEditorialSourcePackage(reuseLocation);

    if (!previous.ok) {
      return redirectTo("/admin/editorial/redacao-automatica", {
        package_error: "source_read_failed",
      });
    }

    const previousEntries = previous.value.manifest.entries.filter(
      (entry) => (
        entry.articlePosition === reuseArticlePosition
        && typeof entry.newsroomArticleId === "string"
        && Boolean(entry.newsroomArticleId)
        && typeof entry.newsroomSnapshotId === "string"
        && Boolean(entry.newsroomSnapshotId)
      ),
    );

    if (previousEntries.length < 1) {
      return redirectTo("/admin/editorial/redacao-automatica", {
        package_error: "input_invalid",
      });
    }

    const newByArticleId = new Map(
      selectedAdditions.map((selection) => [
        selection.newsroomArticleId,
        selection,
      ]),
    );

    const previousSelections = previousEntries
      .filter((entry) => !newByArticleId.has(entry.newsroomArticleId!))
      .map((entry) => ({
        newsroomArticleId: entry.newsroomArticleId!,
        newsroomSnapshotId: entry.newsroomSnapshotId!,
        articleGroup: 1,
        ...(entry.imagePreferred ? { imagePreferred: true } : {}),
      }));

    const newSelections = selectedAdditions.map((selection) => ({
      newsroomArticleId: selection.newsroomArticleId,
      newsroomSnapshotId: selection.newsroomSnapshotId,
      articleGroup: 1,
    }));

    const normalized = normalizeEditorialSourcePackageSelections([
      ...previousSelections,
      ...newSelections,
    ]);

    if (!normalized) {
      return redirectTo("/admin/editorial/redacao-automatica", {
        package_error: "input_invalid",
      });
    }

    selections = normalized;
  }

  const packageId = crypto.randomUUID();
  const result = await createEditorialSourcePackage({
    packageId,
    selections,
    editorial,
  });

  if (!result.ok) {
    return redirectTo("/admin/editorial/redacao-automatica", {
      package_error: result.error.code,
    });
  }

  const { manifest } = result.value;

  return redirectTo(
    `/admin/editorial/redacao-automatica/pacotes/${manifest.year}/${manifest.month}/${manifest.packageId}`,
  );
}
