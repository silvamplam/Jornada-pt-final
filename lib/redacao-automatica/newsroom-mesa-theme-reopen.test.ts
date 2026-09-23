import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { MesaThemeCard } from "./newsroom-mesa-organization-internal";

const themeId = "10000000-0000-4000-8000-000000000001";
const routePath = "app/api/admin/editorial/redacao-automatica/mesa/organizacao/route.ts";
const panelPath = "app/admin/editorial/redacao-automatica/mesa/_mesa-organization-client.tsx";
const organizationRoute = "/api/admin/editorial/redacao-automatica/mesa/organizacao";
const theme: MesaThemeCard = {
  id: themeId, title: "Tema arquivado", classificationKey: "sporting", status: "archived",
  sourceCount: 2, articleCount: 1, updatedSourceCount: 0, productionReady: true,
  sourceRefs: [{ newsroomArticleId: "20000000-0000-4000-8000-000000000002",
    newsroomSnapshotId: "30000000-0000-4000-8000-000000000003" }],
  dossiers: [{ id: "40000000-0000-4000-8000-000000000004", kind: "dossier", title: "Publicado",
    status: "published", sourceCount: 2, articleCount: 1, updatedSourceCount: 0,
    themeId, themeIds: [themeId], articleIds: ["50000000-0000-4000-8000-000000000005"] }],
};
const openedTheme: MesaThemeCard = { ...theme, status: "open" };
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Execute the real modules with all external boundaries stubbed: no server, credentials or database.
function loadModule(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: path,
  }).outputText;
  runInNewContext(output, { exports, Error, ...globals, require: (name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } }, { filename: path });
  return exports;
}

