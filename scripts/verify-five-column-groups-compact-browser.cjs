// Real Mesa regression against the previous group commit, on the same read-only J08 fixture.
// Start serve-five-column-groups-preview.tsx with GROUP_PREVIEW_BASE=cd9b92030d50dcde705a24575bd58e70aa2ff3ac.
// Usage: node scripts/verify-five-column-groups-compact-browser.cjs <agent-browser> <output-dir>
const { execFileSync } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const [browser, output] = process.argv.slice(2);
if (!browser || !output) throw new Error("Supply agent-browser and an artifact directory");
mkdirSync(output, { recursive: true });
function run(...args) {
  const result = JSON.parse(execFileSync(browser, ["--session", "column-groups", ...args, "--json"], {
    encoding: "utf8", windowsHide: true, timeout: 25000,
  }));
  if (!result.success) throw new Error(`${args[0]}: ${result.error}`);
  return result.data;
}
const read = code => run("eval", code).result;
const button = name => run("find", "role", "button", "click", "--name", name, "--exact");
const hex = '[aria-label="Cor hexadecimal do título da coluna"]';
function shot(name) {
  read("Promise.race([Promise.all([...document.images].filter(i=>i.getBoundingClientRect().top<1000).map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,1800))])");
  run("screenshot", path.join(output, name));
}
function createGroup(baseline) {
  run("open", `http://127.0.0.1:3106/${baseline ? "?baseline=1" : ""}`);
  button("Desalojadas 19");
  run("click", ".thematic-global-tools > details:first-child > summary");
  button("Agrupar 5 colunas");
  run("fill", '[aria-label="Nome do novo grupo"]', "Mercado internacional");
  for (let i = 0; i < 5; i++) run("find", "nth", String(i), '.thematic-group-create input[type="checkbox"]', "check");
  run("click", '.thematic-group-create button[type="submit"]');
}
const metrics = () => read(`(() => {
  const rect = s => {const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const controls=rect('.editorial-column-group-controls'), slot=rect('[data-zone-id] .thematic-workspace-slot');
  return {rail:rect('.thematic-zone-list'),center:rect('.thematic-workspace-stack'),right:rect('.thematic-sources'),
    groupEntry:rect('.thematic-zone-list .thematic-zone-row:last-child'),controls,activeHeader:rect('.thematic-zone-editor'),
    color:rect('.thematic-zone-editor fieldset'),slot,totalHeaderHeight:slot.y-controls.y,
    overflow:document.documentElement.scrollWidth>innerWidth,editors:document.querySelectorAll('[data-zone-id]').length,
    entries:document.querySelectorAll('.thematic-zone-list button').length};
})()`);
const counts = () => read(`({total:document.querySelector('.editorial-column-group-count').textContent,
  rail:[...document.querySelectorAll('.thematic-zone-list button')].find(x=>x.textContent.startsWith('Mercado internacional')).textContent,
  tabs:[...document.querySelectorAll('.editorial-column-group-tabs button')].map(x=>x.getAttribute('aria-label')),
  active:document.querySelector('.editorial-column-group-tabs [aria-pressed=true]').getAttribute('aria-label'),
  title:document.querySelector('.thematic-zone-editor input').value})`);
function expectCount(total, selectedColumn = 4) {
  const result = counts();
  assert.equal(result.total, `${total}/25`); assert.ok(result.rail.includes(`${total}/25`));
  assert.equal(result.title, `Zona ${selectedColumn}`);
  assert.ok(result.active.startsWith(`Coluna ${selectedColumn} ·`));
  return result;
}
// Some Windows browser backends retain earlier errors even after --clear.
// Compare the complete buffer so any newly emitted exception still fails this run.
const errorsBefore = run("errors").errors;
run("set", "viewport", "1440", "1000");
createGroup(true);
shot("antes-coluna1-1440.png");
const before = metrics();
button("Benfica agora 6/6"); shot("antes-benfica-1440.png");
createGroup(false);
shot("depois-coluna1-desligado-1440.png");
const after = metrics();
assert.equal(after.entries, before.entries); assert.equal(after.editors, 1); assert.equal(after.overflow, false);
assert.ok(after.totalHeaderHeight >= 95 && after.totalHeaderHeight <= 115, JSON.stringify(after));
assert.ok(after.totalHeaderHeight < before.totalHeaderHeight);
assert.equal(after.groupEntry.height, before.groupEntry.height);
for (const panel of ["rail", "center", "right"]) for (const key of ["x", "y", "width"]) assert.equal(after[panel][key], before[panel][key], `${panel}.${key}`);
assert.equal(after.color.y, after.activeHeader.y + 4);
const initial = expectCount(11, 1);
assert.deepEqual(initial.tabs, [3, 2, 2, 2, 2].map((n, i) => `Coluna ${i + 1} · ${n}/5`));
button("Coluna 4 · 2/5"); shot("depois-coluna4-desligado-1440.png");
const selectedId = read("document.querySelector('[data-zone-id]').dataset.zoneId");
const candidate = read("document.querySelector('.thematic-sources .thematic-card strong').textContent");
run("drag", ".thematic-sources .thematic-card:first-child", "[data-zone-id] .thematic-workspace-slot:nth-child(3)");
const dropped = expectCount(12);
assert.ok(dropped.tabs[3].includes("3/5"));
assert.ok(read("document.querySelector('[data-zone-id] .thematic-workspace-slot:nth-child(3)').textContent").includes(candidate));
run("click", '[data-zone-id] .thematic-workspace-slot:nth-child(3) .thematic-card-menu summary');
button("Mover para Desalojadas"); expectCount(11);
button("Desfazer última"); expectCount(12);
button("Desfazer última"); expectCount(11);
run("fill", hex, "#zzzzzz"); run("click", '[aria-label="Título público do grupo"]');
assert.equal(read(`document.querySelector('${hex}').getAttribute('aria-invalid')`), "true");
run("fill", hex, "#ff00cc"); run("click", '[aria-label="Título público do grupo"]');
assert.equal(read(`document.querySelector('${hex}').value`), "#FF00CC");
button("Usar default para a cor do título da coluna"); assert.equal(read(`document.querySelector('${hex}').value`), "");
button("Desfazer última"); button("Desfazer última");
// Native colour dialogs are OS UI; deliver the same input/change events to the actual picker.
read(`(() => {const picker=document.querySelector('[aria-label="Escolher cor do título da coluna"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(picker,'#0066ff');
  picker.dispatchEvent(new Event('input',{bubbles:true}));picker.dispatchEvent(new Event('change',{bubbles:true}));})()`);
