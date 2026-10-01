import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);
const tree = ts.createSourceFile("Desk.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function nodes(root: ts.Node, predicate: (node: ts.Node) => boolean) {
  const result: ts.Node[] = [];
  function visit(node: ts.Node) {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return result;
}

const component = (() => {
  const node = tree.statements.find((candidate) => ts.isFunctionDeclaration(candidate)
    && candidate.name?.text === "MatchdayEditorialThematicDeskClient");
  assert.ok(node && ts.isFunctionDeclaration(node));
  return node;
})();

function feedbackImplementation() {
  const helpers = nodes(component, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "showMessage");
  assert.equal(helpers.length, 1, "O feedback deve ter um único ponto de entrada");
  const cleanupEffects = nodes(component, (node) => ts.isCallExpression(node)
    && node.expression.getText(tree) === "useEffect"
    && Boolean(node.arguments[0]?.getText(tree).includes("messageTimerRef"))
    && Boolean(node.arguments[0]?.getText(tree).includes("clearTimeout")));
  assert.equal(cleanupEffects.length, 1, "O timer deve ter cleanup de desmontagem");
  const effect = cleanupEffects[0];
  assert.ok(ts.isCallExpression(effect));
  assert.equal(effect.arguments[1]?.getText(tree), "[]");
  return { helper: helpers[0], effect };
}

function harness(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { helper, effect } = feedbackImplementation();
  const code = ts.transpileModule(
    `${helper.getText(tree)}\nconst installCleanup = ${effect.arguments[0].getText(tree)};\n({ showMessage, dispose: installCleanup() });`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const writes: (string | null)[] = [];
  const messageTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
  const api = runInNewContext(code, {
    messageTimerRef,
    setMessage: (message: string | null) => { writes.push(message); },
    window: {
      setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
      clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
    },
  }) as { showMessage: (message: string, options?: { autoDismiss?: boolean }) => void; dispose: () => void };
  assert.equal(typeof api.dispose, "function");
  return { ...api, writes, messageTimerRef, current: () => writes.at(-1) };
}

test("feedback de sucesso mantém-se até 3499ms e desaparece aos 3500ms", (t) => {
  const feedback = harness(t);
  feedback.showMessage("Alteração concluída.", { autoDismiss: true });
  t.mock.timers.tick(3499);
  assert.equal(feedback.current(), "Alteração concluída.");
  t.mock.timers.tick(1);
  assert.equal(feedback.current(), null);
  assert.equal(feedback.messageTimerRef.current, null);
  t.mock.timers.tick(10000);
  assert.deepEqual(feedback.writes, ["Alteração concluída.", null]);
});

test("repetir exatamente a mesma mensagem reinicia os 3500ms sem depender de render", (t) => {
  const feedback = harness(t);
  feedback.showMessage("Notícia colocada.", { autoDismiss: true });
  t.mock.timers.tick(3000);
  feedback.showMessage("Notícia colocada.", { autoDismiss: true });
  t.mock.timers.tick(500);
  assert.equal(feedback.current(), "Notícia colocada.");
  t.mock.timers.tick(2999);
  assert.equal(feedback.current(), "Notícia colocada.");
  t.mock.timers.tick(1);
  assert.deepEqual(feedback.writes, ["Notícia colocada.", "Notícia colocada.", null]);
});

test("o timer de uma mensagem anterior nunca remove o feedback mais recente", (t) => {
  const feedback = harness(t);
  feedback.showMessage("Primeira operação.", { autoDismiss: true });
  t.mock.timers.tick(1000);
  feedback.showMessage("Segunda operação.", { autoDismiss: true });
  t.mock.timers.tick(2500);
  assert.equal(feedback.current(), "Segunda operação.");
  t.mock.timers.tick(1000);
  assert.equal(feedback.current(), null);
});

for (const [kind, text] of [
  ["erro", "Não foi possível aplicar as alterações."],
  ["aviso", "A Mesa está a guardar; aguarde."],
  ["saving", "A aplicar alterações…"],
  ["refreshing", "Alterações aplicadas. A atualizar a Mesa…"],
] as const) {
  test(`feedback de ${kind} cancela o timer anterior e permanece visível`, (t) => {
    const feedback = harness(t);
    feedback.showMessage("Sucesso anterior.", { autoDismiss: true });
    t.mock.timers.tick(1000);
    feedback.showMessage(text);
    t.mock.timers.tick(60000);
    assert.equal(feedback.current(), text);
    assert.equal(feedback.messageTimerRef.current, null);
    assert.deepEqual(feedback.writes, ["Sucesso anterior.", text]);
  });
}

test("um sucesso posterior substitui um erro persistente e recebe o seu próprio timer", (t) => {
  const feedback = harness(t);
  feedback.showMessage("Erro anterior.");
  t.mock.timers.tick(5000);
  feedback.showMessage("Alterações aplicadas.", { autoDismiss: true });
  t.mock.timers.tick(3499);
  assert.equal(feedback.current(), "Alterações aplicadas.");
  t.mock.timers.tick(1);
  assert.equal(feedback.current(), null);
});

test("cleanup cancela o timer sem atualizar estado depois da desmontagem", (t) => {
  const feedback = harness(t);
  feedback.showMessage("Última alteração desfeita.", { autoDismiss: true });
  t.mock.timers.tick(1000);
  feedback.dispose();
  t.mock.timers.tick(10000);
  assert.deepEqual(feedback.writes, ["Última alteração desfeita."]);
});

test("apenas sucessos locais, Undo, Reset e confirmação do token são transitórios", () => {
  const { helper, effect } = feedbackImplementation();
  const calls = nodes(component, (node) => ts.isCallExpression(node) && node.expression.getText(tree) === "showMessage");
  const transientMessages = calls.flatMap((node) => {
    assert.ok(ts.isCallExpression(node));
    if (!node.arguments[1]) return [];
    const options = node.arguments[1];
    assert.ok(ts.isObjectLiteralExpression(options));
    assert.equal(options.properties.length, 1);
    const option = options.properties[0];
    assert.ok(ts.isPropertyAssignment(option));
    assert.equal(option.name.getText(tree), "autoDismiss");
    assert.equal(option.initializer.kind, ts.SyntaxKind.TrueKeyword);
    return [node.arguments[0].getText(tree)];
  });
  assert.deepEqual(transientMessages.sort(), [
    '"Alterações aplicadas."',
    '"Alterações locais anuladas."',
    '"Última alteração desfeita."',
    "successMessage",
  ].sort());
  const bypasses = nodes(component, (node) => ts.isCallExpression(node)
    && node.expression.getText(tree) === "setMessage"
    && !(node.pos >= helper.pos && node.end <= helper.end));
  assert.equal(bypasses.length, 0, "Todas as novas mensagens devem cancelar o timer anterior");
  assert.doesNotMatch(helper.getText(tree) + effect.getText(tree), /setApplyState|setPhysicalDesk|setAwaitedPhysicalStateToken|router\.|fetch\(|buildPhysicalDeskApplyPayload/);
});
