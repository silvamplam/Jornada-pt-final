"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  suggestAdminTeamPublicName,
  type AdminTeamPublicNameSuggestion
} from "@/lib/admin-team-public-name-suggestion";
import {
  isTeamPublicNameBatchApplyResponse,
  isTeamPublicNameBatchErrorResponse,
  isTeamPublicNameBatchPreviewResponse,
  TEAM_PUBLIC_NAME_BATCH_MAX_BODY_BYTES,
  TEAM_PUBLIC_NAME_BATCH_MAX_ROWS,
  TEAM_PUBLIC_NAME_MAX_CHARACTERS,
  type TeamPublicNameBatchApplyResponse,
  type TeamPublicNameApplyStatus,
  type TeamPublicNameBatchClientRequest,
  type TeamPublicNameBatchPreviewResponse,
  type TeamPublicNamePreviewStatus
} from "@/lib/team-public-name-batch-policy";
import type {
  AdminTeamPublicNameCompetition,
  AdminTeamPublicNameCountry,
  AdminTeamPublicNameTeam
} from "@/lib/supabase";
import TeamSafeDeletion from "./TeamSafeDeletion";
import styles from "./team-public-name-manager.module.css";

const PAGE_SIZE = 50;
const SEARCH_MAX_CHARACTERS = 120;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const PUBLIC_NAME_STATUSES = new Set(["missing", "present", "all"]);
const SORT_OPTIONS = new Set(["name-asc", "name-desc"]);

type TeamPublicNameManagerProps = {
  teams: AdminTeamPublicNameTeam[];
  competitions: AdminTeamPublicNameCompetition[];
  countries: AdminTeamPublicNameCountry[];
  disabled: boolean;
};

type PublicNameSuccessResponse = {
  ok: true;
  teamId: string;
  publicName: string | null;
  changed: boolean;
  action: "save" | "clear" | "noop";
  message: string;
};

type PublicNameErrorResponse = {
  ok: false;
  code: string;
  message: string;
};

type SaveFeedback = {
  tone: "success" | "error";
  message: string;
};

function normalizeForSearch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-PT")
    .trim();
}

function trimSqlSpaces(value: string): string {
  return value.replace(/^ +| +$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPublicNameSuccessResponse(value: unknown): value is PublicNameSuccessResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    typeof value.teamId === "string" &&
    (typeof value.publicName === "string" || value.publicName === null) &&
    typeof value.changed === "boolean" &&
    (value.action === "save" || value.action === "clear" || value.action === "noop") &&
    typeof value.message === "string"
  );
}

