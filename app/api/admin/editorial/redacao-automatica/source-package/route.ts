import { NextResponse } from "next/server";

import {
  EDITORIAL_SOURCE_PACKAGE_MAX_SOURCES,
  normalizeEditorialSourcePackageEditorialInput,
  normalizeEditorialSourcePackageSelections,
  type EditorialSourcePackageSelection,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  createEditorialSourcePackage,
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
  const selections = selectionsFromFormData(formData);
  const editorial = normalizeEditorialSourcePackageEditorialInput({
    genre: cleanText(formData.get("editorial_genre")),
    suggestedTitle: cleanText(formData.get("suggested_title")),
    additionalInstructions: cleanText(formData.get("editorial_instructions")),
  });

  if (!selections || !editorial) {
    return redirectTo("/admin/editorial/redacao-automatica", {
      package_error: "input_invalid",
    });
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
