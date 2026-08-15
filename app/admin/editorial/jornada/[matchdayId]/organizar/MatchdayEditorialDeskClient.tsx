"use client";

import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import {
  MATCHDAY_DESK_GROUPS,
  applyDeskPlacementSelection,
  placementGroupForKey,
  placementLabelForKey,
  placeDeskArticleInSlot,
  setDeskLatestMembership,
  swapDeskArticleToSlot,
  type MatchdayDeskDesiredState,
  type MatchdayDeskDestination,
  type MatchdayDeskGroupDefinition,
  type MatchdayDeskSnapshot,
} from "@/lib/editorial-matchday-desk-model";

type DeskHistoryEntry = {
  desired: MatchdayDeskDesiredState;
  faixaVisible: boolean;
};

type DeskFilter = "all" | "latest" | "outside_latest" | "no_editorial" | "unplaced" | "faixa" | "layouts";
type DeskDestinationChoice = MatchdayDeskDestination | `slot::${string}`;

function initialDesiredState(snapshot: MatchdayDeskSnapshot): MatchdayDeskDesiredState {
  return Object.fromEntries(
    snapshot.articles.map((article) => [
      article.id,
      { inLatest: article.inLatest, placementKey: article.placementKey },
    ]),
  );
}

function desiredStatesEqual(left: MatchdayDeskDesiredState, right: MatchdayDeskDesiredState) {
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const id of ids) {
    if (left[id]?.inLatest !== right[id]?.inLatest) return false;
    if (left[id]?.placementKey !== right[id]?.placementKey) return false;
  }
  return true;
}

