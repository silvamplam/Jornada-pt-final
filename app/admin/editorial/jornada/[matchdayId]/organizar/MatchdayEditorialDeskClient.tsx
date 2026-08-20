"use client";

import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import {
  MATCHDAY_DESK_GROUPS,
  MATCHDAY_DESK_OPENING_GROUP,
  applyDeskPlacementSelection,
  buildMatchdayDeskApplyArticles,
  isMatchdayDeskOpeningPlacementKey,
  placementGroupForKey,
  placementLabelForKey,
  placeDeskArticleInSlot,
  setDeskLatestMembership,
  swapDeskArticleToSlot,
  type MatchdayDeskBlockedPlacement,
  type MatchdayDeskDesiredState,
  type MatchdayDeskDestination,
  type MatchdayDeskSnapshot,
} from "@/lib/editorial-matchday-desk-model";

type DeskHistoryEntry = {
  desired: MatchdayDeskDesiredState;
  faixaVisible: boolean;
};

type DeskFilter = "all" | "latest" | "latest_without_zone" | "opening" | "four_news" | "six_news" | "five_news_balanced" | "five_news_secondary" | "faixa" | "video_highlight" | "unplaced";
type DeskDestinationChoice = MatchdayDeskDestination | `slot::${string}`;

type DeskMapGroupDefinition = {
  key: string;
  label: string;
  description: string;
  slots: readonly { key: string; label: string }[];
};

const openingSourceGroupKeys = new Set(["headline", "highlights", "side_block"]);
const MATCHDAY_DESK_MAP_GROUPS: DeskMapGroupDefinition[] = MATCHDAY_DESK_GROUPS.filter(
  (group) => group.key !== "faixa"
    && group.key !== "complement"
    && !openingSourceGroupKeys.has(group.key),
);

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


