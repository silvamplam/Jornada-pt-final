import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import {
  HORIZONTAL_ADVERTISING_SLOT_KEY as horizontal,
  PRIMARY_SIDE_ADVERTISING_SLOT_KEY as lateral,
  readAdvertisement,
  isDisplayableSideAdvertisement,
  type SiteAdvertisingSlotRow,
} from "./site-advertising";
import PublicSideAdvertisement from "../components/public/PublicSideAdvertisement";
import PublicHorizontalAdvertisement from "../components/public/PublicHorizontalAdvertisement";
import { renderPublicAdvertisingBoundary } from "../components/public/renderPublicAdvertisingBoundary";
import AdvertisingPage from "../app/admin/publicidade/page";
import { POST } from "../app/api/admin/publicidade/route";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const require = createRequire(import.meta.url);
require.extensions[".css"] = (module) => {
  module.exports = { frame: "editorial-frame" };
};

const row = (
  slot_key: string,
  extra: Partial<SiteAdvertisingSlotRow> = {},
): SiteAdvertisingSlotRow => ({
  slot_key,
  name: "Parceiro",
  image_url: "/ads/banner.png",
  target_url: "https://example.com/",
  alt_text: "Banner do parceiro",
  is_active: true,
  ...extra,
});

test("publicidade manual: leitura, renderização e gravação isolada", async (t) => {
  const savedEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://advertising.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-fixture";
  t.after(() => {
    for (const [key, value] of Object.entries({
      NEXT_PUBLIC_SUPABASE_URL: savedEnv.url,
      SUPABASE_SERVICE_ROLE_KEY: savedEnv.key,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let rows = new Map<string, SiteAdvertisingSlotRow>();
  let failure: "error" | "timeout" | null = null;
  const reads: string[] = [];
  const writes: Record<string, unknown>[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      assert.equal(url.origin, "https://advertising.test");
      assert.equal(url.pathname, "/rest/v1/site_advertising_slots");
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        rows.set(body.slot_key, body);
        return new Response(null, { status: 204 });
      }
      reads.push(url.search);
      if (failure === "error") throw new Error("fixture read failure");
      if (failure === "timeout") return new Promise<Response>(() => {});
      const key = url.searchParams.get("slot_key")?.replace(/^eq\./, "") ?? "";
      return Response.json(rows.has(key) ? [rows.get(key)] : []);
    },
  );

  for (const slot of [lateral, horizontal] as const) {
    const render =
      slot === lateral
        ? () => PublicSideAdvertisement({})
        : PublicHorizontalAdvertisement;
    await t.test(
      slot + ": ativa é apresentada e mantém imagem, destino e alt",
      async () => {
        rows.set(slot, row(slot));
        const html = renderToStaticMarkup(await render());
        const $ = load(html);
        assert.equal($("a").attr("href"), "https://example.com/");
        assert.equal($("img").attr("src"), "/ads/banner.png");
        assert.equal($("img").attr("alt"), "Banner do parceiro");
        assert.match($("a").attr("rel") ?? "", /sponsored/);
      },
    );
    for (const [name, changes] of [
      ["inativa", { is_active: false }],
      ["sem imagem", { image_url: "  " }],
      ["sem destino", { target_url: "" }],
      ["URL inválido", { target_url: "javascript:alert(1)" }],
    ] as const) {
      await t.test(
        slot + ": " + name + " não deixa imagem, label, wrapper nem estilos",
        async () => {
          rows.set(slot, row(slot, changes));
          assert.equal(await render(), null);
          assert.equal(
            isDisplayableSideAdvertisement(
              (await readAdvertisement(slot)).advertisement,
            ),
            false,
          );
        },
      );
    }
    await t.test(slot + ": registo inexistente não usa fallback", async () => {
      rows.delete(slot);
      assert.deepEqual(await readAdvertisement(slot), {
        advertisement: null,
        storageReady: true,
        error: null,
      });
      assert.equal(await render(), null);
    });
    await t.test(slot + ": erro de leitura não usa fallback", async () => {
      failure = "error";
      assert.equal((await readAdvertisement(slot)).advertisement, null);
      assert.equal(await render(), null);
      failure = null;
    });
    await t.test(slot + ": timeout colapsa", async (tt) => {
      failure = "timeout";
      tt.mock.timers.enable({ apis: ["setTimeout"] });
      const result = render();
      tt.mock.timers.tick(8001);
      assert.equal(await result, null);
      failure = null;
    });
  }

  for (const format of ["slim", "tall"] as const) {
    await t.test("horizontal " + format + " ativa", async () => {
      rows.set(horizontal, row(horizontal, { display_format: format }));
      const $ = load(
        renderToStaticMarkup(await PublicHorizontalAdvertisement()),
      );
      assert.equal($("aside").attr("data-format"), format);
      assert.equal($("aside").attr("data-public-ad-slot"), horizontal);
      assert.equal($("span").text(), "Publicidade");
    });
  }
  await t.test(
    "formato omisso/antigo assume slim; query lateral não depende da migration",
    async () => {
      rows.set(horizontal, row(horizontal, { display_format: "unknown" }));
      assert.equal(
        (await readAdvertisement(horizontal)).advertisement?.format,
        "slim",
      );
      rows.set(lateral, row(lateral));
      await readAdvertisement(lateral);
      assert.doesNotMatch(reads.at(-1)!, /display_format/);
    },
  );

  async function submit(fields: Record<string, string>) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return POST(
      new Request("http://localhost/api/admin/publicidade", {
        method: "POST",
        body: form,
      }),
    );
  }
  await t.test(
    "POST guarda slots independentemente; lateral não depende do novo campo",
    async () => {
      rows = new Map([[lateral, row(lateral)]]);
      const existing = rows.get(lateral);
      const response = await submit({
        slot_key: horizontal,
        name: "Faixa",
        image_url: "/horizontal.png",
        target_url: "/contactos",
        is_active: "true",
        display_format: "tall",
      });
      assert.equal(response.status, 303);
      assert.match(response.headers.get("location")!, /saved=1/);
      assert.equal(rows.get(lateral), existing);
      assert.equal(rows.get(horizontal)?.display_format, "tall");
      await submit({
        slot_key: lateral,
        name: "Lateral",
        image_url: "/lateral.png",
        target_url: "/contactos",
        is_active: "true",
      });
      assert.equal(writes.at(-1)?.slot_key, lateral);
      assert.ok(!("display_format" in writes.at(-1)!));
      assert.equal(rows.get(horizontal)?.image_url, "/horizontal.png");
    },
  );
  await t.test(
    "POST horizontal omisso usa slim, e formulário antigo continua lateral",
    async () => {
      await submit({ slot_key: horizontal });
      assert.equal(writes.at(-1)?.display_format, "slim");
      await submit({ name: "Antigo" });
      assert.equal(writes.at(-1)?.slot_key, lateral);
      assert.equal(writes.at(-1)?.is_active, false);
    },
  );
  for (const [fields, error] of [
    [{ slot_key: "third_position" }, "invalid-slot"],
    [{ slot_key: horizontal, display_format: "huge" }, "invalid-format"],
    [{ slot_key: horizontal, is_active: "true" }, "missing-image"],
    [
      { slot_key: lateral, is_active: "true", image_url: "/image.png" },
      "missing-target",
    ],
    [
      { slot_key: horizontal, target_url: "javascript:alert(1)" },
      "invalid-target",
    ],
  ] as const) {
    await t.test("POST rejeita " + error + " antes da escrita", async () => {
      const before = writes.length;
      const response = await submit(fields);
      assert.match(response.headers.get("location")!, new RegExp(error));
      assert.equal(writes.length, before);
    });
  }
  await t.test(
    "admin apresenta dois formulários e desativa edição quando falha a leitura",
    async () => {
      rows = new Map();
      let $ = load(renderToStaticMarkup(await AdvertisingPage({})));
      assert.equal($("form").length, 2);
      assert.deepEqual(
        $('[name="slot_key"]')
          .map((_, el) => $(el).attr("value"))
          .get(),
        [lateral, horizontal],
      );
      assert.equal($('[name="display_format"]').length, 1);
      assert.equal($('[name="is_active"][checked]').length, 0);
      failure = "error";
      $ = load(renderToStaticMarkup(await AdvertisingPage({})));
      assert.equal($("fieldset[disabled]").length, 2);
      failure = null;
    },
  );
  await t.test(
    "wrappers laterais só existem quando há publicidade válida",
    async () => {
      const Four = (
        await import("../components/public/PublicFourNewsLatestLayout")
      ).default;
      const Latest = (
        await import("../components/public/PublicThematicLatestOnlyLayout")
      ).default;
      const Companion = (
        await import("../components/public/PublicLatestCompanionLayout")
      ).default;
      const { createPublicFlexibleZone } = await import(
        "../components/public/PublicFlexibleZoneRenderers"
      );
      const items = Array.from({ length: 4 }, (_, i) => ({
        id: "news-" + i,
        sourceId: "news-" + i,
        sortOrder: i + 1,
        label: "Notícia",
        title: "Título " + i,
        subtitle: "Resumo",
        imageUrl: "/news.png",
        linkUrl: "/noticias/" + i,
        publishedAt: null,
      }));
      const latest = [
        {
          id: "latest",
          title: "Última notícia",
          linkUrl: "/noticias/latest",
          publishedAt: null,
        },
      ];
      for (const active of [true, false]) {
        rows.set(lateral, row(lateral, { is_active: active }));
        const layouts = await Promise.all([
          Four({ items, latestNews: latest }),
          Latest({ items: latest }),
          Companion({
            zone: createPublicFlexibleZone({
              key: "news",
              visualFamily: "four_news",
              publicTitle: "Notícias",
              items,
            }),
            matchdayNumber: 1,
            latestNews: latest,
          }),
        ]);
        for (const layout of layouts) {
          const $ = load(renderToStaticMarkup(layout));
          assert.equal(
            $("aside[aria-label='Publicidade']").length,
            active ? 1 : 0,
          );
        }
      }
    },
  );
});

test("fronteira publicitária usa apenas blocos visíveis, sem mutar a ordem editorial", () => {
  const ad = <aside data-test-ad>Publicidade</aside>;
  function check(
    kinds: string[],
    hidden: number[],
    startsAfterNews: boolean,
    expected: string[],
    showAd = true,
  ) {
    const blocks = kinds.map((kind, id) => Object.freeze({ kind, id }));
    const before = JSON.stringify(blocks);
    const output = renderPublicAdvertisingBoundary(
      blocks,
      (b) =>
        hidden.includes(b.id) ? null : <section data-block={b.kind + b.id} />,
      showAd ? ad : null,
      startsAfterNews,
    );
    const $ = load(renderToStaticMarkup(<>{output}</>));
    const order = $("section,aside")
      .map((_, el) => $(el).attr("data-block") || "ad")
      .get();
    assert.deepEqual(order, expected);
    assert.equal(JSON.stringify(blocks), before);
  }
  check(["zone", "video"], [], false, ["zone0", "ad", "video1"]);
  check(["zone", "latest", "video"], [], false, [
    "zone0",
    "ad",
    "latest1",
    "video2",
  ]);
  check(["zone", "latest"], [], false, ["zone0", "ad", "latest1"]);
  check(["latest", "video"], [], false, ["latest0", "ad", "video1"]);
  check(["zone", "latest", "video"], [1], false, ["zone0", "ad", "video2"]);
  check(["zone", "video"], [0], false, ["video1"]);
  check(["video", "zone"], [], false, ["video0", "zone1"]);
  check(["zone", "video"], [1], false, ["zone0"]);
  check(["video"], [], true, ["ad", "video0"]);
  check(["zone", "video", "zone", "video"], [], false, [
    "zone0",
    "ad",
    "video1",
    "zone2",
    "video3",
  ]);
  check(["zone", "video"], [], false, ["zone0", "video1"], false);
});

test("integração pública mantém publicidade fora dos dados editoriais e elimina falsos espaços", () => {
  const source = (p: string) => readFileSync(p, "utf8");
  const page = source(
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  );
  for (const collection of [
    "physicalSnapshot.blocks",
    "thematicEditorialBodyBlocks",
    "liveEditorialBodyBlocks",
    "historicalDynamicBodyBlocks",
  ]) {
    assert.ok(
      page.includes("renderPublicAdvertisingBoundary(" + collection + ","),
    );
  }
  assert.match(
    page,
    /historicalLegacyHasNewsBeforeVideo \? horizontalAdvertisement : null/,
  );
  for (const p of [
    "components/public/PublicGamesPage.tsx",
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx",
  ]) {
    assert.doesNotMatch(source(p), /public-games-ad-(?:box|slot|rail)/);
    assert.doesNotMatch(source(p), /aria-label="Publicidade"/);
  }
  for (const p of [
    "app/noticias/[slug]/page.tsx",
    "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/editorial/page.tsx",
  ]) {
    assert.match(source(p), /sideAdvertisement.*\? \(/);
    assert.match(
      source(p),
      /news-article-layout:not\(:has\(\.news-article-sidebar\)\)/,
    );
  }
  for (const p of [
    "lib/public-matchday-editorial-body.ts",
    "lib/public-matchday-physical.ts",
    "lib/public-matchday-thematic.ts",
    "components/public/PublicHierarchicalComposition.tsx",
  ]) {
    assert.doesNotMatch(
      source(p),
      /horizontal_between_zones|PublicHorizontalAdvertisement|renderPublicAdvertisingBoundary/,
    );
  }
});

test("legado incompleto não se torna um antecessor publicitário visível", async () => {
  const { PublicHierarchicalLiveLayouts } = await import("../components/public/PublicHierarchicalComposition");
  const { HIERARCHICAL_COMPOSITION_SLOT_KEYS } = await import("./editorial-hierarchical-composition");
  const slots = HIERARCHICAL_COMPOSITION_SLOT_KEYS.slice(0, 6).map((slot_key) => ({
    id: slot_key, composition_id: "fixture", slot_key, bank_item_id: null,
    source_identity: slot_key, label_snapshot: "", title_snapshot: "",
    subtitle_snapshot: "", image_url_snapshot: "", link_url_snapshot: "",
  }));
  const news = PublicHierarchicalLiveLayouts({ slots, matchdayNumber: 1, beyondMatchdayItems: [] });
  assert.equal(news, null);
  const output = renderPublicAdvertisingBoundary(
    [{ kind: "zone" }, { kind: "video" }],
    block => block.kind === "zone" ? news : <section data-video />,
    <aside data-ad />,
  );
  const $ = load(renderToStaticMarkup(<>{output}</>));
  assert.equal($("[data-ad]").length, 0);
  assert.equal($("[data-video]").length, 1);
});