function placementOrder(key?: string | null) {
  if (!key?.startsWith("important_item:")) return Number.MAX_SAFE_INTEGER;
  const value = Number(key.split(":")[1]);
  return Number.isInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function isLayoutGroup(group: ReturnType<typeof placementGroupForKey>) {
  return group === "four_news"
    || group === "six_news"
    || group === "five_news_balanced"
    || group === "five_news_secondary";
}

export default function MatchdayEditorialDeskClient({ snapshot }: { snapshot: MatchdayDeskSnapshot }) {
  const initialDesired = useMemo(() => initialDesiredState(snapshot), [snapshot]);
  const [desired, setDesired] = useState<MatchdayDeskDesiredState>(() => initialDesired);
  const [faixaVisible, setFaixaVisible] = useState(true);
  const [history, setHistory] = useState<DeskHistoryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [destination, setDestination] = useState<DeskDestinationChoice | "">("");
  const [filter, setFilter] = useState<DeskFilter>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [draggedArticleId, setDraggedArticleId] = useState<string | null>(null);

  const articleById = useMemo(
    () => new Map(snapshot.articles.map((article) => [article.id, article] as const)),
    [snapshot.articles],
  );

  const ownerByPlacement = useMemo(() => {
    const owners = new Map<string, string>();
    Object.entries(desired).forEach(([articleId, state]) => {
      if (state.placementKey) owners.set(state.placementKey, articleId);
    });
    return owners;
  }, [desired]);

  const selectionRank = useMemo(
    () => new Map(selectedIds.map((articleId, index) => [articleId, index + 1] as const)),
    [selectedIds],
  );

  const pendingArticleCount = useMemo(
    () => snapshot.articles.filter((article) => {
      const state = desired[article.id];
      const initial = initialDesired[article.id];
      return state?.inLatest !== initial?.inLatest || state?.placementKey !== initial?.placementKey;
    }).length,
    [desired, initialDesired, snapshot.articles],
  );

  const pendingCount = pendingArticleCount + (faixaVisible ? 0 : 1);

  function commit(nextDesired: MatchdayDeskDesiredState, nextFaixaVisible = faixaVisible, nextMessage = "") {
    if (desiredStatesEqual(nextDesired, desired) && nextFaixaVisible === faixaVisible) {
      if (nextMessage) setMessage(nextMessage);
      return;
    }
    setHistory((items) => [...items, { desired, faixaVisible }]);
    setDesired(nextDesired);
    setFaixaVisible(nextFaixaVisible);
    setMessage(nextMessage);
  }

  function toggleSelection(articleId: string, checked: boolean) {
    setSelectedIds((items) => {
      if (checked) return items.includes(articleId) ? items : [...items, articleId];
      return items.filter((id) => id !== articleId);
    });
  }

  function setLatest(inLatest: boolean) {
    if (selectedIds.length === 0) {
      setMessage("Seleciona primeiro uma ou mais notícias.");
      return;
    }
    commit(
      setDeskLatestMembership(desired, selectedIds, inLatest),
      faixaVisible,
      inLatest ? "As selecionadas ficam em Últimas no estado planeado." : "As selecionadas saem de Últimas no estado planeado.",
    );
  }

  function placeSelected() {
    if (selectedIds.length === 0) {
      setMessage("Seleciona primeiro uma ou mais notícias.");
      return;
    }
    if (!destination) {
      setMessage("Escolhe a zona editorial de destino.");
      return;
    }

    try {
      if (destination.startsWith("slot::")) {
        if (selectedIds.length !== 1) {
          setMessage("Para escolher uma posi\u00e7\u00e3o espec\u00edfica, seleciona apenas uma not\u00edcia.");
          return;
        }

        const targetPlacementKey = destination.slice("slot::".length);
        const next = placeDeskArticleInSlot(desired, selectedIds[0], targetPlacementKey);
        commit(
          next,
          faixaVisible,
          `Coloca\u00e7\u00e3o planeada em ${placementLabelForKey(targetPlacementKey)}.`,
        );
        return;
      }
      const next = applyDeskPlacementSelection(desired, selectedIds, destination as MatchdayDeskDestination);
      commit(next, faixaVisible, "Colocação planeada. A ordem de seleção define a primeira ordem da zona.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível planear esta colocação.");
    }
  }

  function makeTotallyUnplaced() {
    if (selectedIds.length === 0) {
      setMessage("Seleciona primeiro uma ou mais notícias.");
      return;
    }
    const withoutEditorial = applyDeskPlacementSelection(desired, selectedIds, "none");
    const next = setDeskLatestMembership(withoutEditorial, selectedIds, false);
    commit(next, faixaVisible, "As selecionadas ficam em Sem colocação no estado planeado.");
  }

  function dropOnSlot(targetPlacementKey: string) {
    if (!draggedArticleId) return;
    commit(
      swapDeskArticleToSlot(desired, draggedArticleId, targetPlacementKey),
      faixaVisible,
      "Ordem atualizada por arrasto.",
    );
    setDraggedArticleId(null);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setDesired(previous.desired);
    setFaixaVisible(previous.faixaVisible);
    setHistory((items) => items.slice(0, -1));
    setMessage("Última alteração desfeita.");
  }

  function reset() {
    if (desiredStatesEqual(desired, initialDesired) && faixaVisible) return;
    setHistory((items) => [...items, { desired, faixaVisible }]);
    setDesired(initialDesired);
    setFaixaVisible(true);
    setMessage("Planeamento reposto no estado atual da jornada.");
  }

  function toggleFaixaVisibility() {
    commit(desired, !faixaVisible, !faixaVisible ? "Faixa marcada como pública." : "Faixa marcada como oculta.");
  }

  const filteredArticles = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");
    return snapshot.articles.filter((article) => {
      const state = desired[article.id];
      const group = placementGroupForKey(state?.placementKey);
      const searchMatches = !normalizedSearch
        || article.title.toLocaleLowerCase("pt-PT").includes(normalizedSearch)
        || (article.label ?? "").toLocaleLowerCase("pt-PT").includes(normalizedSearch);
      if (!searchMatches) return false;

      if (filter === "latest") return Boolean(state?.inLatest);
      if (filter === "outside_latest") return !state?.inLatest;
      if (filter === "no_editorial") return !state?.placementKey;
      if (filter === "unplaced") return !state?.inLatest && !state?.placementKey;
      if (filter === "faixa") return group === "faixa";
      if (filter === "layouts") return isLayoutGroup(group);
      return true;
    });
  }, [desired, filter, search, snapshot.articles]);

  const latestCount = Object.values(desired).filter((article) => article.inLatest).length;
  const noEditorialCount = Object.values(desired).filter((article) => !article.placementKey).length;
  const trulyUnplacedCount = Object.values(desired).filter((article) => !article.inLatest && !article.placementKey).length;

  function renderArticleStatus(articleId: string) {
    const state = desired[articleId];
    if (!state) return "";
    if (!state.inLatest && !state.placementKey) return "SEM COLOCAÇÃO";
    const latestLabel = state.inLatest ? "ÚLTIMAS" : "FORA DE ÚLTIMAS";
    return `${latestLabel} + ${placementLabelForKey(state.placementKey).toUpperCase()}`;
  }

  function renderPlacedArticle(articleId: string, placementKey: string) {
    const article = articleById.get(articleId);
    if (!article) return null;
    return (
      <article
        className="desk-slot-card occupied"
        draggable
        onDragStart={() => setDraggedArticleId(articleId)}
        onDragEnd={() => setDraggedArticleId(null)}
      >
        <strong>{article.title}</strong>
        <span className="desk-drag-hint">arrastar</span>
        <div
          className="desk-slot-drop-target"
          onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
          onDrop={() => dropOnSlot(placementKey)}
        />
      </article>
    );
  }

  function renderFixedGroup(group: MatchdayDeskGroupDefinition) {
    return (
      <section className="desk-zone" key={group.key}>
        <header>
          <div>
            <h3>{group.label}</h3>
            <p>{group.description}</p>
          </div>
          <span>{group.slots.length} {group.slots.length === 1 ? "posição" : "posições"}</span>
        </header>
        <div className={`desk-zone-slots desk-zone-slots-${group.slots.length}`}>
          {group.slots.map((slot) => {
            const articleId = ownerByPlacement.get(slot.key) ?? null;
            return (
              <div
                className="desk-slot"
                key={slot.key}
                onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
                onDrop={() => dropOnSlot(slot.key)}
              >
                <small>{slot.label}</small>
                {articleId ? renderPlacedArticle(articleId, slot.key) : <span className="desk-slot-empty">Livre</span>}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const faixaArticleIds = Object.entries(desired)
    .filter(([, article]) => placementGroupForKey(article.placementKey) === "faixa")
    .sort((left, right) => placementOrder(left[1].placementKey) - placementOrder(right[1].placementKey))
    .map(([articleId]) => articleId);

  return (
    <div className="desk-workspace">
      <section className="desk-library" aria-label="Notícias publicadas da jornada">
        <div className="desk-library-toolbar">
          <div className="desk-search-row">
            <input
              type="search"
              placeholder="Pesquisar por título ou antetítulo"
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            />
            <strong>{filteredArticles.length}/{snapshot.articles.length}</strong>
          </div>
          <div className="desk-filters" aria-label="Filtros">
            {([
              ["all", "Todas"],
              ["latest", "Últimas"],
              ["outside_latest", "Fora de Últimas"],
              ["no_editorial", "Sem zona"],
              ["unplaced", "Sem colocação"],
              ["layouts", "Layouts"],
              ["faixa", "Faixa"],
            ] as Array<[DeskFilter, string]>).map(([key, label]) => (
              <button className={filter === key ? "active" : ""} key={key} type="button" onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="desk-bulk-bar">
            <strong>{selectedIds.length} selecionadas</strong>
            <button type="button" onClick={() => setLatest(true)}>+ Últimas</button>
            <button type="button" onClick={() => setLatest(false)}>− Últimas</button>
            <select value={destination} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDestination(event.target.value as DeskDestinationChoice | "")}>
              <option value="">{"Colocar em\u2026"}</option>
              <option value="none">{"Sem coloca\u00e7\u00e3o editorial"}</option>
              {MATCHDAY_DESK_GROUPS.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  <option value={group.key}>
                    {group.slots.length > 1 ? "Preencher pela ordem de sele\u00e7\u00e3o" : group.label}
                  </option>
                  {group.slots.length > 1
                    ? group.slots.map((slot) => (
                        <option key={slot.key} value={`slot::${slot.key}`}>{slot.label}</option>
                      ))
                    : null}
                </optgroup>
              ))}
            </select>
            <button className="primary" type="button" onClick={placeSelected}>Colocar</button>
            <button type="button" onClick={makeTotallyUnplaced}>Sem colocação total</button>
            <button type="button" onClick={() => setSelectedIds([])}>Limpar seleção</button>
          </div>
          {message ? <p className="desk-message">{message}</p> : null}
        </div>

        <div className="desk-article-list">
          {filteredArticles.map((article) => {
            const rank = selectionRank.get(article.id) ?? null;
            const hasConflict = article.placementConflictKeys.length > 0;
            return (
              <label className={`desk-article-row ${rank ? "selected" : ""}`} key={article.id}>
                <input
                  type="checkbox"
                  checked={Boolean(rank)}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => toggleSelection(article.id, event.target.checked)}
                />
                {rank ? <b className="desk-selection-rank">{rank}</b> : <span className="desk-selection-rank empty">·</span>}
                {article.imageUrl ? <img alt="" src={article.imageUrl} /> : <span className="desk-image-placeholder" />}
                <span className="desk-article-copy">
                  <span className="desk-article-meta">
                    {article.label ? <em>{article.label}</em> : null}
                    {article.publishedAt ? <time>{new Date(article.publishedAt).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time> : null}
                  </span>
                  <strong>{article.title}</strong>
                  <small>{renderArticleStatus(article.id)}</small>
                  {hasConflict ? <mark>Conflito atual: aparece também em {article.placementConflictKeys.map(placementLabelForKey).join(", ")}</mark> : null}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="desk-map" aria-label="Mapa editorial planeado">
        <div className="desk-map-summary">
          <div><span>Últimas</span><strong>{latestCount}</strong></div>
          <div><span>Sem zona editorial</span><strong>{noEditorialCount}</strong></div>
          <div><span>Sem colocação</span><strong>{trulyUnplacedCount}</strong></div>
          <div><span>Alteradas</span><strong>{pendingArticleCount}</strong></div>
        </div>

        {MATCHDAY_DESK_GROUPS.filter((group) => group.key !== "faixa").map(renderFixedGroup)}

        <section aria-label="Faixa de notícias" className={`desk-zone desk-faixa ${faixaVisible ? "" : "hidden-zone"}`}>
          <header>
            <div>
              <h3>Faixa de notícias</h3>
              <p>Ordem preservada mesmo quando a zona estiver oculta.</p>
            </div>
            <button className={faixaVisible ? "visibility public" : "visibility"} type="button" onClick={toggleFaixaVisibility}>
              {faixaVisible ? "● Pública" : "○ Oculta"}
            </button>
          </header>
          <div className="desk-faixa-slots">
            {faixaArticleIds.length === 0 ? <span className="desk-slot-empty">Sem notícias na Faixa</span> : null}
            {faixaArticleIds.map((articleId, index) => {
              const placementKey = desired[articleId]?.placementKey ?? `important_item:${index + 1}`;
              return (
                <div
                  className="desk-slot desk-faixa-slot"
                  key={articleId}
                  onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
                  onDrop={() => dropOnSlot(placementKey)}
                >
                  <small>{index + 1}</small>
                  {renderPlacedArticle(articleId, placementKey)}
                </div>
              );
            })}
          </div>
        </section>

        {snapshot.blockedPlacements.length > 0 ? (
          <section className="desk-warning">
            <strong>{snapshot.blockedPlacements.length} conteúdos atuais não associados a artigos canónicos</strong>
            <p>Esta primeira Beta não os altera. Continuam protegidos pelo Editorial atual.</p>
          </section>
        ) : null}
      </section>

      <footer className="desk-pending-bar">
        <div>
          <strong>{pendingCount} alterações pendentes</strong>
          <span>Modo de ensaio: a página viva ainda não é alterada.</span>
        </div>
        <button type="button" onClick={undo} disabled={history.length === 0}>Desfazer última</button>
        <button type="button" onClick={reset} disabled={pendingCount === 0}>Limpar alterações</button>
        <button
          className="apply"
          type="button"
          onClick={() => setMessage("Modo de ensaio: nenhuma alteração foi gravada. Se esta organização for rápida e intuitiva, ligamos o Aplicar real na etapa seguinte desta branch.")}
        >
          Aplicar alterações · ensaio
        </button>
      </footer>
    </div>
  );
}