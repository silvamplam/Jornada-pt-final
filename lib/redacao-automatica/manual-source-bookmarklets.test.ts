import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import {
  JORNADA_MANUAL_IMAGE_MESSAGE,
  JORNADA_MANUAL_SOURCE_MESSAGE,
  SEND_IMAGE_TO_JORNADA_BOOKMARKLET,
  SEND_TO_JORNADA_BOOKMARKLET,
} from "@/lib/redacao-automatica/manual-source-bookmarklets";

type HarnessOptions = Readonly<{
  selection?: string;
  contentType?: string;
  images?: Array<Record<string, unknown>>;
  bodyText?: string;
  baseUri?: string;
  locationHref?: string;
  querySelector?: (selector: string) => unknown;
  querySelectorAll?: (selector: string) => unknown[];
  mesaOrigin?: "https://www.jornada.pt" | "https://jornada.pt";
}>;

function harness(options: HarnessOptions = {}) {
  const payloads: unknown[] = [];
  const alerts: string[] = [];
  const openedNames: string[] = [];
  const windowListeners = new Map<string, Set<(event: unknown) => void>>();
  const documentListeners = new Map<string, Set<(event: unknown) => void>>();
  const removedDocumentListeners: string[] = [];
  const appended: Array<Record<string, unknown>> = [];
  const targetOrigins: string[] = [];
  const mesaOrigin = options.mesaOrigin ?? "https://www.jornada.pt";
  const target = {
    closed: false,
    location: { href: "about:blank" },
    focus() {},
    postMessage(message: Record<string, unknown>, targetOrigin: string) {
      targetOrigins.push(targetOrigin);
      if (
        message.type === "JORNADA_MANUAL_SOURCE_HELLO_V1"
        && targetOrigin === mesaOrigin
      ) {
        queueMicrotask(() => {
          for (const listener of windowListeners.get("message") ?? []) {
            listener({
              origin: mesaOrigin,
              source: target,
              data: { type: "JORNADA_MANUAL_SOURCE_READY_V1", version: 1 },
            });
          }
        });
      } else if (message.type !== "JORNADA_MANUAL_SOURCE_HELLO_V1") {
        payloads.push(message);
      }
    },
  };
  const body = {
    innerText: options.bodyText ?? "",
    appendChild(value: Record<string, unknown>) { appended.push(value); },
  };
  const document = {
    baseURI: options.baseUri ?? "https://example.test/noticia/pagina",
    title: "Título da página",
    contentType: options.contentType ?? "text/html",
    images: options.images ?? [],
    body,
    documentElement: body,
    querySelector: options.querySelector ?? (() => null),
    querySelectorAll: options.querySelectorAll ?? (() => []),
    createElement() {
      return {
        textContent: "",
        style: { cssText: "" },
        setAttribute() {},
        remove() { this.removed = true; },
        removed: false,
      };
    },
    addEventListener(type: string, listener: (event: unknown) => void) {
      const listeners = documentListeners.get(type) ?? new Set();
      listeners.add(listener);
      documentListeners.set(type, listeners);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      documentListeners.get(type)?.delete(listener);
      removedDocumentListeners.push(type);
    },
  };
  const window = {
    getSelection: () => ({ toString: () => options.selection ?? "" }),
    open(_url: string, name: string) {
      openedNames.push(name);
      return target;
    },
    alert(value: string) { alerts.push(value); },
    addEventListener(type: string, listener: (event: unknown) => void) {
      const listeners = windowListeners.get(type) ?? new Set();
      listeners.add(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      windowListeners.get(type)?.delete(listener);
    },
    setInterval,
    clearInterval,
  };
  const location = {
    href: options.locationHref ?? "https://example.test/noticia/pagina",
    hostname: "example.test",
  };
  return {
    context: { window, document, location, URL, Date, JSON, console, queueMicrotask },
    payloads,
    alerts,
    openedNames,
    documentListeners,
    removedDocumentListeners,
    appended,
    targetOrigins,
    target,
  };
}

async function execute(bookmarklet: string, setup: ReturnType<typeof harness>) {
  vm.runInNewContext(bookmarklet.replace(/^javascript:/, ""), setup.context);
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function image(currentSrc: string, src: string) {
  const value = {
    currentSrc,
    src,
    width: 800,
    height: 450,
    naturalWidth: 800,
    naturalHeight: 450,
    style: { outline: "", outlineOffset: "" },
    getAttribute(name: string) { return name === "src" ? src : null; },
    closest(selector: string) { return selector === "img" ? value : null; },
  };
  return value;
}

test("favorito principal dá prioridade à seleção, encontra og:image e datePublished", async () => {
  const meta = { getAttribute: () => "/media/principal.jpg" };
  const jsonLd = { textContent: JSON.stringify({ datePublished: "2026-09-19T18:45:00+01:00" }) };
  const setup = harness({
    selection: "  Primeiro parágrafo selecionado.\n\nSegundo parágrafo.  ",
    querySelector(selector) {
      if (selector.includes("og:image")) return meta;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes("application/ld+json")) return [jsonLd];
      if (selector.includes("articleBody")) throw new Error("DOM article extraction must not run when text is selected");
      return [];
    },
  });
  await execute(SEND_TO_JORNADA_BOOKMARKLET, setup);
  assert.equal(setup.payloads.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(setup.payloads[0])), {
    type: JORNADA_MANUAL_SOURCE_MESSAGE,
    version: 1,
    body: "Primeiro parágrafo selecionado.\n\nSegundo parágrafo.",
    imageUrl: "https://example.test/media/principal.jpg",
    publishedDate: "2026-09-19",
    sourceUrl: "https://example.test/noticia/pagina",
    sourcePageTitle: "Título da página",
    sourceHost: "example.test",
  });
  assert.equal(setup.openedNames[0], "JORNADA_MANUAL_SOURCE");
});

