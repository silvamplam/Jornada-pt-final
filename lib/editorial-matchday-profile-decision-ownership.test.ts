import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "app/admin/editorial/jornada/[matchdayId]/organizar/MatchdayEditorialThematicDeskClient.tsx",
  "utf8",
);

function functionBody(
  source: string,
  name: string,
  nextName: string,
) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);

  assert.ok(start >= 0, `${name} nao encontrado`);
  assert.ok(end > start, `${nextName} nao encontrado depois de ${name}`);

  return source.slice(start, end);
}

test(
  "colocacao exclusiva tem um unico preparador para Abertura, zona, Faixa, Banco e automatico",
  () => {
    const transition = functionBody(
      client,
      "prepareExclusivePlacementTransition",
      "placeInOpening",
    );

    assert.match(
      transition,
      /openingWithoutMany\(itemIdentities\)/,
    );
    assert.match(
      transition,
      /returnMatchdayEditorialItemsToAutomatic[\s\S]*itemIdentities/,
    );
    assert.match(
      transition,
      /activeItemsOutside\(opening\)/,
    );

    for (const name of [
      "placeInZone",
      "placeInFaixa",
      "placeInBank",
      "returnToAutomatic",
    ]) {
      const start = client.indexOf(`function ${name}`);
      const next = client.indexOf("\n  function ", start + 1);
      const body = client.slice(
        start,
        next > start ? next : client.length,
      );

      assert.match(
        body,
        /prepareExclusivePlacementTransition/,
        `${name} deve usar a mesma transicao exclusiva`,
      );
    }
  },
);

test(
  "operacao em lote usa a mesma transicao e aceita itens vindos da Abertura",
  () => {
    assert.doesNotMatch(
      client,
      /const circuitActiveItems/,
    );

    const bulkStart = client.indexOf(
      "{selected.size > 0 ? (",
    );
    const bulkEnd = client.indexOf(
      '<details className="thematic-panel thematic-controls">',
      bulkStart,
    );

    assert.ok(bulkStart >= 0, "toolbar contextual da operacao em lote nao encontrada");
    assert.ok(bulkEnd > bulkStart, "fim da toolbar contextual nao encontrado");

    const bulk = client.slice(
      bulkStart,
      bulkEnd,
    );

    assert.match(
      bulk,
      /className="thematic-bulk-context"/,
    );
    assert.match(
      bulk,
      /prepareExclusivePlacementTransition[\s\S]*selectedIdentities/,
    );

    const calls =
      bulk.match(
        /prepareExclusivePlacementTransition/g,
      ) ?? [];

    assert.equal(
      calls.length,
      6,
    );
  },
);

test(
  "Selecao editorial e independente da colocacao mas participa no mesmo undo local",
  () => {
    assert.match(
      client,
      /type WorkspaceDraft[\s\S]*editorialSelection: readonly \(string \| null\)\[\]/,
    );

    const currentDraft = functionBody(
      client,
      "currentDraft",
      "commitDraft",
    );
    assert.match(
      currentDraft,
      /editorialSelection: draftEditorialSelection/,
    );

    const commitDraft = functionBody(
      client,
      "commitDraft",
      "changeZoneLayout",
    );
    assert.match(
      commitDraft,
      /setDraftEditorialSelection\(next\.editorialSelection\)/,
    );

    const undo = functionBody(
      client,
      "undo",
      "resetLocal",
    );
    assert.match(
      undo,
      /setDraftEditorialSelection\(previous\.editorialSelection\)/,
    );

    const transition = functionBody(
      client,
      "prepareExclusivePlacementTransition",
      "placeInOpening",
    );

    assert.doesNotMatch(
      transition,
      /setDraftEditorialSelection|setPersistedEditorialSelection/,
    );
  },
);

test(
  "alterar Selecao editorial fica em preview e entra no historico antes do Apply",
  () => {
    const selection = functionBody(
      client,
      "changeEditorialSelection",
      "currentDraft",
    );

    assert.match(
      selection,
      /const nextSelection/,
    );
    assert.match(
      selection,
      /commitDraft/,
    );
    assert.match(
      selection,
      /editorialSelection: nextSelection/,
    );
    assert.doesNotMatch(
      selection,
      /fetch\(|selection_set|selection_clear/,
    );
  },
);

test(
  "UI separa Operacao em lote de Selecao editorial",
  () => {
    assert.match(
      client,
      /className="thematic-bulk-context"/,
    );
    assert.match(
      client,
      /selected\.size > 0/,
    );
    assert.match(
      client,
      /Limpar marcação/,
    );
    assert.doesNotMatch(
      client,
      /Seleção múltipla e fallback acessível/,
    );
    assert.match(
      client,
      /Seleção editorial é promoção manual independente/,
    );
    assert.match(
      client,
      /Não alteram Abertura,[\s\S]*zona temática, Faixa ou Banco/,
    );
  },
);
