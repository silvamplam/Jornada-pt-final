import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveActivePublicCompetition,
  resolvePublicCompetitionLogoPresentation,
  resolvePublicCompetitionLogoUrl
} from "./public-competition-navigation";

const componentUrl = new URL(
  "../components/public/PublicCompetitionNavigation.tsx",
  import.meta.url
);
const stylesUrl = new URL(
  "../components/public/PublicCompetitionNavigation.module.css",
  import.meta.url
);
const menuUrl = new URL("./public-competition-menu.ts", import.meta.url);

const sharedStylesUrl = new URL(
  "../components/public/publicEditorialStyles.ts",
  import.meta.url
);

const integrationUrls = [
  "../app/page.tsx",
  "../app/competicoes/[competitionSlug]/[seasonLabel]/page.tsx",
  "../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx",
  "../app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx",
  "../app/noticias/[slug]/page.tsx",
  "../components/public/PublicGamesPage.tsx"
].map((path) => new URL(path, import.meta.url));

const competitionFixtures = [
  {
    label: "Competição Norte",
    slug: "competicao-norte",
    href: "/competicoes/competicao-norte/epoca",
    logoUrl: " /emblemas/norte.svg "
  },
  {
    label: "Competição Sul",
    slug: "competicao-sul",
    href: "/competicoes/competicao-sul/epoca",
    logoUrl: "/emblemas/sul.svg"
  }
];

