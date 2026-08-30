import { NextResponse } from "next/server";

import {
  EDITORIAL_SOURCE_PACKAGE_MAX_DOSSIER_OUTPUTS,
  EDITORIAL_SOURCE_PACKAGE_MAX_OUTPUTS,
  editorialSourcePackageFileName,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  readEditorialSourcePackage,
  updateEditorialSourcePackageEditorial,
  updateEditorialSourcePackageOutputs,
} from "@/lib/redacao-automatica/editorial-source-package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = Readonly<{
  params: Promise<{
    year: string;
    month: string;
    id: string;
  }>;
}>;

function cleanText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEditorialStorageImageUrl(value: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    return false;
  }

  try {
    const candidate = new URL(value);
    const expected = new URL(supabaseUrl);
    return candidate.origin === expected.origin
      && decodeURIComponent(candidate.pathname).includes(
        "/storage/v1/object/public/editorial-images/",
      );
  } catch {
    return false;
  }
}

function packagePath(year: string, month: string, id: string): string {
  return `/admin/editorial/redacao-automatica/pacotes/${year}/${month}/${id}`;
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
    headers: { Location: `${url.pathname}${url.search}${url.hash}` },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { year, month, id } = await context.params;
  const result = await readEditorialSourcePackage({
    year,
    month,
    packageId: id,
  });

  if (!result.ok) {
    return new Response("Pacote não encontrado.", {
      status: result.error.code === "package_not_found" ? 404 : 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  });

  if (download) {
    const fileName = editorialSourcePackageFileName(
      result.value.manifest.genre,
      result.value.manifest.suggestedTitle,
    );
    headers.set(
      "Content-Disposition",
      `attachment; filename="${fileName}"`,
    );
  }

  return new Response(result.value.markdown, {
    status: 200,
    headers,
  });
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const { year, month, id } =
    await context.params;

  const formData =
    await request.formData();

  const updateMode =
    cleanText(formData.get("update_mode"));

  if (updateMode === "outputs") {
    const outputCount =
      Number(
        cleanText(
          formData.get("output_count"),
        ),
      );

    if (
      !Number.isInteger(outputCount)
      || outputCount < 1
      || outputCount > EDITORIAL_SOURCE_PACKAGE_MAX_OUTPUTS
    ) {
      return redirectTo(
        packagePath(year, month, id),
        {
          package_update_error:
            "input_invalid",
        },
      );
    }

    const outputs =
      Array.from(
        { length: outputCount },
        (_, index) => {
          const position = index + 1;

          return {
            position,
            sourceArticlePosition:
              Number(
                cleanText(
                  formData.get(
                    `output_source_group_${position}`,
                  ),
                ),
              ),
            focus:
              cleanText(
                formData.get(
                  `output_focus_${position}`,
                ),
              ),
            imageNewsroomArticleId:
              cleanText(
                formData.get(
                  `output_image_${position}`,
                ),
              ) || null,
            externalImage:
              cleanText(
                formData.get(
                  `output_external_image_url_${position}`,
                ),
              )
                ? {
                    url: cleanText(
                      formData.get(
                        `output_external_image_url_${position}`,
                      ),
                    ),
                    fileName: cleanText(
                      formData.get(
                        `output_external_image_name_${position}`,
                      ),
                    ),
                  }
                : null,
          };
        },
      );

    const outputCountBySourceGroup = new Map<number, number>();
    for (const output of outputs) {
      if (
        output.externalImage
        && !isEditorialStorageImageUrl(output.externalImage.url)
      ) {
        return redirectTo(
          packagePath(year, month, id),
          { package_update_error: "input_invalid" },
        );
      }

      const count = (outputCountBySourceGroup.get(output.sourceArticlePosition) ?? 0) + 1;
      if (count > EDITORIAL_SOURCE_PACKAGE_MAX_DOSSIER_OUTPUTS) {
        return redirectTo(
          packagePath(year, month, id),
          { package_update_error: "input_invalid" },
        );
      }
      outputCountBySourceGroup.set(output.sourceArticlePosition, count);
    }

    const result =
      await updateEditorialSourcePackageOutputs({
        year,
        month,
        packageId: id,
        outputs,
      });

    if (!result.ok) {
      return redirectTo(
        packagePath(year, month, id),
        {
          package_update_error:
            result.error.code,
        },
      );
    }

    return redirectTo(
      `${packagePath(year, month, id)}#source-package-output-actions`,
      {
        package_outputs_updated: "1",
      },
    );
  }

  const result =
    await updateEditorialSourcePackageEditorial({
      year,
      month,
      packageId: id,
      suggestedTitle:
        cleanText(
          formData.get("suggested_title"),
        ),
      additionalInstructions:
        cleanText(
          formData.get(
            "editorial_instructions",
          ),
        ),
    });

  if (!result.ok) {
    return redirectTo(
      packagePath(year, month, id),
      {
        package_update_error:
          result.error.code,
      },
    );
  }

  return redirectTo(
    packagePath(year, month, id),
    {
      package_updated: "1",
    },
  );
}
