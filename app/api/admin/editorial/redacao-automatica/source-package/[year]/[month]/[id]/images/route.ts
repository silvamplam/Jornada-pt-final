import {
  editorialSourcePackageArticleImageSources,
  editorialSourcePackageImagesFileName,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  buildEditorialSourceImagesZip,
} from "@/lib/redacao-automatica/editorial-source-image-zip";
import {
  readEditorialSourcePackage,
} from "@/lib/redacao-automatica/editorial-source-package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = Readonly<{
  params: Promise<{
    year: string;
    month: string;
    id: string;
  }>;
}>;

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { year, month, id } = await context.params;
  const result = await readEditorialSourcePackage({
    year,
    month,
    packageId: id,
  });

  if (!result.ok) {
    return errorResponse(
      "Pacote não encontrado.",
      result.error.code === "package_not_found" ? 404 : 400,
    );
  }

  const sources = editorialSourcePackageArticleImageSources(
    result.value.manifest.entries,
  );
  const zip = await buildEditorialSourceImagesZip(sources);

  if (!zip.ok) {
    return errorResponse(
      zip.error === "images_unavailable"
        ? "Este pacote não contém endereços de imagens para descarregar. Prepara um novo pacote após esta atualização."
        : "Não foi possível descarregar nenhuma das imagens deste pacote.",
      422,
    );
  }

  const fileName = editorialSourcePackageImagesFileName(
    result.value.manifest.genre,
    result.value.manifest.suggestedTitle,
  );

  const body = new ArrayBuffer(zip.bytes.byteLength);
  new Uint8Array(body).set(zip.bytes);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(zip.bytes.length),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Jornada-Images-Downloaded": String(zip.downloadedCount),
      "X-Jornada-Images-Failed": String(zip.failedCount),
    },
  });
}