function isPublicNameErrorResponse(value: unknown): value is PublicNameErrorResponse {
  return (
    isRecord(value) &&
    value.ok === false &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

function confidenceLabel(suggestion: AdminTeamPublicNameSuggestion): string {
  if (suggestion.confidence === "high") {
    return "Confiança alta";
  }

  if (suggestion.confidence === "medium") {
    return "Confiança média";
  }

  return "Confiança baixa";
}

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/u.test(value)) {
    return 1;
  }

  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function publicNameLabel(value: string | null): string {
  return value ?? "Sem nome público";
}

function previewStatusLabel(status: TeamPublicNamePreviewStatus): string {
  if (status === "set") {
    return "Novo nome";
  }
  if (status === "update") {
    return "Atualização";
  }
  if (status === "clear") {
    return "Limpeza";
  }
  if (status === "noop") {
    return "Sem alteração";
  }
  if (status === "not_found") {
    return "Clube não encontrado";
  }
  return "Inválido";
}

function applyStatusLabel(status: TeamPublicNameApplyStatus): string {
  if (status === "set") {
    return "Nome definido";
  }
  if (status === "updated") {
    return "Nome atualizado";
  }
  if (status === "cleared") {
    return "Nome limpo";
  }
  if (status === "noop") {
    return "Sem alteração";
  }
  return "Erro";
}

function hasSameUniqueTeamIds(expectedTeamIds: string[], actualTeamIds: string[]): boolean {
  const expected = new Set(expectedTeamIds);
  const actual = new Set(actualTeamIds);
  return (
    expected.size === expectedTeamIds.length &&
    actual.size === actualTeamIds.length &&
    expected.size === actual.size &&
    Array.from(expected).every((teamId) => actual.has(teamId))
  );
}

export default function TeamPublicNameManager({
  teams,
  competitions,
  countries,
  disabled
}: TeamPublicNameManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();
  const rawQuery = searchParams.get("q") ?? "";
  const queryFromUrl = rawQuery.slice(0, SEARCH_MAX_CHARACTERS);
  const competitionValues = useMemo(
    () => new Set(competitions.map((competition) => competition.id)),
    [competitions]
  );
  const countryValues = useMemo(() => new Set(countries.map((country) => country.key)), [countries]);
  const rawCompetition = searchParams.get("competition");
  const rawCountry = searchParams.get("country");
  const rawPublicNameStatus = searchParams.get("publicNameStatus");
  const rawSort = searchParams.get("sort");
  const rawPage = searchParams.get("page");
  const competitionFilter =
    rawCompetition === "none" || (rawCompetition && competitionValues.has(rawCompetition))
      ? rawCompetition
      : "all";
  const countryFilter =
    rawCountry === "missing" || (rawCountry && countryValues.has(rawCountry)) ? rawCountry : "all";
  const publicNameStatus =
    rawPublicNameStatus && PUBLIC_NAME_STATUSES.has(rawPublicNameStatus) ? rawPublicNameStatus : "missing";
  const sort = rawSort && SORT_OPTIONS.has(rawSort) ? rawSort : "name-asc";
  const requestedPage = parsePage(rawPage);
  const [queryInput, setQueryInput] = useState(queryFromUrl);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(teams.map((team) => [team.id, team.publicName ?? ""]))
  );
  const [currentPublicNames, setCurrentPublicNames] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(teams.map((team) => [team.id, team.publicName]))
  );
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(() => new Set());
  const [batchPreview, setBatchPreview] = useState<TeamPublicNameBatchPreviewResponse | null>(null);
  const [batchResult, setBatchResult] = useState<TeamPublicNameBatchApplyResponse | null>(null);
  const [batchLoading, setBatchLoading] = useState<"preview" | "apply" | null>(null);
  const [deletedTeamIds, setDeletedTeamIds] = useState<Set<string>>(() => new Set());
  const saveLockRef = useRef(false);
  const batchLockRef = useRef(false);
  const mountedRef = useRef(true);
  const requestControllerRef = useRef<AbortController | null>(null);
  const batchRequestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestControllerRef.current?.abort();
      batchRequestControllerRef.current?.abort();
    };
  }, []);

  const navigate = useCallback(
    (updates: Record<string, string | null>, replace = false) => {
      const next = new URLSearchParams(searchString);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }

      const query = next.toString();
      const target = query ? `${pathname}?${query}` : pathname;
      if (replace) {
        router.replace(target, { scroll: false });
      } else {
        router.push(target, { scroll: false });
      }
    },
    [pathname, router, searchString]
  );

  useEffect(() => {
    setQueryInput(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    if (queryInput === queryFromUrl) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      navigate({ q: queryInput.slice(0, SEARCH_MAX_CHARACTERS), page: "1" });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [navigate, queryFromUrl, queryInput]);

  useEffect(() => {
    const corrections: Record<string, string | null> = {};

    if (rawQuery !== queryFromUrl) {
      corrections.q = queryFromUrl;
    }
    if (rawCompetition && competitionFilter === "all") {
      corrections.competition = null;
    }
    if (rawCountry && countryFilter === "all") {
      corrections.country = null;
    }
    if (rawPublicNameStatus && !PUBLIC_NAME_STATUSES.has(rawPublicNameStatus)) {
      corrections.publicNameStatus = null;
    }
    if (rawSort && !SORT_OPTIONS.has(rawSort)) {
      corrections.sort = null;
    }
    if (rawPage && parsePage(rawPage) === 1 && rawPage !== "1") {
      corrections.page = "1";
    }

    if (Object.keys(corrections).length > 0) {
      navigate(corrections, true);
    }
  }, [
    competitionFilter,
    countryFilter,
    navigate,
    queryFromUrl,
    rawCompetition,
    rawCountry,
    rawPage,
    rawPublicNameStatus,
    rawQuery,
    rawSort
  ]);

  const suggestions = useMemo(
    () => new Map(teams.map((team) => [team.id, suggestAdminTeamPublicName({ name: team.name })])),
    [teams]
  );

  const filteredTeams = useMemo(() => {
    const normalizedQuery = normalizeForSearch(queryInput);
    const filtered = teams.filter((team) => {
      if (deletedTeamIds.has(team.id)) {
        return false;
      }
      const publicName = currentPublicNames[team.id];
      const matchesQuery =
        !normalizedQuery ||
        [team.name, publicName, team.shortName, team.slug].some((value) =>
          normalizeForSearch(value).includes(normalizedQuery)
        );
      const matchesCompetition =
        competitionFilter === "all" ||
        (competitionFilter === "none"
          ? team.competitions.length === 0
          : team.competitions.some((competition) => competition.id === competitionFilter));
      const matchesCountry =
        countryFilter === "all" ||
        (countryFilter === "missing"
          ? team.resolvedCountry.source === "missing"
          : team.resolvedCountry.key === countryFilter);
      const hasPublicName = Boolean(publicName);
      const matchesStatus =
        publicNameStatus === "all" ||
        (publicNameStatus === "present" ? hasPublicName : !hasPublicName);

      return matchesQuery && matchesCompetition && matchesCountry && matchesStatus;
    });

    return filtered.sort((left, right) => {
      const comparison = left.name.localeCompare(right.name, "pt-PT", { sensitivity: "base" });
      return sort === "name-desc" ? -comparison : comparison;
    });
  }, [
    competitionFilter,
    countryFilter,
    currentPublicNames,
    deletedTeamIds,
    publicNameStatus,
    queryInput,
    sort,
    teams
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / PAGE_SIZE));
  const page = queryInput === queryFromUrl ? Math.min(requestedPage, totalPages) : 1;
  const pageTeams = filteredTeams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedTeams = useMemo(
    () => teams.filter((team) => selectedTeamIds.has(team.id)),
    [selectedTeamIds, teams]
  );
  const selectedVisibleCount = pageTeams.filter((team) => selectedTeamIds.has(team.id)).length;
  const batchBusy = batchLoading !== null;
  const previewBlocksApply = Boolean(
    batchPreview &&
      (batchPreview.summary.invalid > 0 ||
        batchPreview.summary.notFound > 0 ||
        batchPreview.rows.some((row) => row.snapshot === null))
  );

  useEffect(() => {
    if (queryInput === queryFromUrl && requestedPage !== page) {
      navigate({ page: String(page) }, true);
    }
  }, [navigate, page, queryFromUrl, queryInput, requestedPage]);

  const returnTo = `${pathname}${searchString ? `?${searchString}` : ""}#clubes-existentes`;

  function updateFilter(key: string, value: string) {
    navigate({ [key]: value, page: "1" });
  }

  function resetFilters() {
    setQueryInput("");
    navigate({
      q: null,
      competition: null,
      country: null,
      publicNameStatus: "missing",
      sort: "name-asc",
      page: "1"
    });
  }

  function invalidateBatchReview() {
    setBatchPreview(null);
    setBatchResult(null);
  }

  function handleTeamDeleted(teamId: string, teamName: string) {
    setDeletedTeamIds((current) => new Set(current).add(teamId));
    setSelectedTeamIds((current) => {
      const next = new Set(current);
      next.delete(teamId);
      return next;
    });
    invalidateBatchReview();
    setFeedback({ tone: "success", message: `Clube removido com sucesso: ${teamName}.` });
    router.refresh();
  }

  function toggleTeamSelection(teamId: string) {
    if (batchBusy || savingTeamId !== null) {
      return;
    }

    const next = new Set(selectedTeamIds);
    if (next.has(teamId)) {
      next.delete(teamId);
    } else {
      if (next.size >= TEAM_PUBLIC_NAME_BATCH_MAX_ROWS) {
        setFeedback({
          tone: "error",
          message: `Só é possível selecionar ${TEAM_PUBLIC_NAME_BATCH_MAX_ROWS} clubes por lote.`
        });
        return;
      }
      next.add(teamId);
    }

    setSelectedTeamIds(next);
    invalidateBatchReview();
  }

  function selectVisibleTeams() {
    if (batchBusy || savingTeamId !== null) {
      return;
    }

    const next = new Set(selectedTeamIds);
    for (const team of pageTeams) {
      next.add(team.id);
    }
    if (next.size > TEAM_PUBLIC_NAME_BATCH_MAX_ROWS) {
      setFeedback({
        tone: "error",
        message: `A seleção visível ultrapassaria o limite de ${TEAM_PUBLIC_NAME_BATCH_MAX_ROWS} clubes. Desmarque outros clubes primeiro.`
      });
      return;
    }

    setSelectedTeamIds(next);
    invalidateBatchReview();
  }

  function deselectVisibleTeams() {
    if (batchBusy || savingTeamId !== null) {
      return;
    }

    const next = new Set(selectedTeamIds);
    for (const team of pageTeams) {
      next.delete(team.id);
    }
    setSelectedTeamIds(next);
    invalidateBatchReview();
  }

  function clearSelection() {
    if (batchBusy || savingTeamId !== null) {
      return;
    }

    setSelectedTeamIds(new Set());
    invalidateBatchReview();
  }

  function buildPreviewRequest(): TeamPublicNameBatchClientRequest {
    return {
      action: "preview",
      rows: selectedTeams.map((team) => ({
        teamId: team.id,
        publicName: drafts[team.id] ?? currentPublicNames[team.id] ?? ""
      }))
    };
  }

  function serializeBatchRequest(request: TeamPublicNameBatchClientRequest): string | null {
    const body = JSON.stringify(request);
    if (new TextEncoder().encode(body).byteLength > TEAM_PUBLIC_NAME_BATCH_MAX_BODY_BYTES) {
      setFeedback({
        tone: "error",
        message: "O pedido excede o limite permitido. Reduza os valores antes de continuar."
      });
      return null;
    }
    return body;
  }

  async function readBatchResponse(response: Response): Promise<unknown> {
    if (response.redirected && new URL(response.url).pathname === "/admin/login") {
      window.location.assign(response.url);
      return null;
    }

    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function previewSelectedTeams() {
    if (
      disabled ||
      selectedTeams.length === 0 ||
      selectedTeams.length > TEAM_PUBLIC_NAME_BATCH_MAX_ROWS ||
      saveLockRef.current ||
      batchLockRef.current
    ) {
      return;
    }

    const request = buildPreviewRequest();
    const body = serializeBatchRequest(request);
    if (!body) {
      return;
    }

    batchLockRef.current = true;
    setBatchLoading("preview");
    setBatchPreview(null);
    setBatchResult(null);
    setFeedback(null);
    const controller = new AbortController();
    batchRequestControllerRef.current = controller;

    try {
      const response = await fetch("/api/admin/teams/public-names/batch", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body,
        signal: controller.signal
      });
      const payload = await readBatchResponse(response);

      if (!response.ok) {
        throw new Error(
          isTeamPublicNameBatchErrorResponse(payload)
            ? payload.message
            : "Não foi possível pré-visualizar os nomes públicos."
        );
      }
      if (
        !isTeamPublicNameBatchPreviewResponse(payload) ||
        !hasSameUniqueTeamIds(
          selectedTeams.map((team) => team.id),
          payload.rows.map((row) => row.teamId)
        )
      ) {
        throw new Error("O servidor devolveu uma pré-visualização inválida.");
      }
      if (!mountedRef.current) {
        return;
      }

      setBatchPreview(payload);
      setFeedback({
        tone: payload.summary.invalid > 0 || payload.summary.notFound > 0 ? "error" : "success",
        message:
          payload.summary.invalid > 0 || payload.summary.notFound > 0
            ? "A pré-visualização contém linhas que têm de ser corrigidas ou removidas."
            : "Pré-visualização concluída. Nenhum dado foi gravado."
      });
    } catch (error) {
      if (!mountedRef.current || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível pré-visualizar o lote."
      });
    } finally {
      if (mountedRef.current) {
        setBatchLoading(null);
      }
      batchRequestControllerRef.current = null;
      batchLockRef.current = false;
    }
  }

  async function applyPreviewedTeams() {
    if (
      disabled ||
      !batchPreview ||
      previewBlocksApply ||
      saveLockRef.current ||
      batchLockRef.current
    ) {
      return;
    }

    const snapshots = batchPreview.rows.flatMap((row) => (row.snapshot ? [row.snapshot] : []));
    if (snapshots.length !== batchPreview.summary.total) {
      setFeedback({ tone: "error", message: "A pré-visualização já não pode ser aplicada." });
      return;
    }

    const confirmed = window.confirm(
      [
        `Aplicar alterações a ${batchPreview.summary.total} clubes?`,
        `Novos nomes: ${batchPreview.summary.sets}.`,
        `Atualizações: ${batchPreview.summary.updates}.`,
        `Limpezas: ${batchPreview.summary.clears}.`,
        "Cada clube alterado será auditado individualmente.",
        "A aplicação não é uma transação global e pode terminar com sucessos parciais."
      ].join("\n")
    );
    if (!confirmed) {
      return;
    }

    const request: TeamPublicNameBatchClientRequest = {
      action: "apply",
      rows: snapshots.map((snapshot) => ({
        teamId: snapshot.teamId,
        publicName: snapshot.publicName ?? "",
        expectedPublicName: snapshot.expectedPublicName
      }))
    };
    const body = serializeBatchRequest(request);
    if (!body) {
      return;
    }

    batchLockRef.current = true;
    setBatchLoading("apply");
    setFeedback(null);
    const controller = new AbortController();
    batchRequestControllerRef.current = controller;

    try {
      const response = await fetch("/api/admin/teams/public-names/batch", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body,
        signal: controller.signal
      });
      const payload = await readBatchResponse(response);

      if (
        response.status === 409 &&
        isTeamPublicNameBatchErrorResponse(payload) &&
        payload.preview
      ) {
        if (!mountedRef.current) {
          return;
        }
        setCurrentPublicNames((current) => {
          const next = { ...current };
          for (const row of payload.preview?.rows ?? []) {
            if (row.canonicalName !== null) {
              next[row.teamId] = row.currentPublicName;
            }
          }
          return next;
        });
        setBatchPreview(payload.preview);
        setBatchResult(null);
        setFeedback({
          tone: "error",
          message: "Um ou mais nomes foram alterados desde a última pré-visualização. Reveja novamente antes de confirmar."
        });
        return;
      }

      if (!response.ok) {
        throw new Error(
          isTeamPublicNameBatchErrorResponse(payload)
            ? payload.message
            : "Não foi possível aplicar os nomes públicos."
        );
      }
      if (
        !isTeamPublicNameBatchApplyResponse(payload) ||
        !hasSameUniqueTeamIds(
          snapshots.map((snapshot) => snapshot.teamId),
          payload.rows.map((row) => row.teamId)
        )
      ) {
        throw new Error("O servidor devolveu um resultado de aplicação inválido.");
      }
      if (!mountedRef.current) {
        return;
      }

      const completedIds = new Set(
        payload.rows.filter((row) => row.status !== "error").map((row) => row.teamId)
      );
      setCurrentPublicNames((current) => {
        const next = { ...current };
        for (const row of payload.rows) {
          if (row.status !== "error") {
            next[row.teamId] = row.publicName;
          }
        }
        return next;
      });
      setDrafts((current) => {
        const next = { ...current };
        for (const row of payload.rows) {
          if (row.status !== "error") {
            next[row.teamId] = row.publicName ?? "";
          }
        }
        return next;
      });
      setSelectedTeamIds((current) => {
        const next = new Set(current);
        for (const teamId of completedIds) {
          next.delete(teamId);
        }
        return next;
      });
      setBatchResult(payload);
      setBatchPreview(null);
      setFeedback({
        tone: payload.summary.errors > 0 ? "error" : "success",
        message:
          payload.summary.errors > 0
            ? `Lote concluído com ${payload.summary.succeeded} clubes processados e ${payload.summary.errors} erros. As linhas falhadas permanecem selecionadas.`
            : `Lote concluído. ${payload.summary.succeeded} clubes processados sem erros.`
      });
    } catch (error) {
      if (!mountedRef.current || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível aplicar o lote."
      });
    } finally {
      if (mountedRef.current) {
        setBatchLoading(null);
      }
      batchRequestControllerRef.current = null;
      batchLockRef.current = false;
    }
  }

  async function savePublicName(event: FormEvent<HTMLFormElement>, team: AdminTeamPublicNameTeam) {
    event.preventDefault();
    if (disabled || saveLockRef.current || batchLockRef.current) {
      return;
    }

    const draft = drafts[team.id] ?? "";
    const finalValue = trimSqlSpaces(draft) || null;
    if (
      (finalValue !== null && Array.from(finalValue).length > TEAM_PUBLIC_NAME_MAX_CHARACTERS) ||
      (finalValue !== null && CONTROL_CHARACTER_PATTERN.test(finalValue))
    ) {
      setFeedback({
        tone: "error",
        message: `O nome público de ${team.name} é inválido. Usa no máximo 80 caracteres e não incluas caracteres de controlo.`
      });
      return;
    }

    if (
      currentPublicNames[team.id] !== null &&
      finalValue === null &&
      !window.confirm(`Limpar o nome público de ${team.name}?`)
    ) {
      return;
    }

    invalidateBatchReview();
    saveLockRef.current = true;
    setSavingTeamId(team.id);
    setFeedback(null);
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const response = await fetch(`/api/admin/teams/${encodeURIComponent(team.id)}/public-name`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ publicName: draft }),
        signal: controller.signal
      });

      if (response.redirected && new URL(response.url).pathname === "/admin/login") {
        window.location.assign(response.url);
        return;
      }

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(
          isPublicNameErrorResponse(payload) ? payload.message : "Não foi possível guardar o nome público."
        );
      }

      if (!isPublicNameSuccessResponse(payload) || payload.teamId !== team.id) {
        throw new Error("O servidor devolveu uma resposta inválida ao guardar o nome público.");
      }

      if (!mountedRef.current) {
        return;
      }

      setCurrentPublicNames((current) => ({ ...current, [team.id]: payload.publicName }));
      setDrafts((current) => ({ ...current, [team.id]: payload.publicName ?? "" }));
      setFeedback({ tone: "success", message: payload.message });
    } catch (error) {
      if (!mountedRef.current || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível guardar o nome público."
      });
    } finally {
      if (mountedRef.current) {
        setSavingTeamId(null);
      }
      requestControllerRef.current = null;
      saveLockRef.current = false;
    }
  }

  return (
    <section className={styles.manager} id="clubes-existentes">
      <header className={styles.header}>
        <div>
          <h2>Clubes existentes</h2>
          <p>Gerir os nomes públicos e abrir os restantes dados apenas quando necessário.</p>
        </div>
        <strong>{teams.length - deletedTeamIds.size} clubes carregados</strong>
      </header>

      <div className={styles.filters}>
        <div className={styles.filterField}>
          <label htmlFor="team-public-name-search">Pesquisar</label>
          <input
            autoComplete="off"
            id="team-public-name-search"
            onChange={(event) => setQueryInput(event.target.value.slice(0, SEARCH_MAX_CHARACTERS))}
            placeholder="Nome, nome público, sigla ou slug"
            type="search"
            value={queryInput}
          />
        </div>

        <div className={styles.filterField}>
          <label htmlFor="team-public-name-competition">Competição</label>
          <select
            id="team-public-name-competition"
            onChange={(event) => updateFilter("competition", event.target.value)}
            value={competitionFilter}
          >
            <option value="all">Todas as competições</option>
            <option value="none">Sem competição</option>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.name}{competition.isCurrent ? " — atual" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterField}>
          <label htmlFor="team-public-name-country">País</label>
          <select
            id="team-public-name-country"
            onChange={(event) => updateFilter("country", event.target.value)}
            value={countryFilter}
          >
            <option value="all">Todos os países</option>
            <option value="missing">Sem país</option>
            {countries
              .filter((country) => country.source !== "missing")
              .map((country) => (
                <option key={country.key} value={country.key}>
                  {country.name}{country.source === "legacy" ? " — legacy" : ""}
                </option>
              ))}
          </select>
        </div>

        <div className={styles.filterField}>
          <label htmlFor="team-public-name-status">Estado do nome público</label>
          <select
            id="team-public-name-status"
            onChange={(event) => updateFilter("publicNameStatus", event.target.value)}
            value={publicNameStatus}
          >
            <option value="missing">Sem nome público</option>
            <option value="present">Com nome público</option>
            <option value="all">Todos os clubes</option>
          </select>
        </div>

        <div className={styles.filterField}>
          <label htmlFor="team-public-name-sort">Ordenar</label>
          <select id="team-public-name-sort" onChange={(event) => updateFilter("sort", event.target.value)} value={sort}>
            <option value="name-asc">Nome A–Z</option>
            <option value="name-desc">Nome Z–A</option>
          </select>
        </div>

        <button className={styles.resetButton} onClick={resetFilters} type="button">
          Repor filtros
        </button>
      </div>

      <div className={styles.summary}>
        <span>{filteredTeams.length} clubes encontrados</span>
        <span>Página {page} de {totalPages}</span>
        <span>50 clubes por página</span>
      </div>

      <div className={styles.batchActions}>
        <div className={styles.selectionSummary}>
          <strong>{selectedTeamIds.size} clubes selecionados</strong>
          <span>Máximo de {TEAM_PUBLIC_NAME_BATCH_MAX_ROWS} clubes por lote. A seleção mantém-se entre páginas e filtros.</span>
        </div>
        <div className={styles.batchButtons}>
          <button
            disabled={disabled || batchBusy || savingTeamId !== null || pageTeams.length === 0}
            onClick={selectVisibleTeams}
            type="button"
          >
            Selecionar visíveis
          </button>
          <button
            disabled={disabled || batchBusy || savingTeamId !== null || selectedVisibleCount === 0}
            onClick={deselectVisibleTeams}
            type="button"
          >
            Desmarcar visíveis
          </button>
          <button
            disabled={disabled || batchBusy || savingTeamId !== null || selectedTeamIds.size === 0}
            onClick={clearSelection}
            type="button"
          >
            Limpar seleção
          </button>
          <button
            disabled={disabled || batchBusy || savingTeamId !== null || selectedTeamIds.size === 0}
            onClick={() => void previewSelectedTeams()}
            type="button"
          >
            {batchLoading === "preview" ? "A pré-visualizar…" : "Pré-visualizar selecionados"}
          </button>
          <button
            disabled={
              disabled ||
              batchBusy ||
              savingTeamId !== null ||
              !batchPreview ||
              previewBlocksApply
            }
            onClick={() => void applyPreviewedTeams()}
            type="button"
          >
            {batchLoading === "apply" ? "A aplicar…" : "Aplicar alterações confirmadas"}
          </button>
        </div>
      </div>

      <div aria-live="polite" className={styles.liveRegion} role="status">
        {feedback ? (
          <p className={feedback.tone === "success" ? styles.successMessage : styles.errorMessage}>
            {feedback.message}
          </p>
        ) : null}
      </div>

      {batchPreview ? (
        <section className={styles.batchPanel} aria-labelledby="team-public-name-preview-title">
          <div className={styles.batchPanelHeader}>
            <div>
              <h3 id="team-public-name-preview-title">Pré-visualização do lote</h3>
              <p>Nenhum dado foi gravado. Reveja os valores antes da confirmação.</p>
            </div>
            <div className={styles.batchCounters}>
              <span>Novos: {batchPreview.summary.sets}</span>
              <span>Atualizações: {batchPreview.summary.updates}</span>
              <span>Limpezas: {batchPreview.summary.clears}</span>
              <span>Sem alteração: {batchPreview.summary.noops}</span>
              <span>Inválidos: {batchPreview.summary.invalid}</span>
              <span>Não encontrados: {batchPreview.summary.notFound}</span>
            </div>
          </div>
          {previewBlocksApply ? (
            <p className={styles.blockingNotice}>
              Aplicação bloqueada. Corrija o draft ou retire da seleção as linhas inválidas ou não encontradas.
            </p>
          ) : null}
          <div className={styles.batchTableWrapper}>
            <table className={styles.batchTable}>
              <thead>
                <tr>
                  <th scope="col">Clube</th>
                  <th scope="col">Nome anterior</th>
                  <th scope="col">Nome novo</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {batchPreview.rows.map((row) => (
                  <tr key={row.teamId}>
                    <td>{row.canonicalName ?? row.teamId}</td>
                    <td>{publicNameLabel(row.currentPublicName)}</td>
                    <td>{publicNameLabel(row.proposedPublicName)}</td>
                    <td>
                      <span className={styles.statusBadge} data-status={row.status}>
                        {previewStatusLabel(row.status)}
                      </span>
                      {row.message ? <small>{row.message}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {batchResult ? (
        <section className={styles.batchPanel} aria-labelledby="team-public-name-result-title">
          <div className={styles.batchPanelHeader}>
            <div>
              <h3 id="team-public-name-result-title">Resultado da aplicação</h3>
              <p>As linhas com erro permanecem selecionadas para revisão manual.</p>
            </div>
            <div className={styles.batchCounters}>
              <span>Concluídos: {batchResult.summary.succeeded}</span>
              <span>Novos: {batchResult.summary.sets}</span>
              <span>Atualizados: {batchResult.summary.updates}</span>
              <span>Limpos: {batchResult.summary.clears}</span>
              <span>Sem alteração: {batchResult.summary.noops}</span>
              <span>Erros: {batchResult.summary.errors}</span>
            </div>
          </div>
          <div className={styles.batchTableWrapper}>
            <table className={styles.batchTable}>
              <thead>
                <tr>
                  <th scope="col">Clube</th>
                  <th scope="col">Nome público final</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {batchResult.rows.map((row) => (
                  <tr key={row.teamId}>
                    <td>{row.canonicalName}</td>
                    <td>{publicNameLabel(row.publicName)}</td>
                    <td>
                      <span className={styles.statusBadge} data-status={row.status}>
                        {applyStatusLabel(row.status)}
                      </span>
                      <small>{row.message}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className={styles.list}>
        {pageTeams.length === 0 ? (
          <p className={styles.emptyState}>Não existem clubes para os filtros selecionados.</p>
        ) : null}

        {pageTeams.map((team) => {
          const suggestion = suggestions.get(team.id) ?? null;
          const currentPublicName = currentPublicNames[team.id];
          const draft = drafts[team.id] ?? "";
          const isSaving = savingTeamId === team.id;
          const isBusy = savingTeamId !== null || batchBusy;
          const isSelected = selectedTeamIds.has(team.id);
          const helpId = `public-name-help-${team.id}`;

          return (
            <article className={styles.teamCard} key={team.id}>
              <div className={styles.compactRow}>
                <div className={styles.selectionCell}>
                  <input
                    aria-label={`Selecionar ${team.name} para o lote`}
                    checked={isSelected}
                    disabled={
                      disabled ||
                      isBusy ||
                      (!isSelected && selectedTeamIds.size >= TEAM_PUBLIC_NAME_BATCH_MAX_ROWS)
                    }
                    onChange={() => toggleTeamSelection(team.id)}
                    type="checkbox"
                  />
                </div>
                <figure className={styles.crest}>
                  {team.logoUrl ? (
                    <img alt={`Emblema de ${team.name}`} src={team.logoUrl} />
                  ) : (
                    <span>{team.code || team.shortName || "FC"}</span>
                  )}
                </figure>

                <div className={styles.identity}>
                  <h3>{team.name}</h3>
                  <p>/{team.slug}</p>
                  <div className={styles.metadata}>
                    <span>Sigla: {team.shortName || "—"}</span>
                    <span>
                      País: {team.resolvedCountry.name}
                      {team.resolvedCountry.source === "legacy" ? " (legacy)" : ""}
                    </span>
                  </div>
                  <div aria-label={`Competições de ${team.name}`} className={styles.competitions}>
                    {team.competitions.length > 0 ? (
                      team.competitions.map((competition) => (
                        <span className={styles.competitionBadge} key={competition.id}>
                          {competition.name}{competition.isCurrent ? " · atual" : ""}
                        </span>
                      ))
                    ) : (
                      <span className={styles.mutedBadge}>Sem competição</span>
                    )}
                  </div>
                </div>

                <form className={styles.publicNameForm} onSubmit={(event) => void savePublicName(event, team)}>
                  <label htmlFor={`public-name-${team.id}`}>Nome público</label>
                  <input
                    aria-describedby={helpId}
                    autoComplete="off"
                    disabled={disabled || isBusy}
                    id={`public-name-${team.id}`}
                    maxLength={TEAM_PUBLIC_NAME_MAX_CHARACTERS}
                    onChange={(event) => {
                      setDrafts((current) => ({ ...current, [team.id]: event.target.value }));
                      invalidateBatchReview();
                    }}
                    value={draft}
                  />
                  <small id={helpId}>
                    Atual: <strong>{currentPublicName ?? "Sem nome público"}</strong>. Pode ficar vazio para limpar.
                  </small>
                  <button disabled={disabled || isBusy} type="submit">
                    {isSaving ? "A guardar…" : "Guardar nome público"}
                  </button>
                </form>

                <div className={styles.suggestion}>
                  <strong>Sugestão automática — rever</strong>
                  {suggestion?.value ? (
                    <>
                      <span className={styles.suggestionValue}>{suggestion.value}</span>
                      <small>{confidenceLabel(suggestion)}. {suggestion.reason}</small>
                      <button
                        disabled={disabled || isBusy}
                        onClick={() => {
                          setDrafts((current) => ({ ...current, [team.id]: suggestion.value ?? "" }));
                          invalidateBatchReview();
                        }}
                        type="button"
                      >
                        Usar sugestão
                      </button>
                    </>
                  ) : (
                    <small>Sem sugestão segura. {suggestion?.reason}</small>
                  )}
                </div>
              </div>

              <details className={styles.details}>
                <summary>Editar dados completos</summary>
                <form action={`/api/admin/teams/${team.id}`} className={styles.structuralForm} method="post">
                  <input name="return_to" type="hidden" value={returnTo} />
                  <div className={styles.structuralField}>
                    <label htmlFor={`name-${team.id}`}>Nome</label>
                    <input disabled={disabled} id={`name-${team.id}`} name="name" required defaultValue={team.name} />
                  </div>
                  <div className={styles.structuralField}>
                    <label htmlFor={`short-${team.id}`}>Sigla</label>
                    <input
                      disabled={disabled}
                      id={`short-${team.id}`}
                      maxLength={6}
                      name="short_name"
                      required
                      defaultValue={team.shortName}
                    />
                  </div>
                  <div className={styles.structuralField}>
                    <label htmlFor={`slug-${team.id}`}>Slug</label>
                    <input disabled={disabled} id={`slug-${team.id}`} name="slug" required defaultValue={team.slug} />
                  </div>
                  <div className={styles.structuralField}>
                    <label htmlFor={`country-${team.id}`}>País</label>
                    <input
                      disabled={disabled}
                      id={`country-${team.id}`}
                      name="country"
                      defaultValue={team.country ?? ""}
                    />
                  </div>
                  <div className={styles.structuralField}>
                    <label htmlFor={`logo-${team.id}`}>Emblema URL</label>
                    <input
                      disabled={disabled}
                      id={`logo-${team.id}`}
                      name="logo_url"
                      defaultValue={team.logoUrl ?? ""}
                    />
                  </div>
                  <div className={styles.structuralField}>
                    <label htmlFor={`color-${team.id}`}>Cor</label>
                    <input
                      disabled={disabled}
                      id={`color-${team.id}`}
                      name="primary_color"
                      defaultValue={team.primaryColor ?? ""}
                    />
                  </div>
                  <button disabled={disabled || isBusy} type="submit">Guardar dados completos</button>
                </form>
                <TeamSafeDeletion
                  disabled={disabled || isBusy}
                  onDeleted={handleTeamDeleted}
                  teamId={team.id}
                  teamName={team.name}
                />
              </details>
            </article>
          );
        })}
      </div>

      <nav aria-label="Paginação dos clubes" className={styles.pagination}>
        <button
          disabled={page <= 1}
          onClick={() => navigate({ page: String(page - 1) })}
          type="button"
        >
          Anterior
        </button>
        <span>Página {page} de {totalPages}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => navigate({ page: String(page + 1) })}
          type="button"
        >
          Seguinte
        </button>
      </nav>
    </section>
  );
}
