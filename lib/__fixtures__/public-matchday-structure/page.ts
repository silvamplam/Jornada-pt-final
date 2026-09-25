import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import { articleContextFixture } from "../public-article-matchday-context/transport";

export const B2_BASE = "5be22501f79eb2d2e8f3bb84c290182b31d5a350";
export const PAGE = "app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx";
export const DAY_ID = "00000000-0000-4000-8000-000000000004";
export function pageFixture(hierarchical: boolean) {
  // Use a valid synthetic UUID so the existing physical-authority read also runs.
  const data = JSON.parse(JSON.stringify(articleContextFixture()).replaceAll("day-4", DAY_ID)) as ReturnType<typeof articleContextFixture>;
  data.matchday_editorial_profile_assignments = [];
  data.matchday_historical_composition_zones = [];
  data.matchday_historical_composition_zone_items = [];
  data.matchday_editorial_bank_items = [];
  data.editorial_articles = [];
  Object.assign(data.matchday_editorials[0], { title: "Editorial fixture", summary: "Resumo fixture", image_url: "/editorial.jpg" });
  data.matchday_reference_composition_items.forEach((row, index) => Object.assign(row, {
    label_snapshot: "Fixture", title_snapshot: `Notícia ${index}`, subtitle_snapshot: "Texto de teste",
    image_url_snapshot: "/news.jpg",
  }));
  if (hierarchical) {
    Object.assign(data.matchday_reference_compositions[0], { presentation_mode: "hierarchical",
      hierarchical_editorial_title: "Editorial histórico", hierarchical_editorial_text: "Texto histórico",
      hierarchical_editorial_author: "Autor fixture" });
    data.matchday_hierarchical_composition_slots = ["dominant_main", "other_chronicle_1", "other_chronicle_2", "other_chronicle_3"].map((key, index) => ({
      id: `slot-${index}`, composition_id: "composition-1", slot_key: key, sort_order: index,
      label_snapshot: "Jornada", title_snapshot: `Abertura ${index}`, subtitle_snapshot: "Subtítulo",
      image_url_snapshot: "/opening.jpg", link_url_snapshot: `/noticias/opening-${index}`,
    }));
    data.matchday_historical_composition_zones = [{ id: "zone-1", composition_id: "composition-1", sort_order: 1,
      public_title: "Notícias históricas", visual_family: "six_news" }];
    data.matchday_historical_composition_zone_items = Array.from({ length: 6 }, (_, index) => ({
      id: `zone-item-${index}`, composition_id: "composition-1", zone_id: "zone-1", position: index + 1,
      bank_item_id: null, source_identity: `fixture-${index}`, label_snapshot: "Arquivo",
      title_snapshot: `Arquivo ${index}`, subtitle_snapshot: "Subtítulo arquivo", image_url_snapshot: "/archive.jpg", link_url_snapshot: `/noticias/archive-${index}`,
    }));
    data.matchday_editorial_continuity_transitions = [{ id: "transition-1", source_matchday_id: DAY_ID,
      source_composition_id: "composition-1", target_matchday_id: "next-day", status: "completed" }];
  }
  return data;
}

export function interceptPhysicalRead(table: string) {
  if (table !== "rpc/read_matchday_live_layout_workspace_v22") return;
  return Response.json([{ physical_cutover: null, workspace_settings: null, zones: [], legacy_zone_projection: [] }]);
}

export function baseSource(path: string) {
  return execFileSync("git", ["show", `${B2_BASE}:${path}`], { encoding: "utf8", maxBuffer: 2_000_000 });
}

// Compile the actual page and base readers in memory. No fixture rewrites their
// queries or rendering logic. CSS is inert in this element-tree comparison.
export function loadPageAtBaseOrHead(base: boolean) {
  const modules = new Map<string, unknown>();
  const requireFromRoot = createRequire(resolve("package.json"));
  const previousCss = requireFromRoot.extensions[".css"];
  requireFromRoot.extensions[".css"] = (module) => { module.exports = new Proxy({}, { get: (_target, key) => String(key) }); };
  function compile(path: string): Record<string, unknown> {
    if (modules.has(path)) return modules.get(path) as Record<string, unknown>;
    const source = base ? baseSource(path) : readFileSync(path, "utf8");
    const output = ts.transpileModule(source, { fileName: path, compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const localRequire = createRequire(resolve(path));
    const module = { exports: {} };
    new Function("require", "module", "exports", output)((id: string) => {
      if (base && ["@/lib/public-matchday", "@/lib/public-competition-menu"].includes(id)) return compile(id.replace("@/", "") + ".ts");
      return localRequire(id);
    }, module, module.exports);
    modules.set(path, module.exports);
    return module.exports;
  }
  try {
    return compile(PAGE).default as (props: { params: Promise<{ competitionSlug: string; seasonLabel: string; matchdayNumber: string }> }) => Promise<unknown>;
  } finally {
    if (previousCss) requireFromRoot.extensions[".css"] = previousCss;
    else delete requireFromRoot.extensions[".css"];
  }
}

export function presentationTree(tree: unknown) {
  return JSON.parse(JSON.stringify(tree, (_key, value: unknown) => {
    if (typeof value === "function") return `[component:${value.name}]`;
    if (typeof value === "symbol") return String(value);
    if (value instanceof Map) return [...value.entries()];
    if (value instanceof Set) return [...value];
    return value;
  }));
}
