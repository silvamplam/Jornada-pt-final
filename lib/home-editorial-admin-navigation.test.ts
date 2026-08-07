import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("os redirects do backoffice da Home usam Location relativo", () => {
  const route = readFileSync("app/api/admin/editorial/home/route.ts", "utf8");
  const imageRoute = readFileSync("app/api/admin/editorial/home/image/route.ts", "utf8");

  assert.doesNotMatch(route, /new URL\("\/admin\/editorial\/home", request\.url\)/);
  assert.doesNotMatch(route, /NextResponse\.redirect\(/);
  assert.match(route, /const location = `\/admin\/editorial\/home/);
  assert.match(route, /Location: location/);

  assert.doesNotMatch(imageRoute, /new URL\("\/admin\/editorial\/home", request\.url\)/);
  assert.doesNotMatch(imageRoute, /NextResponse\.redirect\(/);
  assert.match(imageRoute, /const location = `\$\{target\.pathname\}\$\{target\.search\}\$\{target\.hash\}`;/);
  assert.match(imageRoute, /Location: location/);
});

test("o seletor de fontes nao modifica o HTML antes da hidratacao", () => {
  const editor = readFileSync("components/admin/EditorialHorizontalNewsEditor.tsx", "utf8");
  const sourceSelect = readFileSync("components/admin/EditorialHorizontalNewsSourceSelect.tsx", "utf8");

  assert.match(editor, /EditorialHorizontalNewsSourceSelect/);
  assert.match(editor, /<EditorialHorizontalNewsSourceSelect sources=\{sources\} \/>/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(editor, /horizontalNewsBound/);
  assert.doesNotMatch(editor, /data-horizontal-news-bound/);

  assert.match(sourceSelect, /^"use client";/);
  assert.match(sourceSelect, /onChange=\{handleSourceChange\}/);
  assert.match(sourceSelect, /select\.closest<HTMLElement>\("\[data-horizontal-news-card\]"\)/);
});
