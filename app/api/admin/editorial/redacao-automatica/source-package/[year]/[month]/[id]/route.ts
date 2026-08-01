import { NextResponse } from "next/server";

import {
  editorialSourcePackageFileName,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  readEditorialSourcePackage,
  updateEditorialSourcePackageEditorial,
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
    headers: { Location: `${url.pathname}${url.search}` },
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

export async function POST(request: Request, context: RouteContext) {
  const { year, month, id } = await context.params;
  const formData = await request.formData();
  const result = await updateEditorialSourcePackageEditorial({
    year,
    month,
    packageId: id,
    suggestedTitle: cleanText(formData.get("suggested_title")),
    additionalInstructions: cleanText(formData.get("editorial_instructions")),
  });

  if (!result.ok) {
    return redirectTo(packagePath(year, month, id), {
      package_update_error: result.error.code,
    });
  }

  return redirectTo(packagePath(year, month, id), {
    package_updated: "1",
  });
}