function cssRule(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

test("mantem uma unica navegacao sem Jogos, Jornadas ou separador", async () => {
  const [componentSource, stylesSource] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.equal(
    componentSource.match(/<nav\b/g)?.length,
    1,
    "o componente deve continuar a produzir uma única barra de navegação"
  );
  assert.match(componentSource, /aria-label="Competições"/);
  assert.match(componentSource, /<span>Classificação<\/span>/);
  assert.doesNotMatch(componentSource, /\bJogos\b/);
  assert.doesNotMatch(componentSource, /\bJornadas\b/);
  assert.doesNotMatch(componentSource, /gamesHref|activeArea|PublicCompetitionArea/);
  assert.doesNotMatch(componentSource, /separator|contextCluster|contextGroup|areaLink/);
  assert.doesNotMatch(stylesSource, /\.separator|\.contextCluster|\.contextGroup|\.areaLink/);
});

test("resolve dinamicamente a competicao ativa e troca o respetivo emblema", async () => {
  const [componentSource, menuSource, navigationSource] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(menuUrl, "utf8"),
    readFile(new URL("./public-competition-navigation.ts", import.meta.url), "utf8")
  ]);

  const north = resolveActivePublicCompetition(
    competitionFixtures,
    "competicao-norte"
  );
  const south = resolveActivePublicCompetition(
    competitionFixtures,
    "competicao-sul"
  );

  assert.equal(north?.label, "Competição Norte");
  assert.equal(resolvePublicCompetitionLogoUrl(north), "/emblemas/norte.svg");
  assert.equal(south?.label, "Competição Sul");
  assert.equal(resolvePublicCompetitionLogoUrl(south), "/emblemas/sul.svg");
  assert.notEqual(
    resolvePublicCompetitionLogoUrl(north),
    resolvePublicCompetitionLogoUrl(south)
  );
  assert.equal(
    resolveActivePublicCompetition(competitionFixtures, "inexistente"),
    null
  );

  assert.match(menuSource, /select=id,name,slug,logo_url,is_active/);
  assert.match(menuSource, /logoUrl:\s*competition\.logo_url/);
  assert.match(
    componentSource,
    /resolveActivePublicCompetition\(\s*competitions,\s*activeCompetitionSlug\s*\)/
  );
  assert.match(
    componentSource,
    /resolvePublicCompetitionLogoPresentation\(activeCompetition\)/
  );
  assert.match(componentSource, /src=\{activeCompetitionLogo\.logoUrl\}/);
  assert.match(
    componentSource,
    /data-variant=\{activeCompetitionLogo\.variant\}/
  );
  assert.doesNotMatch(
    componentSource,
    /liga-portugal|la-liga|premier-league|https?:\/\//
  );
  assert.match(
    navigationSource,
    /const OFFICIAL_COMPETITION_NAVIGATION_LOGOS/
  );


  const officialFixtures = [
    {
      ...competitionFixtures[0],
      slug: "liga-portugal",
      logoUrl: "https://database.example/logo.svg"
    },
    {
      ...competitionFixtures[0],
      slug: "la-liga",
      logoUrl: "https://database.example/logo.svg"
    },
    {
      ...competitionFixtures[0],
      slug: "premier-league",
      logoUrl: "https://database.example/logo.svg"
    }
  ];

  assert.deepEqual(
    officialFixtures.map(resolvePublicCompetitionLogoUrl),
    [
      "/brand/competitions/navigation/liga-portugal-betclic-horizontal.png",
      "/brand/competitions/navigation/laliga-horizontal.png",
      "/brand/competitions/navigation/premier-league-lockup.svg"
    ]
  );
  assert.deepEqual(
    officialFixtures.map(resolvePublicCompetitionLogoPresentation),
    [
      {
        logoUrl:
          "/brand/competitions/navigation/liga-portugal-betclic-horizontal.png",
        variant: "liga-portugal-horizontal",
        intrinsicWidth: 200,
        intrinsicHeight: 38
      },
      {
        logoUrl: "/brand/competitions/navigation/laliga-horizontal.png",
        variant: "laliga-horizontal",
        intrinsicWidth: 2881,
        intrinsicHeight: 688
      },
      {
        logoUrl:
          "/brand/competitions/navigation/premier-league-lockup.svg",
        variant: "premier-league-lockup",
        intrinsicWidth: 400,
        intrinsicHeight: 167
      }
    ]
  );

  const [ligaPortugalAsset, laligaAsset, premierLeagueAsset] =
    await Promise.all([
      readFile(
        new URL(
          "../public/brand/competitions/navigation/liga-portugal-betclic-horizontal.png",
          import.meta.url
        )
      ),
      readFile(
        new URL(
          "../public/brand/competitions/navigation/laliga-horizontal.png",
          import.meta.url
        )
      ),
      readFile(
        new URL(
          "../public/brand/competitions/navigation/premier-league-lockup.svg",
          import.meta.url
        )
      )
    ]);

  assert.equal(ligaPortugalAsset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(laligaAsset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.match(premierLeagueAsset.toString("utf8", 0, 200), /<svg\b/);
});

test("faz fallback para texto e esconde apenas imagens vazias ou com erro", async () => {
  const componentSource = await readFile(componentUrl, "utf8");
  const withoutLogo = {
    ...competitionFixtures[0],
    logoUrl: null
  };
  const blankLogo = {
    ...competitionFixtures[0],
    logoUrl: "   "
  };

  assert.equal(resolvePublicCompetitionLogoUrl(withoutLogo), null);
  assert.equal(resolvePublicCompetitionLogoUrl(blankLogo), null);
  assert.equal(resolvePublicCompetitionLogoUrl(null), null);
  assert.equal(resolvePublicCompetitionLogoPresentation(withoutLogo), null);
  assert.deepEqual(resolvePublicCompetitionLogoPresentation(competitionFixtures[0]), {
    logoUrl: "/emblemas/norte.svg",
    variant: "fallback",
    intrinsicWidth: 115,
    intrinsicHeight: 36
  });
  assert.match(
    componentSource,
    /\{activeCompetitionLogo \? \(\s*<img[\s\S]*?\) : null\}/
  );
  assert.match(componentSource, /onError=\{\(event\) => \{/);
  assert.match(componentSource, /event\.currentTarget\.hidden = true/);
  assert.doesNotMatch(componentSource, /onLoad|naturalWidth|naturalHeight/);
  assert.doesNotMatch(componentSource, /MIN_EMBLEM_SOURCE_LONG_EDGE/);
  assert.doesNotMatch(componentSource, /placeholder|fallback|default-logo/i);
});

test("mantem emblema e Classificacao na mesma ligacao acessivel", async () => {
  const componentSource = await readFile(componentUrl, "utf8");

  assert.match(
    componentSource,
    /<Link[\s\S]*?aria-label=\{`Classificação da \$\{activeCompetition\.label\}`\}[\s\S]*?className=\{`\$\{styles\.link\} \$\{styles\.classificationLink\}`\}[\s\S]*?href=\{classificationHref\}[\s\S]*?<img[\s\S]*?<span>Classificação<\/span>[\s\S]*?<\/Link>/
  );
  assert.match(componentSource, /alt=""/);
  assert.match(componentSource, /aria-hidden="true"/);
  assert.equal(
    componentSource.match(/href=\{classificationHref\}/g)?.length,
    1
  );
});


test("a jornada isola a identidade da competicao no topo e preserva a navegacao partilhada", async () => {
  const [matchdaySource, matchdayStyles] = await Promise.all([
    readFile(integrationUrls[2], "utf8"),
    readFile(new URL("./page.module.css", integrationUrls[2]), "utf8")
  ]);

  assert.doesNotMatch(matchdaySource, /showActiveCompetitionLogo=\{false\}/);
  assert.doesNotMatch(matchdaySource, /className="public-season-competition-emblem"/);
  assert.match(matchdaySource, /import styles from "\.\/page\.module\.css"/);
  assert.match(matchdaySource, /className=\{`public-top-stack \$\{styles\.topStack\}`\}/);
  assert.match(
    matchdaySource,
    /const competitionLogo = resolvePublicCompetitionLogoPresentation\(currentCompetitionMenuItem\)/
  );
  assert.match(
    matchdaySource,
    /<a className=\{styles\.competitionIdentity\} href=\{currentCompetitionMenuItem\.href\}>[\s\S]*?src=\{competitionLogo\.logoUrl\}[\s\S]*?<span>\{context\.competition\.name\}<\/span>/
  );
  assert.match(
    matchdayStyles,
    /\.topStack :global\(nav\[aria-label="Navegação pública"\] img\)\s*\{\s*display:\s*none;/
  );
  assert.match(
    matchdaySource,
    /<PublicCompetitionNavigation[\s\S]*?competitions=\{publicCompetitionMenu\}[\s\S]*?activeCompetitionSlug=\{context\.competition\.slug\}[\s\S]*?classificationHref="#classificacao"[\s\S]*?showMessageTicker=\{false\}/
  );
});

test("mantem liga e Classificacao ativas segundo o contrato visual atual", async () => {
  const [componentSource, stylesSource] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8")
  ]);

  assert.match(
    componentSource,
    /competition\.slug === activeCompetitionSlug \? "page" : undefined/
  );
  assert.match(
    componentSource,
    /aria-current=\{classificationHashIsActive \? "page" : undefined\}/
  );
  assert.match(
    stylesSource,
    /\.competitionLink\[aria-current="page"\],[\s\S]*?\.classificationLink\[aria-current="page"\]\s*\{[\s\S]*?border-bottom-color:\s*#b51220;[\s\S]*?color:\s*#b51220;/
  );
  assert.doesNotMatch(stylesSource, /#c40012/);
});

test("ativa Classificacao apenas quando o hash pertence a pagina atual", async () => {
  const componentSource = await readFile(componentUrl, "utf8");

  assert.match(componentSource, /target\.pathname === window\.location\.pathname/);
  assert.match(componentSource, /target\.search === window\.location\.search/);
  assert.match(componentSource, /target\.hash === "#classificacao"/);
  assert.match(componentSource, /window\.location\.hash === target\.hash/);
  assert.match(componentSource, /addEventListener\("hashchange"/);
});

test("mantem navegacao horizontal e as proporcoes atuais dos emblemas", async () => {
  const [stylesSource, sharedStylesSource] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(sharedStylesUrl, "utf8")
  ]);

  const navigationRule = cssRule(stylesSource, ".navigation");
  const classificationRule = cssRule(stylesSource, ".classificationLink");
  const emblemRule = cssRule(stylesSource, ".competitionEmblem");
  const ligaPortugalEmblemRule = cssRule(
    stylesSource,
    '.competitionEmblem[data-variant="liga-portugal-horizontal"]'
  );
  const laligaEmblemRule = cssRule(
    stylesSource,
    '.competitionEmblem[data-variant="laliga-horizontal"]'
  );
  const premierLeagueEmblemRule = cssRule(
    stylesSource,
    '.competitionEmblem[data-variant="premier-league-lockup"]'
  );

  assert.match(navigationRule, /display:\s*flex/);
  assert.match(navigationRule, /overflow-x:\s*auto/);
  assert.match(navigationRule, /overflow-y:\s*hidden/);
  assert.match(navigationRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(navigationRule, /flex-wrap:\s*wrap/);
  assert.match(classificationRule, /margin-left:\s*auto/);

  assert.match(emblemRule, /width:\s*auto/);
  assert.match(emblemRule, /height:\s*30px/);
  assert.match(emblemRule, /max-width:\s*100px/);
  assert.match(emblemRule, /flex-shrink:\s*0/);
  assert.match(emblemRule, /object-fit:\s*contain/);

  assert.match(ligaPortugalEmblemRule, /width:\s*88px/);
  assert.match(ligaPortugalEmblemRule, /height:\s*30px/);
  assert.match(ligaPortugalEmblemRule, /max-width:\s*88px/);
  assert.match(ligaPortugalEmblemRule, /padding:\s*5px 4px/);
  assert.match(ligaPortugalEmblemRule, /background:\s*#00235a/);

  assert.match(laligaEmblemRule, /width:\s*84px/);
  assert.match(laligaEmblemRule, /height:\s*auto/);
  assert.match(laligaEmblemRule, /max-width:\s*84px/);

  assert.match(premierLeagueEmblemRule, /height:\s*30px/);
  assert.match(premierLeagueEmblemRule, /max-width:\s*100px/);

  assert.match(
    stylesSource,
    /@media \(max-width: 760px\)[\s\S]*?\.competitionEmblem,[\s\S]*?premier-league-lockup[\s\S]*?height:\s*25px[\s\S]*?max-width:\s*84px[\s\S]*?liga-portugal-horizontal[\s\S]*?width:\s*76px[\s\S]*?height:\s*26px[\s\S]*?laliga-horizontal[\s\S]*?width:\s*72px/
  );

  assert.match(
    sharedStylesSource,
    /\.public-site-topbar\s*\{[\s\S]*?gap:\s*20px/
  );
  assert.match(
    sharedStylesSource,
    /\.public-site-menu,[\s\S]*?\.public-site-actions\s*\{[\s\S]*?gap:\s*16px/
  );
  assert.match(
    sharedStylesSource,
    /@media \(max-width: 1180px\)[\s\S]*?\.public-site-topbar\s*\{[\s\S]*?gap:\s*14px[\s\S]*?\.public-site-actions\s*\{[\s\S]*?gap:\s*10px/
  );
});

test("a Home remove o ticker e conserva a transicao minima antes do carrossel", async () => {
  const [homeSource, componentSource, sharedStylesSource] = await Promise.all([
    readFile(integrationUrls[0], "utf8"),
    readFile(componentUrl, "utf8"),
    readFile(sharedStylesUrl, "utf8")
  ]);

  assert.match(
    homeSource,
    /<PublicCompetitionNavigation competitions=\{competitionLinks\} showMessageTicker=\{false\} \/>/
  );
  assert.match(componentSource, /showMessageTicker = true/);
  assert.match(componentSource, /\{showMessageTicker \? \(/);
  assert.match(componentSource, /className=\{styles\.messageTicker\}/);

  const headerIndex = homeSource.indexOf("</header>");
  const transitionBarIndex = homeSource.indexOf(
    '<div aria-hidden="true" className="public-home-games-transition-bar" />'
  );
  const matchStripIndex = homeSource.indexOf("<PublicMatchStrip", transitionBarIndex);
  const editorialIndex = homeSource.indexOf("<PublicEditorialLayout");

  assert.ok(headerIndex >= 0);
  assert.ok(headerIndex < transitionBarIndex);
  assert.ok(transitionBarIndex < matchStripIndex);
  assert.ok(matchStripIndex < editorialIndex);

  const transitionBarRule = cssRule(
    sharedStylesSource,
    ".public-home-games-transition-bar"
  );

  assert.match(transitionBarRule, /height:\s*2px/);
  assert.match(transitionBarRule, /max-width:\s*none/);
  assert.match(
    transitionBarRule,
    /margin:\s*-1px calc\(-1 \* var\(--public-top-gutter\)\) 0/
  );
  assert.match(transitionBarRule, /background:\s*#25292d/);
  assert.doesNotMatch(
    sharedStylesSource,
    /\.public-home-games-transition-bar::(?:before|after)/
  );
});

test("noticias contextuais reutilizam o mesmo contrato central de navegacao", async () => {
  const [matchdaySource, newsSource, sharedStylesSource] = await Promise.all([
    readFile(integrationUrls[2], "utf8"),
    readFile(integrationUrls[4], "utf8"),
    readFile(sharedStylesUrl, "utf8")
  ]);

  for (const source of [matchdaySource, newsSource]) {
    assert.match(
      source,
      /import \{ publicTopNavigationStyles \} from "@\/components\/public\/publicEditorialStyles"/
    );
    assert.match(source, /\$\{publicTopNavigationStyles\}/);
    assert.match(
      source,
      /style=\{\{ "--public-season-accent": competitionBarColor \} as CSSProperties\}/
    );
    assert.match(
      source,
      /<nav className="public-matchday-nav-compact"/
    );
    assert.doesNotMatch(source, /PublicMatchdayNavigation/);
  }

  assert.match(
    sharedStylesSource,
    /\.public-season-nav-bar\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?color:\s*#202428;/
  );
  assert.match(
    sharedStylesSource,
    /\.public-matchday-leg-nav a\[aria-current="true"\],[\s\S]*?\.public-matchday-nav-compact a\[aria-current="page"\]\s*\{[\s\S]*?border-bottom-color:\s*var\(--public-season-accent, #b51220\)/
  );

  assert.match(
    newsSource,
    /<PublicCompetitionNavigation[\s\S]*?classificationHref=\{classificationHref\}[\s\S]*?showMessageTicker=\{false\}/
  );
  assert.match(
    newsSource,
    /<section className="public-league-match-strip-scroll"[\s\S]*?<PublicMatchStrip[\s\S]*?carouselLayout="fluid-peek"[\s\S]*?variant="clean"/
  );
  assert.doesNotMatch(
    newsSource,
    /<PublicMatchStrip[\s\S]*?competitionSlug=\{articleContext\?\.competition\.slug\}/
  );
});

test("integracoes preservam a competicao ativa no link de Classificacao", async () => {
  const [
    homeSource,
    seasonSource,
    matchdaySource,
    matchdayGamesSource,
    newsSource,
    publicGamesSource
  ] = await Promise.all(integrationUrls.map((url) => readFile(url, "utf8")));

  for (const source of [
    homeSource,
    seasonSource,
    matchdaySource,
    matchdayGamesSource,
    newsSource,
    publicGamesSource
  ]) {
    assert.match(source, /import PublicCompetitionNavigation/);
    assert.match(source, /<PublicCompetitionNavigation/);
    assert.doesNotMatch(source, /<nav className="public-site-menu"/);
    assert.doesNotMatch(source, /gamesHref=|activeArea=/);
  }

  assert.match(
    matchdaySource,
    /activeCompetitionSlug=\{context\.competition\.slug\}[\s\S]*classificationHref="#classificacao"/
  );
  assert.match(
    matchdayGamesSource,
    /const classificationHref = `\$\{currentMatchdayHref\}#classificacao`/
  );
  assert.match(
    matchdayGamesSource,
    /activeCompetitionSlug=\{context\.competition\.slug\}[\s\S]*classificationHref=\{classificationHref\}/
  );
  assert.match(
    newsSource,
    /activeCompetitionSlug=\{articleContext\?\.competition\.slug\}[\s\S]*classificationHref=\{classificationHref\}/
  );
  assert.match(
    publicGamesSource,
    /activeCompetitionSlug && seasonLabel && matchdayNumber[\s\S]*activeCompetitionSlug=\{competition\?\.slug\}[\s\S]*classificationHref=\{classificacaoHref\}/
  );

  for (const contextualSource of [
    seasonSource,
    matchdaySource,
    matchdayGamesSource,
    newsSource
  ]) {
    assert.match(contextualSource, /logoUrl:\s*[\s\S]*?\.logo_url/);
  }
});