assert.equal(read(`document.querySelector('${hex}').value`), "#0066FF"); button("Desfazer última");
assert.equal(read("document.querySelector('[data-zone-id]').dataset.zoneId"), selectedId);
button("Ligar grupo"); expectCount(11); shot("depois-coluna4-ligado-1440.png");
assert.equal(read("document.querySelector('.editorial-column-group-switch').getAttribute('aria-label')"), "Desligar grupo");
button("Desligar grupo"); expectCount(11); shot("depois-coluna4-desligado-1440.png");
button("Coluna 5 · 2/5");
// Leave a deliberately incomplete group disabled, then prove enable is rejected atomically.
for (let i = 0; i < 2; i++) {
  run("find", "nth", "0", '[data-zone-id] .thematic-card-menu summary', "click"); button("Mover para Desalojadas");
}
expectCount(9, 5); button("Ligar grupo"); expectCount(9, 5);
assert.equal(read("document.querySelector('.editorial-column-group-switch').getAttribute('aria-label')"), "Ligar grupo");
assert.match(read("document.querySelector('.editorial-column-group-diagnostic').textContent"), /5/);
button("Desfazer última"); button("Desfazer última"); expectCount(11, 5);
button("Coluna 1 · 3/5");
// Measurement overlay only annotates real DOM coordinates; no mockup or image manipulation.
read(`(() => {
  const top=document.querySelector('.editorial-column-group-controls').getBoundingClientRect();
  const bottom=document.querySelector('[data-zone-id] .thematic-workspace-slot').getBoundingClientRect();
  const marker=document.createElement('div');marker.id='measurement';marker.setAttribute('aria-hidden','true');
  marker.style.cssText='position:fixed;pointer-events:none;z-index:9999;border-left:3px solid #cf263f;color:#a8122c;font:700 12px Arial;';
  Object.assign(marker.style,{left:(top.x+top.width-5)+'px',top:top.y+'px',height:(bottom.y-top.y)+'px'});
  const label=document.createElement('span');label.textContent=(bottom.y-top.y).toFixed(2)+' px · cabeçalho completo';
  label.style.cssText='position:absolute;right:8px;top:-23px;white-space:nowrap;background:#fff5f6;padding:4px 6px;border:1px solid #cf263f;';
  marker.append(label);document.body.append(marker);
})()`);
shot("depois-medida-1440.png"); read("document.getElementById('measurement').remove()");
// Match the single-create history and message before comparing an unchanged legacy workspace.
createGroup(false); button("Benfica agora 6/6"); shot("depois-benfica-1440.png");
const errors = run("errors");
assert.deepEqual(errors.errors, errorsBefore);
const result = { before, after, initial, dropped, errorsBefore, errorsAfter: errors.errors, newErrors: [], checks: ["11/25 in header and rail", "five correct tab counts", "drag/drop 11→12", "removal 12→11", "undo 11→12→11", "selected column preserved", "invalid HEX rejected", "HEX normalized, picker/default/undo", "Ligar/Desligar actual state", "incomplete enable rejected atomically", "95–115px header", "same panel coordinates and rail entry height", "legacy workspace comparison", "no new browser exceptions"] };
writeFileSync(path.join(output, "mesa-browser-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
