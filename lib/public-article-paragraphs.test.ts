import assert from "node:assert/strict";
import test from "node:test";

import { publicArticleParagraphs } from "./public-article-paragraphs";

test("preserva parágrafos separados por CRLF", () => {
  const body =
    "Primeiro parágrafo.\r\n\r\n" +
    "Segundo parágrafo.\r\n\r\n" +
    "Terceiro parágrafo.";

  assert.deepEqual(
    publicArticleParagraphs(body),
    [
      "Primeiro parágrafo.",
      "Segundo parágrafo.",
      "Terceiro parágrafo.",
    ],
  );
});

test("preserva parágrafos separados por LF", () => {
  const body =
    "Primeiro parágrafo.\n\n" +
    "Segundo parágrafo.";

  assert.deepEqual(
    publicArticleParagraphs(body),
    [
      "Primeiro parágrafo.",
      "Segundo parágrafo.",
    ],
  );
});

test("aceita espaços numa linha vazia sem alterar o texto", () => {
  const body =
    "Primeiro parágrafo.\r\n   \r\n" +
    "Segundo parágrafo.";

  assert.deepEqual(
    publicArticleParagraphs(body),
    [
      "Primeiro parágrafo.",
      "Segundo parágrafo.",
    ],
  );
});

test("não inventa parágrafos quando o corpo não os contém", () => {
  const body =
    "Uma frase. Outra frase. Terceira frase.";

  assert.deepEqual(
    publicArticleParagraphs(body),
    ["Uma frase. Outra frase. Terceira frase."],
  );
});

test("corpo vazio não produz parágrafos", () => {
  assert.deepEqual(publicArticleParagraphs(null), []);
  assert.deepEqual(publicArticleParagraphs(""), []);
});