export default function MatchdayEditorialDeskClient({ snapshot }: { snapshot: MatchdayDeskSnapshot }) {
  const initialDesired = useMemo(() => initialDesiredState(snapshot), [snapshot]);
  const [desired, setDesired] = useState<MatchdayDeskDesiredState>(() => initialDesired);
  const [baseDesired, setBaseDesired] = useState<MatchdayDeskDesiredState>(() => initialDesired);
  const [faixaVisible, setFaixaVisible] = useState(snapshot.faixaVisible);
  const [baseFaixaVisible, setBaseFaixaVisible] = useState(snapshot.faixaVisible);
  const [revision, setRevision] = useState(snapshot.revision);
  const [stateToken, setStateToken] = useState(snapshot.stateToken);
  const [isManaged, setIsManaged] = useState(snapshot.isManaged);
  const [isApplying, setIsApplying] = useState(false);
  const [resolvingPlacementKey, setResolvingPlacementKey] = useState<string | null>(null);
  const [canonicalChoiceByPlacement, setCanonicalChoiceByPlacement] = useState<Record<string, string>>(
    () => Object.fromEntries(
      snapshot.blockedPlacements
        .filter((blocked) => blocked.suggestedArticleIds.length > 0)
        .map((blocked) => [
          blocked.placementKey,
          blocked.suggestedArticleIds[0],
        ] as const),
    ),
  );
  const [initialConflictsResolved, setInitialConflictsResolved] = useState(false);
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
      const initial = baseDesired[article.id];
      return state?.inLatest !== initial?.inLatest || state?.placementKey !== initial?.placementKey;
    }).length,
    [baseDesired, desired, snapshot.articles],
  );

  const pendingCount = pendingArticleCount
    + (faixaVisible === baseFaixaVisible ? 0 : 1)
    + (initialConflictsResolved
      ? 0
      : snapshot.articles.filter((article) => article.placementConflictKeys.length > 0).length)
    + (isManaged ? 0 : 1);

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

  function commitPlacement(nextDesired: MatchdayDeskDesiredState, nextMessage: string) {
    commit(nextDesired, faixaVisible, nextMessage);
    setSelectedIds([]);
    setDestination("");
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
        commitPlacement(
          next,
          `Coloca\u00e7\u00e3o planeada em ${placementLabelForKey(targetPlacementKey)}.`,
        );
        return;
      }
      const next = applyDeskPlacementSelection(desired, selectedIds, destination as MatchdayDeskDestination);
      commitPlacement(next, "Colocação planeada. A ordem de seleção define a primeira ordem da zona.");
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
    if (desiredStatesEqual(desired, baseDesired) && faixaVisible === baseFaixaVisible) return;
    setHistory((items) => [...items, { desired, faixaVisible }]);
    setDesired(baseDesired);
    setFaixaVisible(baseFaixaVisible);
    setMessage("Planeamento reposto no estado atual da jornada.");
  }

  function toggleFaixaVisibility() {
    commit(desired, !faixaVisible, !faixaVisible ? "Faixa marcada como pública." : "Faixa marcada como oculta.");
  }

  async function resolveBlockedPlacement(
    blocked: MatchdayDeskBlockedPlacement,
    action: "activate" | "remove" | "associate",
  ) {
    if (resolvingPlacementKey) return;

    const articleId = action === "associate"
      ? canonicalChoiceByPlacement[blocked.placementKey] ?? ""
      : "";

    if (action === "associate" && !articleId) {
      setMessage("Escolhe primeiro o artigo canónico correto.");
      return;
    }

    setResolvingPlacementKey(blocked.placementKey);
    setMessage(
      action === "activate"
        ? "A ativar o conteúdo nesta zona…"
        : action === "associate"
          ? "A associar o artigo canónico escolhido…"
          : "A retirar o conteúdo desta zona…",
    );

    try {
      const response = await fetch(
        `/api/admin/editorial/jornada/${snapshot.matchdayId}/organizar/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placementKey: blocked.placementKey,
            action,
            articleId: action === "associate" ? articleId : undefined,
          }),
        },
      );

      const result = await response.json() as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || result.ok !== true) {
        setMessage(result.message ?? "Não foi possível resolver esta situação.");
        return;
      }

      window.location.reload();
    } catch {
      setMessage("Não foi possível contactar a resolução da Mesa.");
    } finally {
      setResolvingPlacementKey(null);
    }
  }

  function renderCanonicalResolution(blocked: MatchdayDeskBlockedPlacement) {
    if (!blocked.canAssociate) return null;

    const selectedArticleId = canonicalChoiceByPlacement[blocked.placementKey] ?? "";
    const suggestedIds = new Set(blocked.suggestedArticleIds);

    const suggestedCandidates = snapshot.canonicalCandidates.filter(
      (candidate) => suggestedIds.has(candidate.id),
    );

    const otherCandidates = snapshot.canonicalCandidates.filter(
      (candidate) => !suggestedIds.has(candidate.id),
    );

    return (
      <div style={{ display: "grid", gap: 6 }}>
        <select
          value={selectedArticleId}
          disabled={resolvingPlacementKey !== null}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            setCanonicalChoiceByPlacement((current) => ({
              ...current,
              [blocked.placementKey]: event.target.value,
            }))
          }
        >
          <option value="">Escolher artigo canónico…</option>

          {suggestedCandidates.length > 0 ? (
            <optgroup label="Sugestões">
              {suggestedCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title} · /noticias/{candidate.slug}
                </option>
              ))}
            </optgroup>
          ) : null}

          <optgroup label="Todos os artigos publicados">
            {otherCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title} · /noticias/{candidate.slug}
              </option>
            ))}
          </optgroup>
        </select>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={resolvingPlacementKey !== null || !selectedArticleId}
            onClick={() => resolveBlockedPlacement(blocked, "associate")}
          >
            Associar artigo canónico
          </button>

          {blocked.canRemove ? (
            <button
              type="button"
              disabled={resolvingPlacementKey !== null}
              onClick={() => resolveBlockedPlacement(blocked, "remove")}
            >
              Retirar da zona
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  async function applyChanges() {
    if (snapshot.blockedPlacements.length > 0) {
      setMessage("Resolve primeiro as situações assinaladas na própria Mesa.");
      return;
    }
    if (!stateToken) {
      setMessage("A infraestrutura da Mesa ainda não está disponível. A migration tem de ser aplicada primeiro.");
      return;
    }

    setIsApplying(true);
    setMessage("A aplicar o estado final da Jornada…");
    try {
      const response = await fetch(`/api/admin/editorial/jornada/${snapshot.matchdayId}/organizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision,
          stateToken,
          faixaVisible,
          articles: buildMatchdayDeskApplyArticles(desired),
        }),
      });
      const result = await response.json() as {
        ok: boolean;
        message?: string;
        revision?: number;
        stateToken?: string;
      };
      if (!response.ok || !result.ok || !Number.isSafeInteger(result.revision) || !result.stateToken) {
        setMessage(result.message ?? "Não foi possível aplicar as alterações da Mesa.");
        return;
      }

      setBaseDesired(desired);
      setBaseFaixaVisible(faixaVisible);
      setRevision(result.revision as number);
      setStateToken(result.stateToken);
      setIsManaged(true);
      setInitialConflictsResolved(true);
      setHistory([]);
      setSelectedIds([]);
      setMessage("Alterações aplicadas. A página viva usa agora este estado editorial.");
    } catch {
      setMessage("Não foi possível contactar a aplicação da Mesa.");
    } finally {
      setIsApplying(false);
    }
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
      if (filter === "latest_without_zone") return Boolean(state?.inLatest) && !state?.placementKey;
      if (filter === "opening") return isMatchdayDeskOpeningPlacementKey(state?.placementKey);
      if (filter === "four_news") return group === "four_news";
      if (filter === "six_news") return group === "six_news";
      if (filter === "five_news_balanced") return group === "five_news_balanced";
      if (filter === "five_news_secondary") return group === "five_news_secondary";
      if (filter === "faixa") return group === "faixa";
      if (filter === "video_highlight") return group === "complement";
      if (filter === "unplaced") return !state?.inLatest && !state?.placementKey;

      return true;
    });
  }, [desired, filter, search, snapshot.articles]);

  const filteredVideos = useMemo(() => {
    if (filter !== "all" && filter !== "video_highlight") {
      return [];
    }

    const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");

    return snapshot.videos.filter((video) =>
      !normalizedSearch
      || video.title.toLocaleLowerCase("pt-PT").includes(normalizedSearch)
      || (video.label ?? "").toLocaleLowerCase("pt-PT").includes(normalizedSearch)
    );
  }, [filter, search, snapshot.videos]);

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

  function renderFixedGroup(group: DeskMapGroupDefinition) {
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

  function renderVideoComplementGroup() {
    const complementArticleId = ownerByPlacement.get("complement") ?? null;

    return (
      <section className="desk-zone desk-video-complement-zone" aria-label="A Jornada em Vídeo + Destaque da Jornada">
        <header>
          <div>
            <h3>A Jornada em Vídeo + Destaque da Jornada</h3>
            <p>Vídeos publicados e destaque editorial da mesma zona viva.</p>
          </div>
          <span>
            {snapshot.videos.length} {snapshot.videos.length === 1 ? "vídeo" : "vídeos"} · 1 posição
          </span>
        </header>
        <div className="desk-video-complement-layout">
          <section className="desk-video-panel" aria-label="Vídeos da Jornada">
            <small>Vídeo(s) da Jornada</small>
            {snapshot.videos.length > 0 ? (
              <div className="desk-map-video-list">
                {snapshot.videos.map((video) => (
                  <article className="desk-map-video-card" key={`map-video:${video.id}`}>
                    <span>
                      <em>VÍDEO</em>
                      {video.duration ? <b>{video.duration}</b> : null}
                    </span>
                    <strong>{video.title}</strong>
                    {video.subtitle ? <p>{video.subtitle}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <span className="desk-slot-empty">Sem vídeos publicados</span>
            )}
          </section>
          <div
            className="desk-slot desk-complement-slot"
            onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
            onDrop={() => dropOnSlot("complement")}
          >
            <small>Destaque da Jornada</small>
            {complementArticleId
              ? renderPlacedArticle(complementArticleId, "complement")
              : <span className="desk-slot-empty">Livre</span>}
          </div>
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
            <strong>{filteredArticles.length + filteredVideos.length}/{snapshot.articles.length + snapshot.videos.length}</strong>
          </div>
          <div className="desk-filters" aria-label="Filtros">
            {([
              ["all", "Todas"],
              ["latest", "Últimas"],
              ["latest_without_zone", "Sem zona nas Últimas"],
              ["opening", "Abertura"],
              ["four_news", "4 notícias"],
              ["six_news", "6 notícias"],
              ["five_news_balanced", "5 notícias principais"],
              ["five_news_secondary", "5 notícias secundárias"],
              ["faixa", "Faixa"],
              ["video_highlight", "Vídeo + Destaque"],
              ["unplaced", "Sem colocação"],
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
              <optgroup label={MATCHDAY_DESK_OPENING_GROUP.label}>
                {MATCHDAY_DESK_OPENING_GROUP.slots.map((slot) => (
                  <option key={slot.key} value={`slot::${slot.key}`}>{slot.label}</option>
                ))}
              </optgroup>
              {MATCHDAY_DESK_GROUPS.filter((group) => !openingSourceGroupKeys.has(group.key)).map((group) => (
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

          {filteredVideos.map((video) => (
            <article className="desk-article-row" key={`video:${video.id}`}>
              <span />
              <span className="desk-selection-rank empty">▶</span>
              {video.imageUrl ? (
                <img alt="" src={video.imageUrl} />
              ) : (
                <span className="desk-image-placeholder" />
              )}
              <span className="desk-article-copy">
                <span className="desk-article-meta">
                  <em>VÍDEO</em>
                  {video.duration ? <span>{video.duration}</span> : null}
                </span>
                <strong>{video.title}</strong>
                {video.subtitle ? <span>{video.subtitle}</span> : null}
                <small>A JORNADA EM VÍDEO</small>
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="desk-map" aria-label="Mapa editorial planeado">
        <div className="desk-map-summary">
          <div><span>Últimas</span><strong>{latestCount}</strong></div>
          <div><span>Sem zona editorial</span><strong>{noEditorialCount}</strong></div>
          <div><span>Sem colocação</span><strong>{trulyUnplacedCount}</strong></div>
          <div><span>Alteradas</span><strong>{pendingArticleCount}</strong></div>
        </div>

        {renderFixedGroup(MATCHDAY_DESK_OPENING_GROUP)}
        {MATCHDAY_DESK_MAP_GROUPS.map(renderFixedGroup)}

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

        {renderVideoComplementGroup()}

        {snapshot.blockedPlacements.length > 0 ? (
          <section className="desk-warning">
            <strong>
              {snapshot.blockedPlacements.length}{" "}
              {snapshot.blockedPlacements.length === 1
                ? "situação atual precisa de resolução"
                : "situações atuais precisam de resolução"}
            </strong>
            <p>
              O Apply continua protegido até estas situações ficarem resolvidas.
              Nenhum conteúdo será apagado silenciosamente.
            </p>

            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {snapshot.blockedPlacements.map((blocked) => (
                <article
                  key={blocked.placementKey}
                  style={{
                    display: "grid",
                    gap: 4,
                    padding: 7,
                    border: "1px solid rgba(120, 93, 25, .22)",
                    borderRadius: 5,
                    background: "rgba(255,255,255,.58)",
                  }}
                >
                  <small style={{ fontWeight: 900 }}>
                    {placementLabelForKey(blocked.placementKey)}
                  </small>

                  <strong>{blocked.title}</strong>
                  <span style={{ fontSize: 10 }}>{blocked.reason}</span>

                  {blocked.kind === "inactive" ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {blocked.canActivate ? (
                        <button
                          type="button"
                          disabled={resolvingPlacementKey !== null}
                          onClick={() => resolveBlockedPlacement(blocked, "activate")}
                        >
                          Ativar nesta zona
                        </button>
                      ) : null}

                      {blocked.canRemove ? (
                        <button
                          type="button"
                          disabled={resolvingPlacementKey !== null}
                          onClick={() => resolveBlockedPlacement(blocked, "remove")}
                        >
                          Retirar da zona
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {blocked.kind === "canonical_missing"
                    || blocked.kind === "canonical_conflict"
                    ? renderCanonicalResolution(blocked)
                    : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>

      <footer className="desk-pending-bar">
        <div>
          <strong>{pendingCount} alterações pendentes</strong>
          <span>{isManaged ? `Jornada gerida pela Mesa · revisão ${revision}` : "O primeiro Apply passa a gerir esta Jornada pela Mesa."}</span>
        </div>
        <button type="button" onClick={undo} disabled={history.length === 0}>Desfazer última</button>
        <button
          type="button"
          onClick={reset}
          disabled={pendingArticleCount === 0 && faixaVisible === baseFaixaVisible}
        >
          Limpar alterações
        </button>
        <button
          className="apply"
          type="button"
          onClick={applyChanges}
          disabled={isApplying || pendingCount === 0 || snapshot.blockedPlacements.length > 0 || !stateToken}
        >
          {isApplying ? "A aplicar…" : "Aplicar alterações"}
        </button>
      </footer>
    </div>
  );
}
