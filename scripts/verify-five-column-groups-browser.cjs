// Drive the REAL Mesa component served by serve-five-column-groups-preview.tsx.
// Usage: node scripts/verify-five-column-groups-browser.cjs <agent-browser> <output-dir>
// The local server rejects all writes; the real-data JSON stays outside Git.
const { execFileSync } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const [browser, output] = process.argv.slice(2);
if (!browser || !output) throw new Error("Supply agent-browser and an artifact directory");
mkdirSync(output, { recursive: true });
const session = "column-groups";
function run(...args) {
  const result = JSON.parse(execFileSync(browser, ["--session", session, ...args, "--json"], { encoding: "utf8", windowsHide: true, timeout: 25000 }));
  if (!result.success) throw new Error(`${args[0]}: ${result.error}`);
  return result.data;
}
const read = (code) => run("eval", code).result;
const button = (name) => run("find", "role", "button", "click", "--name", name, "--exact");
const shot = (name) => {
  read("Promise.race([Promise.all([...document.images].filter(i=>i.getBoundingClientRect().top<1000).map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,1800))])");
  run("screenshot", path.join(output, name));
};
const metrics = () => read(`(() => {
  const rect = s => { const r=document.querySelector(s).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
  return {rail:rect('.thematic-zone-list'),center:rect('.thematic-workspace-stack'),right:rect('.thematic-sources'),
    header:rect('.thematic-zone-editor'),color:rect('.thematic-zone-editor fieldset'),
    overflow:document.documentElement.scrollWidth>innerWidth,editors:document.querySelectorAll('[data-zone-id]').length,
    entries:document.querySelectorAll('.thematic-zone-list button').length};
})()`);
run("set", "viewport", "1440", "1000");
run("open", "http://127.0.0.1:3106/?baseline=1");
button("Zona 1 3/5"); button("Desalojadas 19");
shot("mesa-before-column1-1440.png");
const before = metrics();
run("open", "http://127.0.0.1:3106/");
button("Desalojadas 19");
run("click", ".thematic-global-tools > details:first-child > summary");
button("Agrupar 5 colunas");
run("fill", '[aria-label="Nome do novo grupo"]', "Mercado internacional");
for (let i = 0; i < 5; i++) run("find", "nth", String(i), '.thematic-group-create input[type="checkbox"]', "check");
run("click", '.thematic-group-create button[type="submit"]');
shot("mesa-group-column1-1440.png");
const after = metrics();
assert.equal(after.entries, before.entries - 4);
assert.equal(after.editors, 1); assert.equal(after.overflow, false);
for (const panel of ["rail", "center", "right"]) {
  assert.equal(after[panel].x, before[panel].x); assert.equal(after[panel].width, before[panel].width);
}
const selections = [];
for (let i = 1; i <= 5; i++) {
  button(`Coluna ${i} · ${i === 1 ? 3 : 2}/5`);
  const selected = read(`({id:document.querySelector('[data-zone-id]').dataset.zoneId,
    title:document.querySelector('.thematic-zone-editor input').value,
    editors:document.querySelectorAll('[data-zone-id]').length,
    active:[...document.querySelectorAll('.editorial-column-group-tabs [aria-pressed=true]')].map(x=>x.textContent)})`);
  assert.equal(selected.title, `Zona ${i}`); assert.equal(selected.editors, 1); assert.equal(selected.active.length, 1);
  selections.push(selected);
}
assert.equal(new Set(selections.map(s => s.id)).size, 5);
button("Coluna 4 · 2/5"); shot("mesa-group-column4-1440.png");
const candidate = read("document.querySelector('.thematic-sources .thematic-card strong').textContent");
run("drag", ".thematic-sources .thematic-card:first-child", "[data-zone-id] .thematic-workspace-slot:nth-child(3)");
const drop = read("({id:document.querySelector('[data-zone-id]').dataset.zoneId,text:document.querySelector('[data-zone-id] .thematic-workspace-slot:nth-child(3)').textContent,tabs:[...document.querySelectorAll('.editorial-column-group-tabs button')].map(x=>x.textContent)})");
assert.equal(drop.id, selections[3].id); assert.ok(drop.text.includes(candidate)); assert.ok(drop.tabs[3].includes("3/5"));
button("Desfazer última");
run("fill", '[aria-label="Cor hexadecimal do título da coluna"]', "#ff00cc");
run("click", '[aria-label="Título público do grupo"]');
assert.equal(read("document.querySelector('[aria-label=\"Cor hexadecimal do título da coluna\"]').value"), "#FF00CC");
button("Usar default para a cor do título da coluna");
assert.equal(read("document.querySelector('[aria-label=\"Cor hexadecimal do título da coluna\"]').value"), "");
button("Desfazer última"); button("Desfazer última");
button("Ligar grupo");
assert.equal(read("document.querySelector('.editorial-column-group-switch').getAttribute('aria-label')"), "Desligar grupo");
button("Desfazer última");
run("check", '[aria-label="Selecionar Mercado internacional para mover"]');
const orderBefore = read("[...document.querySelectorAll('.thematic-zone-list button')].map(x=>x.textContent)");
button("Subir item selecionado");
const orderMoved = read("[...document.querySelectorAll('.thematic-zone-list button')].map(x=>x.textContent)");
assert.equal(orderMoved.length, orderBefore.length);
assert.equal(orderMoved.indexOf(orderBefore.at(-1)), orderBefore.length - 2);
button("Desfazer última");
run("uncheck", '[aria-label="Selecionar Mercado internacional para mover"]');
button("Benfica agora 6/6"); shot("mesa-group-closed-1440.png");
button("Mercado internacional 5 colunas · 11/25 · desligado");
shot("mesa-group-column1-1440.png");
const result = { before, after, selections, drop, checks: ["one rail unit", "same panel positions", "single selected editor", "five selectors", "real drag/drop to column 4", "manual HEX/reset/undo", "enable/undo", "whole group move/undo", "no horizontal overflow"] };
writeFileSync(path.join(output, "mesa-browser-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ checks: result.checks, before, after }, null, 2));
