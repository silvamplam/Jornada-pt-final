"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  mergeMesaNewOutputGroups,
  mesaLooseNewOutputGroups,
  mesaNewOutputGroupingGap,
  mesaNewOutputGroupingNewCount,
  mesaNewOutputGroupingReady,
  parseMesaNewOutputGrouping,
  setMesaNewOutputTarget,
  setMesaNewOutputThemeCount,
  splitMesaNewOutputGroup,
  type MesaNewOutputGrouping,
} from "@/lib/redacao-automatica/newsroom-mesa-new-output-groups";

import styles from "./workspace.module.css";

const WORKSPACE_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/workspace";

type GroupingAction =
  | "set_new_output_target"
  | "set_theme_new_count"
  | "merge_new_output_groups"
  | "split_new_output_group"
  | "materialize_new_output_groups";

type PendingCommand = Readonly<{ signature: string; commandId: string }>;

export function NewOutputGroupingPlanner({
  initialGrouping,
  fixtureMode = false,
}: Readonly<{
  initialGrouping: MesaNewOutputGrouping;
  fixtureMode?: boolean;
}>) {
  const router = useRouter();
  const [grouping, setGrouping] = useState(initialGrouping);
  const [selectedGroupIds, setSelectedGroupIds] = useState<readonly string[]>([]);
  const [targetValue, setTargetValue] = useState(String(initialGrouping.targetCount ?? ""));
  const [themeValues, setThemeValues] = useState<Record<string, string>>(() => Object.fromEntries(
    initialGrouping.themes.map((theme) => [theme.themeId, theme.targetCount === null ? "" : String(theme.targetCount)]),
  ));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pendingCommand = useRef<PendingCommand | null>(null);
  const sourceById = new Map(grouping.sources.map((source) => [source.newsroomArticleId, source]));
  const looseGroups = mesaLooseNewOutputGroups(grouping);
  const planned = grouping.state === "planned";
  const gap = mesaNewOutputGroupingGap(grouping);
  const ready = mesaNewOutputGroupingReady(grouping);
  const newCount = mesaNewOutputGroupingNewCount(grouping);
  const unresolvedThemes = grouping.themes.some((theme) => theme.targetCount === null);
  const totalsResolved = (grouping.looseSourceIds.length === 0 || grouping.targetCount !== null) && !unresolvedThemes;
  const targetNewCount = (grouping.targetCount ?? 0)
    + grouping.themes.reduce((total, theme) => total + (theme.targetCount ?? 0), 0);
  const totalCount = grouping.existingOutputs.length + targetNewCount;

  useEffect(() => {
    setGrouping(initialGrouping);
    setTargetValue(initialGrouping.targetCount === null ? "" : String(initialGrouping.targetCount));
    setThemeValues(Object.fromEntries(initialGrouping.themes.map((theme) => (
      [theme.themeId, theme.targetCount === null ? "" : String(theme.targetCount)]
    ))));
  }, [initialGrouping]);

  async function command(action: GroupingAction, groupIds: readonly string[] = [], themeId: string | null = null) {
    if (busy) return;
    const targetCount = action === "set_new_output_target" && targetValue.trim() !== "" ? Number(targetValue) : null;
    const themeValue = themeId ? themeValues[themeId] ?? "" : "";
    const themeTargetCount = action === "set_theme_new_count" && themeValue.trim() !== "" ? Number(themeValue) : null;
    if (fixtureMode) {
      if (action === "set_new_output_target") {
        if (targetCount !== null) {
          setGrouping((current) => setMesaNewOutputTarget(
            current,
            targetCount,
            () => crypto.randomUUID(),
          ) ?? current);
        }
        setMessage("Objetivo atualizado apenas neste exemplo local.");
        return;
      }
      if (action === "set_theme_new_count" && themeId !== null && themeTargetCount !== null) {
        setGrouping((current) => setMesaNewOutputThemeCount(
          current,
          themeId,
          themeTargetCount,
          () => crypto.randomUUID(),
        ) ?? current);
        setMessage("Quantidade do Tema atualizada apenas neste exemplo local.");
        return;
      }
      if (action === "merge_new_output_groups") {
        setGrouping((current) => mergeMesaNewOutputGroups(current, groupIds) ?? current);
        setSelectedGroupIds([]);
        setMessage("Fontes agrupadas apenas neste exemplo local.");
        return;
      }
      if (action === "split_new_output_group") {
        setGrouping((current) => splitMesaNewOutputGroup(current, groupIds[0], () => crypto.randomUUID()) ?? current);
        setSelectedGroupIds([]);
        setMessage("Grupo separado apenas neste exemplo local.");
        return;
      }
      setMessage("Este exemplo não cria artigos nem altera fontes.");
      return;
    }

    const signature = JSON.stringify({ action, groupIds, themeId, targetCount, themeTargetCount, revision: grouping.revision });
    if (pendingCommand.current?.signature !== signature) {
      pendingCommand.current = { signature, commandId: crypto.randomUUID() };
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          commandId: pendingCommand.current.commandId,
          dossierId: grouping.dossierId,
          expectedRevision: grouping.revision,
          groupIds,
          ...(action === "set_new_output_target" ? { targetCount } : {}),
          ...(action === "set_theme_new_count" ? { themeId, targetCount: themeTargetCount } : {}),
        }),
      });
      const reply = await response.json().catch(() => null) as { ok?: boolean; message?: string; grouping?: unknown } | null;
      const next = parseMesaNewOutputGrouping(reply?.grouping);
      if (!response.ok || !reply?.ok || !next) throw new Error(reply?.message || "Não foi possível guardar o planeamento.");
      pendingCommand.current = null;
      setGrouping(next);
      setTargetValue(next.targetCount === null ? "" : String(next.targetCount));
      setThemeValues(Object.fromEntries(next.themes.map((theme) => (
        [theme.themeId, theme.targetCount === null ? "" : String(theme.targetCount)]
      ))));
      setSelectedGroupIds([]);
      if (action === "materialize_new_output_groups") {
        setMessage("Estrutura confirmada. A abrir a configuração editorial…");
        router.refresh();
      } else {
        setMessage(action === "set_theme_new_count" ? "Quantidade do Tema guardada." : "Planeamento guardado.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível guardar o planeamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.newOutputPlanner} aria-label="Planeamento dos artigos desta Produção">
      <div className={styles.outputCount}>
        <div className={styles.fixtureTotals}>
          <span><strong>ARTIGOS EXISTENTES</strong><b>{grouping.existingOutputs.length}</b></span>
          {grouping.themes.map((theme) => (
            <span key={theme.themeId}><strong>NOVOS · {theme.title}</strong><b>{theme.targetCount ?? "—"}</b></span>
          ))}
          {grouping.looseSourceIds.length > 0 ? <span><strong>NOVOS · MATERIAL SOLTO</strong><b>{grouping.targetCount ?? "—"}</b></span> : null}
          <span><strong>TOTAL</strong><b>{totalsResolved ? `${totalCount} artigos` : "Por definir"}</b></span>
        </div>
      </div>

      <details className={styles.groupingSelection} open={planned}>
        <summary>
          <span><strong>Ver seleção</strong><small>Definir os novos artigos sem retirar material da Produção</small></span>
          <span>{newCount} {newCount === 1 ? "novo artigo" : "novos artigos"}</span>
        </summary>
        <div className={styles.groupingBody}>
          {grouping.themes.length > 0 ? <div className={styles.fixtureThemeList} aria-label="Temas desta Produção">
            {grouping.themes.map((theme) => <section key={theme.themeId} className={styles.fixtureThemeCard}>
              <span>Tema</span>
              <h3>{theme.title}</h3>
              <p>{theme.seedSourceIds.length} fontes congeladas · contexto editorial comum</p>
              <label>Novos artigos
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={themeValues[theme.themeId] ?? ""}
                  disabled={!planned || busy}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setThemeValues((current) => ({ ...current, [theme.themeId]: value }));
                  }}
                />
              </label>
              <button
                type="button"
                disabled={!planned || busy || (themeValues[theme.themeId] ?? "").trim() === ""
                  || !Number.isSafeInteger(Number(themeValues[theme.themeId]))
                  || Number(themeValues[theme.themeId]) < 0 || Number(themeValues[theme.themeId]) > 30
                  || Number(themeValues[theme.themeId]) === theme.targetCount}
                onClick={() => void command("set_theme_new_count", [], theme.themeId)}
              >Definir quantidade</button>
              <small>Os novos artigos partem deste Tema; não é necessário distribuir as fontes.</small>
            </section>)}
          </div> : null}

          {grouping.looseSourceIds.length > 0 ? <>
            <div className={styles.looseGroupingHeader}>
              <div><span>Material solto</span><strong>{grouping.looseSourceIds.length} fontes · {looseGroups.length} grupos · objetivo {grouping.targetCount ?? "por definir"}</strong></div>
              <label>Novos artigos
                <input
                  aria-label="Número de novos artigos para material solto"
                  type="number"
                  min={0}
                  max={Math.min(30, grouping.looseSourceIds.length)}
                  value={targetValue}
                  disabled={!planned || busy}
                  onChange={(event) => setTargetValue(event.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                disabled={!planned || busy || targetValue.trim() === "" || !Number.isSafeInteger(Number(targetValue))
                  || Number(targetValue) < 0 || Number(targetValue) > Math.min(30, grouping.looseSourceIds.length)
                  || Number(targetValue) === grouping.targetCount}
                onClick={() => void command("set_new_output_target")}
              >Definir objetivo</button>
            </div>
            {grouping.targetCount !== null ? (
              <p className={gap === 0 ? styles.groupingReady : styles.groupingGuidance} role="status">
                {gap === 0
                  ? "A conta do material solto está resolvida."
                  : Number(gap) > 0
                    ? `Agrupa fontes para reduzir ${gap} ${gap === 1 ? "artigo" : "artigos"}.`
                    : `Separa grupos para criar ${Math.abs(Number(gap))} ${Math.abs(Number(gap)) === 1 ? "artigo" : "artigos"} adicional.`}
              </p>
            ) : <p className={styles.groupingGuidance}>Define primeiro o objetivo para o material solto.</p>}

            <div className={styles.groupingToolbar}>
              <button type="button" disabled={!planned || busy || selectedGroupIds.length < 2}
                onClick={() => void command("merge_new_output_groups", selectedGroupIds)}>
                Agrupar num artigo
              </button>
              <button type="button" disabled={!planned || busy || selectedGroupIds.length !== 1
                || (looseGroups.find((group) => group.groupId === selectedGroupIds[0])?.seedSourceIds.length ?? 0) < 2}
                onClick={() => void command("split_new_output_group", selectedGroupIds)}>
                Separar
              </button>
            </div>

            <ol className={styles.newOutputGroups}>
              {looseGroups.map((group, index) => {
                const selected = selectedGroupIds.includes(group.groupId);
                return (
                  <li key={group.groupId} data-selected={selected} data-size={group.seedSourceIds.length}>
                    <label className={styles.groupSelector}>
                      <input type="checkbox" checked={selected} disabled={!planned || busy}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSelectedGroupIds((current) => checked
                            ? [...current, group.groupId]
                            : current.filter((id) => id !== group.groupId));
                        }} />
                      <span><strong>Artigo {String(index + 1).padStart(2, "0")}</strong><small>{group.seedSourceIds.length} {group.seedSourceIds.length === 1 ? "fonte" : "fontes"}</small></span>
                    </label>
                    <div className={styles.groupSources}>
                      {group.seedSourceIds.map((sourceId) => {
                        const source = sourceById.get(sourceId);
                        if (!source) return null;
                        return (
                          <article key={source.newsroomArticleId}>
                            {source.imageUrl ? <img src={source.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                              : <span className={styles.groupSourceFallback} aria-hidden="true">J</span>}
                            <span><small>{source.sourceLabel}</small><strong>{source.title}</strong></span>
                          </article>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ol>
          </> : null}

          <p className={styles.groupingFootnote}>Os grupos definem apenas o ponto de partida editorial. As fontes efetivamente usadas serão registadas quando os artigos forem produzidos.</p>
          {ready ? <button
            className={styles.materializeGroups}
            type="button"
            disabled={busy}
            onClick={() => void command("materialize_new_output_groups")}
          >Confirmar {newCount} {newCount === 1 ? "novo artigo" : "novos artigos"}</button> : null}
          {!ready && totalsResolved ? <p className={styles.groupingGuidance}>Resolve a quantidade do material solto antes de confirmar a estrutura.</p> : null}
          {message ? <p className={styles.productionMessage} role="status" aria-live="polite">{message}</p> : null}
        </div>
      </details>
    </section>
  );
}
