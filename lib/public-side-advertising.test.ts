import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

const advertisement = source(
  "components/public/PublicSideAdvertisement.tsx",
);
const fourNews = source(
  "components/public/PublicFourNewsLatestLayout.tsx",
);
const article = source(
  "app/noticias/[slug]/page.tsx",
);

test("a mesma publicidade lateral é reutilizada na Jornada e nas notícias", () => {
  assert.match(advertisement, /Startup Madeira NOW/);
  assert.match(
    advertisement,
    /\/ads\/startup-madeira-now-sidebar\.png/,
  );
  assert.match(
    advertisement,
    /https:\/\/now\.startupmadeira\.eu\//,
  );

  assert.match(
    fourNews,
    /<PublicSideAdvertisement className="public-four-news-ad-slot" \/>/,
  );

  assert.match(
    fourNews,
    /data-public-ad-slot="four-news-latest"/,
  );

  assert.match(
    article,
    /<PublicSideAdvertisement className="news-article-ad news-article-ad-link" \/>/,
  );

  assert.doesNotMatch(
    article,
    /href="https:\/\/now\.startupmadeira\.eu\/"/,
  );

  assert.doesNotMatch(
    article,
    /src="\/ads\/startup-madeira-now-sidebar\.png"/,
  );
});