test("handshake aceita a origem canónica www e o apex sem perder o payload", async () => {
  for (const mesaOrigin of ["https://www.jornada.pt", "https://jornada.pt"] as const) {
    const chosen = image(
      "https://encrypted-tbn0.gstatic.com/images?q=teste",
      "https://encrypted-tbn0.gstatic.com/images?q=teste",
    );
    const setup = harness({
      mesaOrigin,
      contentType: "image/jpeg",
      images: [chosen],
      locationHref: chosen.currentSrc,
    });
    await execute(SEND_IMAGE_TO_JORNADA_BOOKMARKLET, setup);
    assert.equal((setup.payloads[0] as Record<string, unknown>).imageUrl, chosen.currentSrc);
    assert.ok(setup.targetOrigins.includes("https://www.jornada.pt"));
    assert.ok(setup.targetOrigins.includes("https://jornada.pt"));
    assert.equal(setup.target.location.href, "https://www.jornada.pt/admin/editorial/redacao-automatica/mesa?manual_source=1");
  }
});

test("imagem direta usa currentSrc antes de src e resolve URL relativa", async () => {
  const chosen = image("/responsive/current.webp", "/fallback/src.jpg");
  const setup = harness({ contentType: "image/webp", images: [chosen] });
  await execute(SEND_IMAGE_TO_JORNADA_BOOKMARKLET, setup);
  assert.deepEqual(JSON.parse(JSON.stringify(setup.payloads[0])), {
    type: JORNADA_MANUAL_IMAGE_MESSAGE,
    version: 1,
    imageUrl: "https://example.test/responsive/current.webp",
  });
  assert.equal(Object.keys(setup.payloads[0] as object).length, 3);
  assert.equal(setup.openedNames[0], "JORNADA_MANUAL_SOURCE");
});

test("documento de imagem sem elemento usa location.href", async () => {
  const setup = harness({
    contentType: "image/jpeg",
    images: [],
    locationHref: "https://cdn.example.test/foto.jpg",
  });
  await execute(SEND_IMAGE_TO_JORNADA_BOOKMARKLET, setup);
  assert.equal((setup.payloads[0] as Record<string, unknown>).imageUrl, "https://cdn.example.test/foto.jpg");
});

test("favorito de imagem rejeita esquemas não-http e credentials", async () => {
  for (const invalid of [
    "data:image/png;base64,abc",
    "blob:https://example.test/id",
    "javascript:alert(1)",
    "https://user:pass@example.test/image.jpg",
    "",
  ]) {
    const setup = harness({
      contentType: "image/png",
      images: [image(invalid, invalid)],
      locationHref: invalid,
    });
    await execute(SEND_IMAGE_TO_JORNADA_BOOKMARKLET, setup);
    assert.equal(setup.payloads.length, 0, invalid);
    assert.equal(setup.openedNames.length, 0, invalid);
    assert.equal(setup.alerts.length, 1, invalid);
  }
});

