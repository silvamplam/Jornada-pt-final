import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(
      new URL(
        `../${relativePath}`,
        import.meta.url
      )
    ),
    "utf8"
  );
}

const renderer = source(
  "components/public/PublicHierarchicalComposition.tsx"
);

const matchdayPage = source(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx"
);

const fullPage = source(
  "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/editorial/page.tsx"
);

test(
  "capa mantém excerto e recebe publicidade fora do Editorial",
  () => {
    assert.match(
      renderer,
      /editorial\?\.excerpt/
    );

    assert.match(
      renderer,
      /editorialAfter\?: ReactNode/
    );

    assert.match(
      renderer,
      /composition-interpretive-editorial-ad-slot/
    );

    assert.match(
      matchdayPage,
      /<PublicSideAdvertisement \/>/
    );

    assert.match(
      matchdayPage,
      /editorialAfter=\{<PublicSideAdvertisement \/>\}/
    );
  }
);

test(
  "pagina própria reutiliza moldura publica da Jornada",
  () => {
    assert.match(
      fullPage,
      /PublicCompetitionNavigation/
    );

    assert.match(
      fullPage,
      /PublicMatchStrip/
    );

    assert.match(
      fullPage,
      /PublicSideAdvertisement/
    );

    assert.match(
      fullPage,
      /buildPublicMatchdayLegNavigation/
    );

    assert.match(
      fullPage,
      /getPublicCompetitionMenu/
    );

    assert.match(
      fullPage,
      /public-season-nav-bar/
    );

    assert.match(
      fullPage,
      /public-league-match-strip-scroll/
    );

    assert.match(
      fullPage,
      /news-article-layout/
    );

    assert.match(
      fullPage,
      /news-article-sidebar/
    );
  }
);

test(
  "pagina própria continua fora do circuito de artigos normais",
  () => {
    assert.match(
      fullPage,
      /hierarchicalCompositionEditorialParagraphs/
    );

    assert.match(
      fullPage,
      /presentation_mode !==\s*"hierarchical"/
    );

    assert.doesNotMatch(
      fullPage,
      /editorial_articles/
    );
  }
);
