"""Browser geometry regression for the Mesa source card; never opens application routes.

Install playwright==1.57.0 and its Chromium/Firefox browsers in a disposable environment.
Run: python .ci/mesa-source-layout/check.py --browsers chromium firefox --output /tmp/mesa-layout
CHROMIUM_EXECUTABLE may point to a locally installed Chromium.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
MESA = ROOT / "app/admin/editorial/redacao-automatica/mesa"


def fixture(css: str, global_css: str, width: int, font_size: int, picture: bool, long: bool) -> str:
    # Prefix module classes, as Next does, so global CSS cannot match local names.
    css = re.sub(r"\.([A-Za-z_][\w-]*)", r".mesa_\1", css)
    title = (
        "Notícia de teste com um título longo: «O contexto editorial continua disponível»"
        if long else "Notícia de teste"
    )
    theme = "Tema com um título deliberadamente muito longo " * 5 if long else "Tema de teste"
    image = (
        '<img alt="" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' '
        'width=\'84\' height=\'108\'%3E%3Crect width=\'84\' height=\'108\' fill=\'%23dce9df\'/%3E%3C/svg%3E">'
        if picture else "<span>Sem imagem</span>"
    )
    # Same DOM order and native controls as MesaSourceItem / MesaClassificationEditor /
    # MesaSourceThemeMenu. Behaviour is local; no API, provider or database is started.
    card = f'''<ol style="margin:0;padding:0;list-style:none;width:{width}px">
<li class="sourceRow" data-lifecycle="new">
<div class="sourceSelection"><label class="selectionToggle"><input type="checkbox"><span>Selecionar fonte</span></label></div>
<div class="sourceThumb">{image}</div>
<article class="sourceBody">
<div class="sourceMeta"><span class="lifecycleBadge" data-lifecycle="new">NOVA</span><time>17/09/26, 12:43</time><span>Fonte de teste</span><span class="classificationBadge">Outros assuntos <small>Automática</small></span></div>
<h2>{html.escape(title)}</h2>
<p>Descrição local para verificar a geometria. Não é carregado nenhum artigo nem nenhuma fonte externa.</p>
<div class="sourceTools"><a href="#fonte">Abrir fonte</a>
<div class="classificationEditor"><select aria-label="Classificação manual"><option value="outside">Outros assuntos</option><option value="fc_porto">FC Porto</option></select><button type="button">Guardar</button></div>
<details class="sourceThemeMenu"><summary>Tema</summary><div><select aria-label="Tema de destino"><option value="">Escolher Tema</option><option value="theme">{html.escape(theme)}</option></select><button type="button">Adicionar</button></div></details>
</div></article><div class="discardArea"><button type="button" aria-label="Descartar fonte">Descartar</button></div>
</li></ol>'''
    card = re.sub(r'class="([^"]+)"', lambda m: 'class="' + ' '.join('mesa_' + name for name in m[1].split()) + '"', card)
    return f'''<!doctype html><html lang="pt"><meta charset="utf-8">
<style>{global_css}\n{css}\nhtml {{font-size:{font_size}px}} body {{padding:20px}}</style>
{card}<script>
window.localClicks = {{save:0, add:0}};
document.querySelector('.mesa_classificationEditor button').onclick = () => window.localClicks.save++;
document.querySelector('.mesa_sourceThemeMenu button').onclick = () => window.localClicks.add++;
</script></html>'''


def geometry(page) -> dict:
    return page.evaluate('''() => {
      const targets = {
        card: '.mesa_sourceRow', body: '.mesa_sourceBody', tools: '.mesa_sourceTools',
        title: '.mesa_sourceBody h2', editor: '.mesa_classificationEditor',
        classification: '.mesa_classificationEditor select', save: '.mesa_classificationEditor button',
        link: '.mesa_sourceTools > a', summary: '.mesa_sourceThemeMenu summary',
        menu: '.mesa_sourceThemeMenu > div', theme: '.mesa_sourceThemeMenu select',
        add: '.mesa_sourceThemeMenu button'
      };
      const result = {};
      for (const [key, selector] of Object.entries(targets)) {
        const el = document.querySelector(selector), r = el.getBoundingClientRect();
        const atCentre = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        result[key] = {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,
          scroll:el.scrollWidth,client:el.clientWidth,hit:!!atCentre && (el === atCentre || el.contains(atCentre))};
      }
      return result;
    }''')


def validate(current: dict, closed: dict, menu_open: bool) -> None:
    c = current["card"]
    controls = ["classification", "save", "link", "summary"]
    if menu_open:
        controls += ["theme", "add"]
    for key in controls:
        r = current[key]
        assert r["w"] > 8 and r["h"] > 8, f"{key}: collapsed control"
        assert r["x"] >= c["x"] and r["right"] <= c["right"] + .5, f"{key}: horizontal clipping"
        assert r["y"] >= c["y"] and r["bottom"] <= c["bottom"] + .5, f"{key}: vertical clipping"
        assert r["hit"], f"{key}: obscured control"
    for key in ["editor", "title"]:
        for coord in ["x", "y", "w", "h"]:
            assert abs(current[key][coord] - closed[key][coord]) <= .5, f"{key}: changed {coord}"
    for key in ["card", "body", "tools"]:
        assert current[key]["scroll"] <= current[key]["client"] + 1, f"{key}: horizontal overflow"
    editor, summary = current["editor"], current["summary"]
    # An expanded summary spans the entire row; it must not sit under the editor.
    overlap_x = min(editor["right"], summary["right"]) - max(editor["x"], summary["x"])
    overlap_y = min(editor["bottom"], summary["bottom"]) - max(editor["y"], summary["y"])
    assert overlap_x <= .5 or overlap_y <= .5, "classification overlaps Tema"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--browsers", nargs="+", default=["chromium"])
    parser.add_argument("--css", type=Path, default=MESA / "mesa.module.css")
    parser.add_argument("--output", type=Path, default=Path("/tmp/mesa-source-layout"))
    parser.add_argument("--regression-only", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    css, global_css = args.css.read_text(), (ROOT / "app/globals.css").read_text()
    source = (MESA / "_mesa-source-item.tsx").read_text()
    client = (MESA / "_mesa-selection-client.tsx").read_text()
    assert "styles.sourceBody" in source and "styles.sourceTools" in source
    assert re.search(r"<MesaClassificationEditor[\s\S]*<MesaSourceThemeMenu", source)
    assert 'className={styles.classificationEditor}' in client
    assert '<details className={styles.sourceThemeMenu}>' in client
    sizes = [(1440, w) for w in [288, 320, 360, 400, 464, 504, 630, 840]] + [(375, 335)]
    cases = [(v, w, fs, picture, long) for v, w in sizes for fs in [16, 20]
             for picture in [True, False] for long in [True, False]]
    if args.regression_only:
        cases = [(1440, 464, 16, True, True)]
    results, unexpected = [], []
    with sync_playwright() as playwright:
        for browser_name in args.browsers:
            launcher = getattr(playwright, browser_name)
            options = {"headless": True}
            if browser_name == "chromium" and os.environ.get("CHROMIUM_EXECUTABLE"):
                options["executable_path"] = os.environ["CHROMIUM_EXECUTABLE"]
                options["args"] = ["--no-sandbox"]
            browser = launcher.launch(**options)
            page = browser.new_page()
            page.set_default_timeout(3000)
            def block_request(route):
                unexpected.append(route.request.url)
                route.abort()
            page.route("**/*", block_request)
            for viewport, width, fs, picture, long in cases:
                result = dict(browser=browser_name, viewport=viewport, width=width, font=fs,
                              picture=picture, long_theme=long)
                sample = (viewport, width, fs, picture, long) == (1440, 464, 16, True, True)
                try:
                    page.set_viewport_size({"width": viewport, "height": 900})
                    page.set_content(fixture(css, global_css, width, fs, picture, long))
                    page.locator(".mesa_sourceRow").hover()
                    page.wait_for_timeout(120)
                    closed = geometry(page)
                    validate(closed, closed, False)
                    if sample:
                        page.locator("ol").screenshot(path=str(args.output / f"{browser_name}-closed.png"))
                    page.locator(".mesa_sourceThemeMenu summary").click()
                    opened = geometry(page)
                    if sample:
                        page.locator("ol").screenshot(path=str(args.output / f"{browser_name}-open.png"))
                        result["geometry"] = {"closed": closed, "open": opened}
                    validate(opened, closed, True)
                    page.get_by_label("Tema de destino").select_option("theme")
                    page.get_by_label("Classificação manual").select_option("fc_porto")
                    validate(geometry(page), closed, True)
                    page.locator(".mesa_classificationEditor button").click()
                    page.locator(".mesa_sourceThemeMenu button").click()
                    assert page.evaluate("window.localClicks") == {"save": 1, "add": 1}
                    page.locator(".mesa_sourceThemeMenu summary").click()
                    validate(geometry(page), closed, False)
                    # Keyboard focus must reveal classification without a layout change.
                    page.mouse.move(0, 0)
                    page.get_by_label("Classificação manual").focus()
                    page.wait_for_timeout(120)
                    validate(geometry(page), closed, False)
                    result["ok"] = True
                except Exception as error:
                    result.update(ok=False, error=str(error))
                results.append(result)
                print(f"{browser_name} {width} {fs} {picture} {long}: {result.get('error', 'ok')}", flush=True)
            browser.close()
    report = {"cases": results, "passed": sum(r["ok"] for r in results),
              "failed": sum(not r["ok"] for r in results), "external_requests": unexpected}
    (args.output / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps({k: v for k, v in report.items() if k != "cases"}, ensure_ascii=False))
    for failed in (r for r in results if not r["ok"]):
        print(json.dumps({k: v for k, v in failed.items() if k != "geometry"}, ensure_ascii=False))
    return 1 if report["failed"] or unexpected else 0


if __name__ == "__main__":
    raise SystemExit(main())
