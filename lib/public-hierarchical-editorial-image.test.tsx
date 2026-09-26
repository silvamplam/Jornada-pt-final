import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { readPublicHierarchicalEditorialImage } from "./public-hierarchical-editorial-image";
import PublicHierarchicalComposition from "../components/public/PublicHierarchicalComposition";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const composition = {
  status: "published" as const,
  is_current: true,
  presentation_mode: "hierarchical" as const,
  hierarchical_editorial_source_type: "editorial_article",
  hierarchical_editorial_source_id: "historical-article",
};

test("historical image follows only the explicit published article, preserving the snapshot", async (t) => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://editorial.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-fixture";
  t.after(() => {
    for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: saved.url, SUPABASE_SERVICE_ROLE_KEY: saved.key })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  let calls = 0;
  let result: unknown = [{ id: "historical-article", status: "published", image_url: " /historic-image.webp " }];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(init?.method ?? "GET", "GET");
    assert.equal(url.origin, "https://editorial.test");
    assert.equal(url.pathname, "/rest/v1/editorial_articles");
    assert.equal(url.searchParams.get("id"), "eq.historical-article");
    assert.equal(url.searchParams.get("status"), "eq.published");
    assert.equal(url.searchParams.get("select"), "id,status,image_url");
    if (result instanceof Error) throw result;
    return Response.json(result);
  });

  const before = JSON.stringify(composition);
  assert.equal(await readPublicHierarchicalEditorialImage(composition), "/historic-image.webp");
  assert.equal(JSON.stringify(composition), before);
  assert.equal(calls, 1);

  for (const invalid of [null, { ...composition, status: "draft" as const },
    { ...composition, is_current: false }, { ...composition, presentation_mode: "standard" as const },
    { ...composition, hierarchical_editorial_source_type: "manual_link" },
    { ...composition, hierarchical_editorial_source_id: " " }]) {
    assert.equal(await readPublicHierarchicalEditorialImage(invalid), null);
  }
  assert.equal(calls, 1, "unlinked, inactive or draft compositions require no query");
  for (const unavailable of [[], [{ id: "other", status: "published", image_url: "/wrong.webp" }],
    [{ id: "historical-article", status: "draft", image_url: "/draft.webp" }],
    [{ id: "historical-article", status: "published", image_url: " " }], new Error("offline")]) {
    result = unavailable;
    assert.equal(await readPublicHierarchicalEditorialImage(composition), null);
  }
});

test("historical cover renders the editorial image without replacing its text or advertisement", () => {
  const editorial = { title: "Historical title", excerpt: "Original excerpt", text: "Original body", author: "Original author" };
  for (const imageUrl of ["/historic-image.webp", null]) {
    const $ = load(renderToStaticMarkup(<PublicHierarchicalComposition
      blockOrder={["opening"]} slots={[]} editorial={editorial}
      editorialHref="/historic/editorial" editorialImageUrl={imageUrl}
      editorialAfter={<a data-public-side-advertisement><img src="/standing-bottle.png" alt="Bottle" /></a>}
    />));
    assert.equal($(".composition-interpretive-editorial-image").attr("src"), imageUrl ?? undefined);
    assert.equal($(".composition-interpretive-editorial h3").text(), editorial.title);
    assert.equal($(".composition-interpretive-editorial-copy").text(), editorial.excerpt);
    assert.equal($(".composition-interpretive-editorial-signature").text(), editorial.author);
    assert.equal($(".composition-interpretive-editorial-ad-slot [data-public-side-advertisement]").length, 1);
  }
});
