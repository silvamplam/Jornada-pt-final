import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// Next replaces this marker module at build time; tests need only its no-op side effect.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? { url: "node:fs", shortCircuit: true }
      : nextResolve(specifier, context);
  },
});

const { POST } = await import("../../app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts");
const { publishEditorialMesaOutput } = await import("./editorial-dossier-article-plan-service.ts");

async function withoutRemoteCalls(action) {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error("Unexpected remote call from contaminated publication");
  };
  try {
    await action(calls);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

async function post(payload) {
  return POST(new Request("http://localhost/api/admin/editorial/redacao-automatica/publicacao-lote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

test("lote de continuidade com artigo intermédio contaminado é recusado antes de qualquer escrita", async () => {
  const articles = [
    { index: 1, key: "01", body: "Corpo anterior válido." },
    { index: 2, key: "02", body: "Corpo integral. [/JORNADA_CONTINUIDADE_V1]" },
    { index: 3, key: "03", body: "Corpo posterior válido." },
  ];
  await withoutRemoteCalls(async () => {
    const response = await post({ action: "publish_theme_continuity", author: "Editor", articles });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "technical-marker-in-article",
      detail: "O artigo 2, campo body, contém o marcador técnico [/JORNADA_CONTINUIDADE_V1]. Corrija o texto antes de publicar.",
    });
  });
});

test("UPDATE contaminado é recusado antes de ler ou escrever artigo, Latest e fontes", async () => {
  await withoutRemoteCalls(async () => {
    const response = await post({
      action: "publish_item", publicationMode: "update", author: "Editor",
      article: { index: 1, key: "01", title: "Título", body: "Corpo [/JORNADA_ARTIGO_V1]" },
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "technical-marker-in-article");
  });
});

test("o writer Mesa RPC recusa CREATE e UPDATE diretos sem chamar a Supabase", async () => {
  await withoutRemoteCalls(async () => {
    for (const mode of ["create", "update"]) {
      const result = await publishEditorialMesaOutput({
        dossierId: "11111111-1111-4111-8111-111111111111",
        outputId: "22222222-2222-4222-8222-222222222222",
        packageId: "33333333-3333-4333-8333-333333333333",
        dossierSourceIds: ["44444444-4444-4444-8444-444444444444"],
        article: {
          id: "55555555-5555-4555-8555-555555555555", slug: "slug", label: "Liga", title: "Título", subtitle: "Pós-título",
          body: "Corpo [/JORNADA_CONTINUIDADE_V1]", imageUrl: null, author: "Editor",
          publishedAt: "2026-09-29T12:00:00.000Z", matchdayId: "66666666-6666-4666-8666-666666666666",
          mode, classificationKey: "benfica",
        },
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "mesa-publication-article-invalid");
      assert.match(result.detail, /campo body.*marcador técnico/);
    }
  });
});
