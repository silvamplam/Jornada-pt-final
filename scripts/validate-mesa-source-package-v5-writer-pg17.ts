import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { createEditorialSourcePackage } from "../lib/redacao-automatica/editorial-source-package";

const articleIds = [1, 2, 3, 4].map(
  (position) => `b1000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
);
const snapshotIds = [1, 2, 3, 4].map(
  (position) => `b2000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
);
const dossierSourceIds = [1, 2, 3, 4].map(
  (position) => `b3000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
);
const outputIds = [1, 2, 3].map(
  (position) => `b5000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
);
const dossierId = "b4000000-0000-4000-8000-000000000001";
const packageId = "b6000000-0000-4000-8000-000000000001";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://source-package-v5.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "validation-only";

globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (url.pathname.endsWith("/newsroom_articles")) {
    return Response.json(articleIds.map((id, index) => ({
      id,
      source_code: "fixture",
      original_url: `https://example.test/fonte-${index + 1}`,
      normalized_url: `https://example.test/fonte-${index + 1}`,
      title: `Fonte real ${index + 1} do caminho Guardar`,
      subtitle: null,
      author: "Autor",
      published_at: null,
      image_url: null,
    })));
  }
  if (url.pathname.endsWith("/newsroom_article_snapshots")) {
    return Response.json(snapshotIds.map((id, index) => ({
      id,
      article_id: articleIds[index],
      body: [{ type: "paragraph", text: `Corpo congelado da fonte ${index + 1}.` }],
      source_metadata: {},
    })));
  }
  if (url.pathname.endsWith("/newsroom_editorial_source_packages") && init?.method === "POST") {
    const body = JSON.parse(String(init.body)) as {
      id: string;
      created_at: string;
      updated_at: string;
      package_year: string;
      package_month: string;
      manifest: unknown;
      markdown: string;
    };
    const psql = process.env.JORNADA_VALIDATION_PSQL;
    const database = process.env.JORNADA_VALIDATION_DATABASE;
    assert.ok(psql, "JORNADA_VALIDATION_PSQL missing");
    assert.ok(database, "JORNADA_VALIDATION_DATABASE missing");
    const sql = [
      "insert into public.newsroom_editorial_source_packages(",
      "id,created_at,updated_at,package_year,package_month,manifest,markdown",
      ") values (",
      ":'id'::uuid,:'created_at'::timestamptz,:'updated_at'::timestamptz,",
      ":'package_year',:'package_month',",
      "convert_from(decode(:'manifest_b64','base64'),'UTF8')::jsonb,",
      "convert_from(decode(:'markdown_b64','base64'),'UTF8')",
      ");",
    ].join("\n");
    const inserted = spawnSync(psql, [
      "-X", "-h", "127.0.0.1", "-p", "55433", "-U", "postgres",
      "-d", database, "-v", "ON_ERROR_STOP=1",
      "-v", `id=${body.id}`,
      "-v", `created_at=${body.created_at}`,
      "-v", `updated_at=${body.updated_at}`,
      "-v", `package_year=${body.package_year}`,
      "-v", `package_month=${body.package_month}`,
      "-v", `manifest_b64=${Buffer.from(JSON.stringify(body.manifest)).toString("base64")}`,
      "-v", `markdown_b64=${Buffer.from(body.markdown).toString("base64")}`,
    ], { input: sql, encoding: "utf8" });
    if (inserted.status !== 0) {
      return new Response(inserted.stderr || inserted.stdout, { status: 400 });
    }
    return new Response(null, { status: 201 });
  }
  return new Response(`Unexpected validation request: ${url}`, { status: 500 });
};

async function main() {
const result = await createEditorialSourcePackage({
  packageId,
  now: new Date("2026-09-12T19:00:00.000Z"),
  selections: articleIds.map((newsroomArticleId, index) => ({
    newsroomArticleId,
    newsroomSnapshotId: snapshotIds[index],
    provenanceSourceId: dossierSourceIds[index],
    articleGroup: 1,
  })),
  outputs: outputIds.map((outputId, index) => ({
    position: index + 1,
    outputId,
    startingPointSourceId: dossierSourceIds[index],
    sourceArticlePosition: 1,
    focus: `Foco editorial ${index + 1}`,
    imageNewsroomArticleId: null,
    articlePlan: {
      dossierId,
      articlePlanId: outputId,
      workingTitle: `Output técnico ${index + 1}`,
      articleKind: "news",
      articleKindLabel: "Notícia",
      lengthMode: "standard",
      lengthModeLabel: "Normal",
      editorialInstructions: "",
      destination: "new",
      workspaceContractVersion: 2,
      sourceScope: "workspace",
    },
  })),
  editorial: {
    genre: "news",
    genreLabel: "Notícia",
    suggestedTitle: "Produção Mesa 4 fontes / 3 outputs",
    additionalInstructions: "Todos os outputs recebem o material completo.",
  },
});

if (!result.ok) throw new Error(result.error.code);
assert.equal(result.ok, true, JSON.stringify(result));
assert.equal(result.value.manifest.version, 5);
assert.equal(result.value.manifest.provenanceContract, "mesa-v2");
assert.equal(result.value.manifest.packageId, packageId);
assert.equal(result.value.manifest.selectedCount, 4);
assert.equal(result.value.manifest.articleCount, 3);
assert.deepEqual(
  result.value.manifest.entries.map((entry) => entry.provenanceSourceId),
  dossierSourceIds,
);
assert.ok(result.value.manifest.entries.every((entry) => entry.articlePosition === 1));
assert.deepEqual(
  result.value.manifest.outputs.map((output) => output.outputId),
  outputIds,
);
assert.deepEqual(
  result.value.manifest.outputs.map((output) => output.startingPointSourceId),
  dossierSourceIds.slice(0, outputIds.length),
);
assert.ok(result.value.markdown.includes(`PONTO_DE_PARTIDA: ${dossierSourceIds[0]}`));
assert.ok(result.value.manifest.outputs.every(
  (output) => output.sourceArticlePosition === 1
    && output.articlePlan?.sourceScope === "workspace",
));
process.stdout.write("source-package-v5-real-writer-path-4-sources-3-outputs-ok\n");
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