function routeHarness(failure?: Error) {
  const commands: { name: string; args: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  let status: MesaThemeCard["status"] = "archived";
  const route = loadModule(routePath, {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/editorial-classifications": { isArticleClassificationKey: () => true },
    "@/lib/redacao-automatica/newsroom-mesa-editorial-groups": { isMesaMaterialRef: () => false },
    "@/lib/redacao-automatica/newsroom-mesa-organization": {
      isMesaUuid: (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value),
      mesaOrganizationCommand: async (name: string, args: Record<string, unknown>) => {
        commands.push({ name, args: plain(args) });
        if (failure) throw failure;
        status = args.p_status as MesaThemeCard["status"];
        return [];
      },
      readMesaThemeSummary: async (id: string) => { reads.push(`summary:${id}`); return { ...theme, status }; },
      readMesaThemeCurrentSourceRefs: async (id: string) => { reads.push(`sources:${id}`); return theme.sourceRefs; },
    },
  });
  const POST = route.POST as (request: Request) => Promise<Response>;
  return { commands, reads, post: (body: unknown) => POST(new Request(`http://localhost${organizationRoute}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })) };
}

test("reabrir reutiliza o comando de status e envia só ID/status; resumo conserva fontes, artigos e memberships", async () => {
  const harness = routeHarness();
  const response = await harness.post({ action: "set_theme_status", themeId, status: "open" });
  assert.equal(response.status, 200);
  assert.deepEqual(harness.commands, [{ name: "newsroom_set_editorial_theme_status_v1",
    args: { p_theme_id: themeId, p_status: "open" } }]);
  assert.deepEqual(harness.reads.sort(), [`sources:${themeId}`, `summary:${themeId}`].sort());
  assert.deepEqual(await response.json(), { ok: true, theme: openedTheme });
});

test("archive_theme continua compatível sem status; set_theme_status também aceita archived", async () => {
  for (const body of [{ action: "archive_theme", themeId },
    { action: "archive_theme", themeId, status: "open" },
    { action: "set_theme_status", themeId, status: "archived" }]) {
    const harness = routeHarness();
    const response = await harness.post(body);
    assert.equal(response.status, 200);
    assert.deepEqual(harness.commands, [{ name: "newsroom_set_editorial_theme_status_v1",
      args: { p_theme_id: themeId, p_status: "archived" } }]);
    assert.deepEqual(await response.json(), { ok: true, theme });
  }
});

test("status inválido ou ID inválido são rejeitados antes de qualquer comando/leitura", async () => {
  for (const body of [
    ...[undefined, null, "", "closed", "OPEN", {}, []].map((status) => ({ action: "set_theme_status", themeId, status })),
    { action: "set_theme_status", themeId: "inválido", status: "open" },
  ]) {
    const harness = routeHarness();
    assert.equal((await harness.post(body)).status, 400);
    assert.deepEqual(harness.commands, []);
    assert.deepEqual(harness.reads, []);
  }
});

test("erro do comando não devolve um falso sucesso nem tenta ler um Tema reaberto", async () => {
  const harness = routeHarness(new Error("database-unavailable"));
  const response = await harness.post({ action: "set_theme_status", themeId, status: "open" });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.ok(body.message);
  assert.deepEqual(harness.reads, []);
});

type Element = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children), ...nodes(element.props.items)];
}
function label(value: unknown): string {
  if (Array.isArray(value)) return value.map(label).join("");
  if (value && typeof value === "object" && "props" in value) return label((value as Element).props.children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
type FetchResult = { ok: boolean; json: () => Promise<unknown> };
const result = (card: MesaThemeCard): FetchResult => ({ ok: true, json: async () => ({ ok: true, theme: card }) });
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

function panelHarness(initialTheme: MesaThemeCard = theme, fixtureMode = false) {
  const state: unknown[] = [];
  let hook = 0;
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const pending: { resolve: (value: FetchResult) => void; reject: (error: Error) => void }[] = [];
  const removed: string[] = [];
  const updates: MesaThemeCard[] = [];
  const ThemeToggle = () => null;
  const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
  const panel = loadModule(panelPath, {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react": {
      useState: (initial: unknown) => {
        const index = hook++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value: unknown) => {
          state[index] = typeof value === "function" ? value(state[index]) : value;
        }];
      },
      // This harness exercises the panel's render and event handlers, not browser effects/scroll.
      useEffect: () => {}, useRef: (current: unknown) => ({ current }),
    },
    "next/link": { __esModule: true, default: "a" },
    "./mesa.module.css": { __esModule: true, default: {} },
    "./_mesa-selection-state": { MESA_MAX_NEWSROOM_SOURCES: 20 },
    "./_mesa-selection-client": { MesaThemeSelectionToggle: ThemeToggle,
      useMesaSelection: () => ({ removeTheme: (id: string) => removed.push(id),
        selectTheme: () => assert.fail("Reabrir não pode selecionar automaticamente") }) },
    "./_mesa-client-events": { MESA_THEME_UPDATED_EVENT: "theme-updated",
      publishMesaThemeUpdate: (card: MesaThemeCard) => updates.push(plain(card)) },
  }, {
    fetch: (url: string, init: { body: string }) => {
      requests.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      return new Promise<FetchResult>((resolve, reject) => pending.push({ resolve, reject }));
    },
  });
  const render = () => {
    hook = 0;
    return (panel.MesaOrganizationPanel as (props: unknown) => Element)({
      organization: { themes: [initialTheme], unlinkedDossiers: [] }, fixtureMode,
    });
  };
  const elements = () => nodes(render());
  const filter = (status: "open" | "archived" | "all") => {
    const select = elements().find((element) => element.props["aria-label"] === "Temas visíveis");
    assert.ok(select);
    (select.props.onChange as (event: unknown) => void)({ target: { value: status } });
  };
  const button = (name: string) => {
    const button = elements().find((element) => element.type === "button" && label(element) === name);
    assert.ok(button, `Missing button: ${name}`);
    return button;
  };
  const click = (name: string) => {
    const target = button(name);
    assert.notEqual(target.props.disabled, true);
    (target.props.onClick as () => void)();
  };
  const toggles = () => elements().filter((element) => element.type === ThemeToggle);
  return { requests, pending, removed, updates, elements, filter, button, click, toggles };
}

test("arquivado substitui a checkbox por Reabrir Tema; aberto conserva a checkbox existente", () => {
  const archived = panelHarness();
  archived.filter("archived");
  assert.equal(archived.button("Reabrir Tema").props.disabled, false);
  assert.equal(archived.toggles().length, 0);
  const open = panelHarness(openedTheme);
  assert.equal(open.toggles().length, 1);
  assert.deepEqual(open.toggles()[0].props.theme, openedTheme);
  assert.equal(open.elements().some((element) => label(element) === "Reabrir Tema"), false);
});

test("reabrir espera pelo servidor, sai de Arquivados e entra em Abertos sem selecionar nem alterar material", async () => {
  const harness = panelHarness();
  harness.filter("archived");
  harness.click("Reabrir Tema");
  assert.deepEqual(harness.requests, [{ url: organizationRoute,
    body: { action: "set_theme_status", themeId, status: "open" } }]);
  assert.equal(harness.toggles().length, 0);
  assert.equal(harness.elements().filter((element) => element.type === "article").length, 1);
  const pendingButton = harness.elements().find((element) => element.type === "button" && element.props.disabled === true);
  assert.ok(pendingButton, "A reabertura pendente mantém o cartão arquivado e bloqueia repetição");
  assert.deepEqual(harness.updates, []);
  assert.deepEqual(harness.removed, []);
  harness.pending[0].resolve(result(openedTheme));
  await settled();
  assert.equal(harness.elements().filter((element) => element.type === "article").length, 0);
  harness.filter("open");
  assert.deepEqual(plain(harness.toggles()[0].props.theme), openedTheme);
  assert.deepEqual(harness.updates, [openedTheme]);
  assert.deepEqual(harness.removed, []);
  assert.equal(harness.requests.length, 1);
});

test("erro de reabertura conserva arquivado, mostra feedback e permite repetir sem seleção", async () => {
  const harness = panelHarness();
  harness.filter("archived");
  harness.click("Reabrir Tema");
  harness.pending[0].reject(new Error("Falha de rede: tenta novamente."));
  await settled();
  assert.equal(harness.toggles().length, 0);
  assert.equal(harness.button("Reabrir Tema").props.disabled, false);
  assert.ok(harness.elements().some((element) => element.props.role === "alert"
    && label(element) === "Falha de rede: tenta novamente."));
  assert.deepEqual(harness.updates, []);
  assert.deepEqual(harness.removed, []);
  harness.click("Reabrir Tema");
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.elements().some((element) => element.props.role === "alert"), false);
  harness.pending[1].resolve(result(openedTheme));
  await settled();
  harness.filter("open");
  assert.equal(harness.toggles().length, 1);
});

test("resposta sem confirmação do mesmo Tema aberto não provoca reabertura local", async () => {
  for (const response of [result(theme), result({ ...openedTheme, id: "outro-tema" }),
    { ok: true, json: async () => ({ ok: true }) },
    { ok: false, json: async () => ({ ok: false, message: "Não foi possível reabrir." }) }]) {
    const harness = panelHarness();
    harness.filter("archived");
    harness.click("Reabrir Tema");
    harness.pending[0].resolve(response);
    await settled();
    assert.equal(harness.button("Reabrir Tema").props.disabled, false);
    assert.equal(harness.toggles().length, 0);
    assert.ok(harness.elements().some((element) => element.props.role === "alert" && label(element)));
    assert.deepEqual(harness.updates, []);
  }
});

test("arquivar mantém atualização otimista, remove seleção após sucesso e faz rollback no erro", async () => {
  for (const success of [true, false]) {
    const harness = panelHarness(openedTheme);
    harness.filter("all");
    harness.click("Apagar Tema");
    assert.equal(harness.toggles().length, 0);
    assert.equal(harness.button("A guardar…").props.disabled, true);
    assert.deepEqual(harness.requests, [{ url: organizationRoute,
      body: { action: "archive_theme", themeId, status: "archived" } }]);
    assert.deepEqual(harness.removed, []);
    if (success) harness.pending[0].resolve(result(theme));
    else harness.pending[0].reject(new Error("Arquivo indisponível."));
    await settled();
    assert.equal(harness.toggles().length, success ? 0 : 1);
    assert.deepEqual(harness.removed, success ? [themeId] : []);
    assert.deepEqual(harness.updates, success ? [theme] : []);
    if (!success) assert.ok(harness.elements().some((element) => element.props.role === "alert"));
  }
});

test("fixture permite reabrir e voltar a arquivar localmente sem pedidos ou seleção automática", () => {
  const harness = panelHarness(theme, true);
  harness.filter("archived");
  harness.click("Reabrir Tema");
  assert.equal(harness.elements().filter((element) => element.type === "article").length, 0);
  harness.filter("open");
  assert.deepEqual(plain(harness.toggles()[0].props.theme), openedTheme);
  assert.deepEqual(harness.removed, []);
  harness.click("Apagar Tema");
  assert.equal(harness.toggles().length, 0);
  harness.filter("archived");
  assert.equal(harness.button("Reabrir Tema").props.disabled, false);
  assert.deepEqual(harness.requests, []);
  assert.deepEqual(harness.removed, [themeId]);
  assert.deepEqual(harness.updates, [openedTheme, theme]);
});