test("página normal entra em escolha, clique captura só a imagem e remove listeners", async () => {
  const first = image("", "/uma.jpg");
  const chosen = image("/escolhida.webp", "/fallback.jpg");
  const setup = harness({ images: [first, chosen], bodyText: "Página com várias imagens" });
  vm.runInNewContext(SEND_IMAGE_TO_JORNADA_BOOKMARKLET.replace(/^javascript:/, ""), setup.context);
  assert.equal(setup.openedNames.length, 0);
  assert.equal(setup.appended.length, 1);
  assert.equal(setup.documentListeners.get("click")?.size, 1);

  const click = {
    target: chosen,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  for (const listener of setup.documentListeners.get("click") ?? []) listener(click);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(click.prevented, true);
  assert.equal(click.stopped, true);
  assert.equal((setup.payloads[0] as Record<string, unknown>).imageUrl, "https://example.test/escolhida.webp");
  for (const type of ["mouseover", "mouseout", "click", "keydown"]) {
    assert.equal(setup.documentListeners.get(type)?.size, 0, type);
    assert.ok(setup.removedDocumentListeners.includes(type), type);
  }
});

test("ESC cancela escolha e remove todos os listeners sem enviar", () => {
  const setup = harness({
    images: [image("/one.jpg", "/one.jpg"), image("/two.jpg", "/two.jpg")],
    bodyText: "Página normal",
  });
  vm.runInNewContext(SEND_IMAGE_TO_JORNADA_BOOKMARKLET.replace(/^javascript:/, ""), setup.context);
  const keydown = { key: "Escape", preventDefault() {} };
  for (const listener of setup.documentListeners.get("keydown") ?? []) listener(keydown);
  assert.equal(setup.payloads.length, 0);
  assert.equal(setup.openedNames.length, 0);
  for (const type of ["mouseover", "mouseout", "click", "keydown"]) {
    assert.equal(setup.documentListeners.get(type)?.size, 0, type);
  }
});

test("receiver da Mesa altera apenas imageUrl e nunca faz save automático", () => {
  const client = readFileSync(path.join(
    process.cwd(),
    "app/admin/editorial/redacao-automatica/mesa/_manual-source-entry.tsx",
  ), "utf8");
  const imageBranch = client.slice(
    client.indexOf("if (payload.type === JORNADA_MANUAL_IMAGE_MESSAGE)"),
    client.indexOf("if (payload.type !== JORNADA_MANUAL_SOURCE_MESSAGE)"),
  );
  assert.match(imageBranch, /setImageUrl\(nextImage\)/);
  assert.doesNotMatch(imageBranch, /setBody|setPublishedDate|setSourceUrl|handleSubmit|fetch\(/);
  assert.match(client, /acceptedSourcesRef\.current\.has\(event\.source\)/);
  assert.match(client, /ready\(event\.source, event\.origin\)/);
  assert.doesNotMatch(client, /postMessage\([\s\S]{0,160},\s*["']\*["']\)/);
  assert.doesNotMatch(client, /window\.opener/);
  assert.doesNotMatch(SEND_TO_JORNADA_BOOKMARKLET + SEND_IMAGE_TO_JORNADA_BOOKMARKLET, /fetch\(|\.submit\(|service_role|admin[_-]?token|secret/i);
  assert.doesNotMatch(SEND_TO_JORNADA_BOOKMARKLET, /manual_source=1[^"']*(?:body|imageUrl|publishedDate)=/);
  assert.match(SEND_TO_JORNADA_BOOKMARKLET, /JORNADA_MANUAL_SOURCE/);
  assert.match(SEND_IMAGE_TO_JORNADA_BOOKMARKLET, /JORNADA_MANUAL_IMAGE_V1/);
});

test("painel mantém os três campos e a rota de escrita continua administrativa", () => {
  const page = readFileSync(path.join(process.cwd(), "app/admin/editorial/redacao-automatica/mesa/page.tsx"), "utf8");
  const client = readFileSync(path.join(process.cwd(), "app/admin/editorial/redacao-automatica/mesa/_manual-source-entry.tsx"), "utf8");
  const middleware = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");
  const control = page.slice(page.indexOf("controlStrip"), page.indexOf("<MesaSelectionTray"));
  assert.ok(control.indexOf("Atualizar</button>") < control.indexOf("<ManualSourceEntry"));
  assert.match(client, />Corpo</);
  assert.match(client, />Imagem</);
  assert.match(client, /Data da notícia/);
  assert.match(client, /Guardar em NOVAS/);
  assert.match(client, /Enviar para Jornada/);
  assert.match(client, /Enviar imagem para Jornada/);
  assert.doesNotMatch(client, /dangerouslySetInnerHTML/);
  assert.match(client, /\/api\/admin\/editorial\/redacao-automatica\/mesa\/manual-source/);
  assert.match(middleware, /pathname\.startsWith\("\/api\/admin"\)/);
});
