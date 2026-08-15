import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

test("o gestor de publicidade é integralmente server-side", () => {
  assert.doesNotMatch(admin, /AdvertisingImageUpload/);
  assert.doesNotMatch(admin, /"use client"/);
  assert.match(admin, /encType="multipart\/form-data"/);
  assert.match(admin, /name="image_file"/);
  assert.match(admin, /name="image_url"/);
  assert.match(admin, /name="target_url"/);
  assert.match(admin, /name="alt_text"/);
  assert.match(admin, /name="is_active"/);

  assert.equal(
    existsSync(
      fileURLToPath(
        new URL(
          "../app/admin/publicidade/AdvertisingImageUpload.tsx",
          import.meta.url,
        ),
      ),
    ),
    false,
  );
});

test("o upload da campanha é processado no servidor", () => {
  assert.match(api, /uploadAdvertisingImage/);
  assert.match(api, /form\.get\("image_file"\)/);
  assert.match(api, /storage\/v1\/object/);
  assert.match(api, /editorial-images/);
  assert.match(
    api,
    /site_advertising_slots\?on_conflict=slot_key/,
  );

  assert.match(
    root,
    /href="\/admin\/publicidade">PUBLICIDADE/,
  );
});

test("a migração é idempotente e preserva a campanha inicial", () => {
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