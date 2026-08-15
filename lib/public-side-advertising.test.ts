import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(path: string) {
  return readFileSync(
    fileURLToPath(new URL(`../${path}`, import.meta.url)),
    "utf8",
  );
}

const model = source("lib/site-advertising.ts");
const ad = source("components/public/PublicSideAdvertisement.tsx");
const layout = source("components/public/PublicFourNewsLatestLayout.tsx");
const article = source("app/noticias/[slug]/page.tsx");
const admin = source("app/admin/publicidade/page.tsx");
const upload = source("app/admin/publicidade/AdvertisingImageUpload.tsx");
const api = source("app/api/admin/publicidade/route.ts");
const root = source("app/admin/page.tsx");
const migration = source(
  "supabase/steps/120-publicidade-lateral-unificada-apply.sql",
);

test("a publicidade pública usa uma única configuração", () => {
  assert.match(model, /lateral_primary/);
  assert.match(model, /DEFAULT_PUBLIC_SIDE_ADVERTISEMENT/);
  assert.match(model, /Startup Madeira NOW/);
  assert.match(model, /readPrimarySideAdvertisement/);

  assert.match(ad, /readPrimarySideAdvertisement/);
  assert.match(ad, /isDisplayableSideAdvertisement/);

  assert.match(
    layout,
    /<PublicSideAdvertisement className="public-four-news-ad-slot" \/>/,
  );

  assert.match(
    article,
    /<PublicSideAdvertisement className="news-article-ad news-article-ad-link" \/>/,
  );

  assert.doesNotMatch(
    article,
    /href="https:\/\/now\.startupmadeira\.eu\/"/,
  );
});

test("a publicidade inativa não deixa a coluna publicitária vazia", () => {
  assert.match(
    layout,
    /\.public-four-news-ad-column:empty/,
  );
  assert.match(
    layout,
    /:not\(:has\(\.public-four-news-ad-slot\)\)/,
  );
});

test("o backoffice gere campanha, imagem, destino e estado", () => {
  assert.match(admin, /action="\/api\/admin\/publicidade"/);
  assert.match(admin, /name="target_url"/);
  assert.match(admin, /name="alt_text"/);
  assert.match(admin, /name="is_active"/);

  assert.match(
    upload,
    /\/api\/admin\/editorial\/conteudos\/upload-image\/sign/,
  );

  assert.match(upload, /name="image_url"/);
  assert.match(api, /site_advertising_slots\?on_conflict=slot_key/);
  assert.match(root, /href="\/admin\/publicidade">PUBLICIDADE/);
});

test("a migração é idempotente e preserva a campanha atual", () => {
  assert.match(
    migration,
    /create table if not exists public\.site_advertising_slots/,
  );
  assert.match(migration, /slot_key text primary key/);
  assert.match(migration, /'lateral_primary'/);
  assert.match(migration, /'Startup Madeira NOW'/);
  assert.match(
    migration,
    /on conflict \(slot_key\) do nothing/,
  );
});