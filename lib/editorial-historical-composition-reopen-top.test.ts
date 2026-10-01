import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const page = ts.createSourceFile(
  "page.tsx",
  readFileSync("app/admin/editorial/composicao/[matchdayId]/page.tsx", "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const route = ts.createSourceFile(
  "route.ts",
  readFileSync("app/api/admin/editorial/composicao/route.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const printer = ts.createPrinter({ removeComments: true });

function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const matches: T[] = [];
  function visit(node: ts.Node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return matches;
}

function print(node: ts.Node, source: ts.SourceFile) {
  return printer.printNode(ts.EmitHint.Unspecified, node, source).trim();
}

function attributes(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement) {
  return Object.fromEntries(node.attributes.properties.map((attribute) => {
    assert.ok(ts.isJsxAttribute(attribute), "O contrato não admite props implícitas por spread");
    const value = attribute.initializer;
    return [attribute.name.getText(page), value && ts.isStringLiteral(value)
      ? value.text
      : value && ts.isJsxExpression(value) && value.expression
        ? print(value.expression, page)
        : true];
  }));
}

function functionNamed(source: ts.SourceFile, name: string) {
  const matches = nodes(source, ts.isFunctionDeclaration).filter((node) => node.name?.text === name);
  assert.equal(matches.length, 1, `${name} deve ter uma única definição`);
  return matches[0];
}

function astShape(node: ts.Node): unknown {
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => { children.push(astShape(child)); });
  return [
    node.kind,
    ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ? node.text : null,
    ts.isVariableDeclarationList(node) ? node.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let) : null,
    children,
  ];
}

test("Reabrir aparece uma única vez no contexto superior, com o mesmo guard e props", () => {
  const instances = nodes(page, ts.isJsxSelfClosingElement).filter((node) => node.tagName.getText(page) === "ReopenCompositionForm");
  assert.equal(instances.length, 1);
  const instance = instances[0];
  assert.deepEqual(attributes(instance), {
    composition: "draftComposition",
    matchdayId: "matchday.id",
    returnTo: "returnTo",
  });
  let conditional: ts.ConditionalExpression | undefined;
  let context: ts.JsxElement | undefined;
  for (let parent = instance.parent; parent; parent = parent.parent) {
    if (!conditional && ts.isConditionalExpression(parent)) conditional = parent;
    if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(page) === "section"
      && attributes(parent.openingElement).className === "composition-context-selector") context = parent;
  }
  assert.ok(conditional);
  assert.equal(print(conditional.condition, page), "draftComposition && isPublishedComposition && draftComposition.is_current");
  assert.equal(conditional.whenFalse.kind, ts.SyntaxKind.NullKeyword);
  assert.ok(context, "Reabrir deve estar na secção de contexto, não num menu ou no fim da página");
  assert.ok(conditional.getStart(page) > context.openingElement.end);
  const clients = nodes(page, ts.isJsxOpeningElement).filter((node) => node.tagName.getText(page) === "HierarchicalCompositionDeskClient");
  assert.equal(clients.length, 1);
  assert.ok(context.end < clients[0].getStart(page), "A secção de contexto deve preceder a Mesa");
});

test("Reabrir conserva o formulário POST e todos os campos do contrato existente", () => {
  const component = functionNamed(page, "ReopenCompositionForm");
  const forms = nodes(component, ts.isJsxOpeningElement).filter((node) => node.tagName.getText(page) === "form");
  assert.equal(forms.length, 1);
  const form = attributes(forms[0]);
  assert.equal(form.action, "/api/admin/editorial/composicao");
  assert.equal(form.method, "post");
  assert.equal(form.onSubmit, undefined);
  const fields = nodes(component, ts.isJsxSelfClosingElement).filter((node) => node.tagName.getText(page) === "HiddenField");
  assert.deepEqual(fields.map(attributes), [
    { name: "action_type", value: "reopen_reference_composition" },
    { name: "matchday_id", value: "matchdayId" },
    { name: "composition_id", value: "composition.id" },
    { name: "return_to", value: "returnTo" },
    { name: "return_anchor", value: "composition-status" },
  ]);
  const buttons = nodes(component, ts.isJsxElement).filter((node) => node.openingElement.tagName.getText(page) === "button");
  assert.equal(buttons.length, 1);
  assert.equal(attributes(buttons[0].openingElement).type, "submit");
  assert.equal(buttons[0].children.map((node) => node.getText(page)).join(" ").trim(), "Reabrir para edição");
});

test("a API continua a validar os dois IDs e a despachar Reabrir para a mesma RPC", () => {
  const handler = functionNamed(route, "reopenReferenceComposition");
  const expected = ts.createSourceFile("expected.ts", `
    async function reopenReferenceComposition(formData: FormData) {
      const matchdayId = cleanText(formData.get("matchday_id"));
      const compositionId = cleanText(formData.get("composition_id"));
      if (!matchdayId || !compositionId) throw new Error("composition-invalid");
      await writeSupabaseAdmin("rpc/reopen_matchday_reference_composition", {
        method: "POST",
        body: JSON.stringify({ p_matchday_id: matchdayId, p_composition_id: compositionId }),
      });
    }
  `, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.deepEqual(astShape(handler), astShape(functionNamed(expected, "reopenReferenceComposition")));
  const dispatch = nodes(route, ts.isIfStatement).filter((node) => print(node.expression, route) === 'actionType === "reopen_reference_composition"');
  assert.equal(dispatch.length, 1);
  assert.equal(print(dispatch[0].thenStatement, route), "await reopenReferenceComposition(formData);");
});
