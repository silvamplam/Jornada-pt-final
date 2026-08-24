import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(
    path.join(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

const flow =
  source(
    "lib/editorial-matchday-news-flow.ts",
  );

const route =
  source(
    "app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts",
  );

const client =
  source(
    "app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx",
  );

const migration =
  source(
    "supabase/migrations/20260823215153_batch_publication_latest_order_set_based.sql",
  );

test(
  "N artigos em lote não normalizam nem reconciliam globalmente N vezes",
  () => {
    const deferCount =
      route.match(
        /deferGlobalSync: true/g,
      )?.length ?? 0;

    assert.ok(
      deferCount >= 3,
      `esperados create/update/resume diferidos; encontrados ${deferCount}`,
    );

    assert.match(
      flow,
      /if \(!options\.deferGlobalSync\)/,
    );
  },
);

test(
  "normalização de Últimas é uma operação set-based",
  () => {
    assert.match(
      flow,
      /rpc\/normalize_matchday_latest_news_order/,
    );

    assert.doesNotMatch(
      flow,
      /Promise\.all\(\s*ordered\.map/,
    );

    assert.match(
      migration,
      /row_number\(\) over/,
    );

    assert.match(
      migration,
      /update public\.matchday_latest_news/,
    );
  },
);

test(
  "sort_order isolado deixa de provocar refresh editorial temático",
  () => {
    assert.match(
      migration,
      /tg_op = 'UPDATE'/,
    );

    assert.match(
      migration,
      /is not distinct from/,
    );

    const comparison =
      migration.slice(
        migration.indexOf(
          "if tg_op = 'UPDATE'",
        ),
        migration.indexOf(
          "then",
          migration.indexOf(
            "if tg_op = 'UPDATE'",
          ),
        ),
      );

    assert.doesNotMatch(
      comparison,
      /sort_order/,
    );
  },
);

test(
  "reconciliação global ocorre no fim do lote",
  () => {
    assert.match(
      client,
      /await finalizeBatchEditorialFlow\(\)/,
    );

    assert.match(
      route,
      /action === "finalize_batch"/,
    );

    assert.match(
      route,
      /finalizePublishedArticlesInLatestBatch/,
    );
  },
);

test(
  "falha intermédia finaliza os artigos já efetivamente publicados",
  () => {
    const errorIndex =
      client.indexOf(
        "Publicação interrompida no artigo",
      );

    const finalizeIndex =
      client.indexOf(
        "await finalizeBatchEditorialFlow()",
        errorIndex,
      );

    assert.ok(
      errorIndex >= 0,
    );

    assert.ok(
      finalizeIndex > errorIndex,
    );
  },
);

test(
  "retoma continua a ignorar artigos já concluídos",
  () => {
    assert.match(
      client,
      /status === "published"\) \{\s*continue;/,
    );

    const existingBranchStart = route.indexOf("if (existing) {");
    const createBranchStart = route.indexOf(
      "const result = await createEditorialArticle",
      existingBranchStart,
    );

    assert.ok(
      existingBranchStart >= 0
      && createBranchStart > existingBranchStart,
    );

    const existingBranch = route.slice(
      existingBranchStart,
      createBranchStart,
    );

    assert.match(existingBranch, /existingArticleMatches\(/);
    assert.match(
      existingBranch,
      /ensurePublishedArticleInLatest\([\s\S]*deferGlobalSync:\s*true/,
    );
    assert.match(existingBranch, /resumed:\s*true/);
    assert.doesNotMatch(existingBranch, /createEditorialArticle\(/);
  },
);

test(
  "create do lote publica canónico antes de garantir Últimas sem sync global",
  () => {
    assert.match(
      route,
      /initialPlacement: "none"/,
    );

    assert.match(
      route,
      /result\.articleId,[\s\S]*?deferGlobalSync: true/,
    );
  },
);

test(
  "publicação individual mantém o comportamento imediato por defeito",
  () => {
    assert.match(
      flow,
      /options: EnsurePublishedArticleInLatestOptions = \{\}/,
    );

    assert.match(
      flow,
      /if \(!options\.deferGlobalSync\) \{[\s\S]*?normalizeLatestNewsOrder/,
    );

    assert.match(
      flow,
      /targetSlotType === "editorial_line_item"[\s\S]*?ensurePublishedArticleInLatest\(matchdayId, articleId\)/,
    );
  },
);

test(
  "update publicado continua a manter o mesmo artigo e URL",
  () => {
    assert.match(
      route,
      /await updateEditorialArticle/,
    );

    assert.match(
      route,
      /slug:[\s\S]*?existing\.slug/,
    );

    assert.match(
      route,
      /existing\.id,[\s\S]*?deferGlobalSync: true/,
    );
  },
);

test(
  "reconcile de horas também agrega a finalização por jornada",
  () => {
    assert.match(
      route,
      /affectedMatchdayIds/,
    );

    assert.match(
      route,
      /for \([\s\S]*?affectedMatchdayId[\s\S]*?finalizePublishedArticlesInLatestBatch/,
    );
  },
);
