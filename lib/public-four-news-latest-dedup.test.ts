import assert from "node:assert/strict";
import test from "node:test";

import {
  excludeSelectedEditorialItemsFromLatest,
  publicEditorialLinkKey,
  resolvePublicFourNewsLatestLayoutItems,
} from "@/lib/public-four-news-latest-dedup";

test(
  "Selecao e removida apenas da apresentacao visivel de Ultimas e a cronologia seguinte sobe",
  () => {
    const latest = [
      { id: "1", title: "Um", linkUrl: "/noticias/um" },
      { id: "2", title: "Dois", linkUrl: "/noticias/dois" },
      { id: "3", title: "Tres", linkUrl: "/noticias/tres" },
      { id: "4", title: "Quatro", linkUrl: "/noticias/quatro" },
      { id: "5", title: "Cinco", linkUrl: "/noticias/cinco" },
    ];

    const selected = [
      {
        title: "Dois",
        linkUrl:
          "https://www.jornada.pt/noticias/dois/?utm_source=mesa#topo",
      },
      {
        title: "Quatro",
        linkUrl: "/noticias/quatro",
      },
    ];

    assert.deepEqual(
      excludeSelectedEditorialItemsFromLatest(
        latest,
        selected,
      ).map((item) => item.id),
      ["1", "3", "5"],
    );
  },
);

test(
  "titulo igual tambem elimina duplicacao visual quando snapshots de link divergem",
  () => {
    const latest = [
      {
        id: "a",
        title: "  A mesma   noticia ",
        linkUrl: "/noticias/slug-antigo",
      },
      {
        id: "b",
        title: "Outra",
        linkUrl: "/noticias/outra",
      },
    ];

    const selected = [
      {
        title: "A MESMA NOTICIA",
        linkUrl: "/noticias/slug-novo",
      },
    ];

    assert.deepEqual(
      excludeSelectedEditorialItemsFromLatest(
        latest,
        selected,
      ).map((item) => item.id),
      ["b"],
    );
  },
);

test(
  "links externos com o mesmo pathname nao colidem entre si",
  () => {
    assert.notEqual(
      publicEditorialLinkKey(
        "https://exemplo-a.pt/video/1",
      ),
      publicEditorialLinkKey(
        "https://exemplo-b.pt/video/1",
      ),
    );
  },
);

test(
  "deduplicacao total esvazia apenas Ultimas e preserva Selecao e publicidade",
  () => {
    const resolved = resolvePublicFourNewsLatestLayoutItems({
      items: [{
        id: "selected-a",
        title: "Noticia A",
        linkUrl: "/noticias/a",
      }],
      latestNews: [{
        id: "latest-a",
        title: "Noticia A",
        linkUrl: "/noticias/a",
      }],
    });

    assert.equal(resolved.visibleItems.length, 1);
    assert.equal(resolved.visibleLatestNews.length, 0);
  },
);
