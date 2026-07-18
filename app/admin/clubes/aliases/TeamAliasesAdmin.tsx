"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./team-aliases.module.css";

type CountryOption = {
  id: string;
  name: string;
  flagEmoji: string | null;
};

type TeamOption = {
  id: string;
  name: string;
  shortName: string | null;
  code: string | null;
  countryId: string;
};

type AliasStatus = "active" | "inactive";
type StatusFilter = AliasStatus | "all";

type TeamAlias = {
  id: string;
  teamId: string;
  alias: string;
  normalizedAlias: string;
  source: string;
  status: AliasStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  teamName: string;
  teamShortName: string | null;
  teamSlug: string;
  teamCode: string | null;
  countryId: string;
};

type MutationPayload =
  | { action: "create"; teamId: string; alias: string }
  | { action: "update"; aliasId: string; alias: string }
  | { action: "deactivate"; aliasId: string }
  | { action: "reactivate"; aliasId: string };

type MutationResult = {
  outcome: "changed" | "noop";
  mutation: {
    id: string;
    teamId: string;
    alias: string;
    normalizedAlias: string;
    status: AliasStatus;
    changed: boolean;
    code: string;
  };
};

type TeamAliasesAdminProps = {
  apiAvailable: boolean;
  countries: CountryOption[];
  teams: TeamOption[];
  initialError: string | null;
};

class AliasRequestError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AliasRequestError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isTeamAlias(value: unknown): value is TeamAlias {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.teamId === "string" &&
    typeof value.alias === "string" &&
    typeof value.normalizedAlias === "string" &&
    typeof value.source === "string" &&
    (value.status === "active" || value.status === "inactive") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.createdBy === "string" &&
    typeof value.updatedBy === "string" &&
    typeof value.teamName === "string" &&
    isNullableString(value.teamShortName) &&
    typeof value.teamSlug === "string" &&
    isNullableString(value.teamCode) &&
    typeof value.countryId === "string"
  );
}

function isMutationResult(value: unknown): value is MutationResult {
  if (!isRecord(value) || (value.outcome !== "changed" && value.outcome !== "noop") || !isRecord(value.mutation)) {
    return false;
  }

  const mutation = value.mutation;
  return (
    typeof mutation.id === "string" &&
    typeof mutation.teamId === "string" &&
    typeof mutation.alias === "string" &&
    typeof mutation.normalizedAlias === "string" &&
    (mutation.status === "active" || mutation.status === "inactive") &&
    typeof mutation.changed === "boolean" &&
    typeof mutation.code === "string" &&
    mutation.changed === (value.outcome === "changed")
  );
}

function isLoginRedirect(response: Response) {
  if (!response.redirected) {
    return false;
  }

  try {
    return new URL(response.url).pathname.startsWith("/admin/login");
  } catch {
    return false;
  }
}

async function readSuccessfulPayload(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 401 || response.status === 403 || isLoginRedirect(response)) {
    throw new AliasRequestError("authentication-required");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AliasRequestError("invalid-api-response");
  }

  if (!isRecord(payload)) {
    throw new AliasRequestError("invalid-api-response");
  }

  if (!response.ok || payload.ok !== true) {
    const code = typeof payload.error === "string" ? payload.error : `http-${response.status}`;
    throw new AliasRequestError(code);
  }

  return payload;
}

function requestErrorMessage(error: unknown, operation: "read" | "mutation") {
  const code = error instanceof AliasRequestError ? error.code : "network-error";

  switch (code) {
    case "authentication-required":
    case "http-401":
    case "http-403":
      return "A sessão administrativa terminou. Inicia sessão novamente para continuar.";
    case "missing-service":
      return "A gestão de aliases está temporariamente indisponível.";
    case "team-alias-conflict-other-team":
      return "Este alias já está associado a outro clube.";
    case "team-alias-conflict-canonical-other-team":
      return "Este alias coincide com a identidade canónica de outro clube.";
    case "team-alias-conflict":
      return "Este alias entra em conflito com uma identidade existente.";
    case "team-alias-duplicate":
      return "O clube já tem este alias.";
    case "team-alias-redundant-canonical-identity":
      return "O alias repete o nome, sigla, código ou slug do próprio clube.";
    case "team-alias-team-not-found":
    case "team-alias-reference-not-found":
    case "team-alias-not-found":
      return "O clube ou alias deixou de estar disponível. Atualiza a listagem e tenta novamente.";
    case "team-alias-team-not-in-country":
      return "O clube selecionado não pertence ao país indicado.";
    case "team-alias-alias-required":
      return "Escreve um alias antes de continuar.";
    case "team-alias-alias-too-long":
      return "O alias não pode exceder 160 caracteres.";
    case "team-alias-normalized-alias-empty":
      return "O alias tem de conter pelo menos uma letra ou um número.";
    case "team-alias-read-failed":
      return "Não foi possível carregar os aliases. Tenta novamente.";
    case "team-alias-rpc-invalid-response":
    case "team-alias-mutation-failed":
      return "Não foi possível confirmar a alteração. Tenta novamente.";
    case "invalid-api-response":
      return "A resposta do servidor não pôde ser validada. Atualiza a página e tenta novamente.";
    default:
      return operation === "read"
        ? "Não foi possível carregar os aliases. Tenta novamente."
        : "Não foi possível concluir a alteração. Tenta novamente.";
  }
}

function mutationSuccessMessage(result: MutationResult, action: MutationPayload["action"]) {
  if (result.outcome === "noop") {
    switch (result.mutation.code) {
      case "noop_existing_active":
        return "Sem alterações: este alias já existe e está ativo.";
      case "noop_existing_inactive":
        return "Sem alterações: este alias já existe e está inativo.";
      case "noop_unchanged":
        return "Sem alterações: o texto do alias já tinha este valor.";
      case "noop_already_inactive":
        return "Sem alterações: o alias já estava inativo.";
      case "noop_already_active":
        return "Sem alterações: o alias já estava ativo.";
      default:
        return "O pedido foi confirmado, mas não exigiu alterações.";
    }
  }

  if (action === "create") {
    return "Alias criado com sucesso.";
  }

  if (action === "update") {
    return "Alias atualizado com sucesso.";
  }

  if (action === "deactivate") {
    return "Alias desativado. Permanece disponível no histórico.";
  }

  return "Alias reativado e novamente disponível para reconhecimento.";
}

function sourceLabel(source: string) {
  if (source === "admin_manual") {
    return "Manual no backoffice";
  }

  if (source === "legacy_seed") {
    return "Dados existentes";
  }

  return "Outra origem";
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Data indisponível";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function teamOptionLabel(team: TeamOption) {
  const shortName = team.shortName || team.code;
  return shortName ? `${team.name} (${shortName})` : team.name;
}

function isAborted(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function TeamAliasesAdmin({
  apiAvailable,
  countries,
  teams,
  initialError
}: TeamAliasesAdminProps) {
  const [countryId, setCountryId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [aliases, setAliases] = useState<TeamAlias[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createTeamId, setCreateTeamId] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState("");
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const mutationLocked = useRef(false);

  const teamsForCountry = useMemo(
    () => teams.filter((team) => team.countryId === countryId),
    [countryId, teams]
  );
  const selectedCreateTeam = useMemo(
    () => teamsForCountry.find((team) => team.id === createTeamId) ?? null,
    [createTeamId, teamsForCountry]
  );

  const loadAliases = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = requestSequence.current + 1;
      requestSequence.current = sequence;

      if (!apiAvailable || !countryId) {
        setAliases([]);
        setListError(null);
        setIsLoading(false);
        return false;
      }

      setIsLoading(true);
      setListError(null);
      setAliases([]);

      try {
        const searchParams = new URLSearchParams({ countryId, status });
        if (teamId) {
          searchParams.set("teamId", teamId);
        }

        const response = await fetch(`/api/admin/team-aliases?${searchParams.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal
        });
        const payload = await readSuccessfulPayload(response);

        if (!Array.isArray(payload.aliases) || !payload.aliases.every(isTeamAlias)) {
          throw new AliasRequestError("invalid-api-response");
        }

        const nextAliases = payload.aliases as TeamAlias[];
        if (nextAliases.some((alias) => alias.countryId !== countryId)) {
          throw new AliasRequestError("invalid-api-response");
        }

        if (sequence === requestSequence.current) {
          setAliases(nextAliases);
        }
        return true;
      } catch (error) {
        if (isAborted(error)) {
          return false;
        }

        if (sequence === requestSequence.current) {
          setAliases([]);
          setListError(requestErrorMessage(error, "read"));
        }
        return false;
      } finally {
        if (sequence === requestSequence.current) {
          setIsLoading(false);
        }
      }
    },
    [apiAvailable, countryId, status, teamId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadAliases(controller.signal);
    return () => controller.abort();
  }, [loadAliases]);

  function changeCountry(nextCountryId: string) {
    setCountryId(nextCountryId);
    setTeamId("");
    setCreateTeamId("");
    setEditingAliasId(null);
    setEditAlias("");
    setActionError(null);
    setNotice(null);
  }

  async function postMutation(payload: MutationPayload): Promise<MutationResult> {
    const response = await fetch("/api/admin/team-aliases", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await readSuccessfulPayload(response);

    if (!isMutationResult(result)) {
      throw new AliasRequestError("invalid-api-response");
    }

    return result;
  }

  async function executeMutation(
    payload: MutationPayload,
    key: string,
    afterSuccess?: () => void
  ) {
    if (mutationLocked.current) {
      return;
    }

    mutationLocked.current = true;
    setMutationKey(key);
    setActionError(null);
    setNotice(null);

    try {
      const result = await postMutation(payload);
      afterSuccess?.();
      await loadAliases();
      setNotice(mutationSuccessMessage(result, payload.action));
    } catch (error) {
      setActionError(requestErrorMessage(error, "mutation"));
    } finally {
      mutationLocked.current = false;
      setMutationKey(null);
    }
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const alias = newAlias.trim();

    if (!countryId || !selectedCreateTeam) {
      setActionError("Seleciona o país e o clube canónico antes de criar o alias.");
      return;
    }

    if (!alias) {
      setActionError("Escreve o novo alias antes de continuar.");
      return;
    }

    if (Array.from(alias).length > 160) {
      setActionError("O alias não pode exceder 160 caracteres.");
      return;
    }

    void executeMutation(
      { action: "create", teamId: selectedCreateTeam.id, alias },
      "create",
      () => setNewAlias("")
    );
  }

  function startEditing(alias: TeamAlias) {
    if (mutationLocked.current || isLoading) {
      return;
    }

    setEditingAliasId(alias.id);
    setEditAlias(alias.alias);
    setActionError(null);
    setNotice(null);
  }

  function cancelEditing() {
    setEditingAliasId(null);
    setEditAlias("");
  }

  function handleUpdate(event: FormEvent<HTMLFormElement>, alias: TeamAlias) {
    event.preventDefault();
    const nextAlias = editAlias.trim();

    if (!nextAlias) {
      setActionError("O texto do alias é obrigatório.");
      return;
    }

    if (Array.from(nextAlias).length > 160) {
      setActionError("O alias não pode exceder 160 caracteres.");
      return;
    }

    const confirmed = window.confirm(
      `Confirmar a alteração do alias “${alias.alias}” para “${nextAlias}” no clube ${alias.teamName}?`
    );
    if (!confirmed) {
      return;
    }

    void executeMutation(
      { action: "update", aliasId: alias.id, alias: nextAlias },
      alias.id,
      cancelEditing
    );
  }

  function changeAliasStatus(alias: TeamAlias) {
    const isDeactivate = alias.status === "active";
    const confirmed = window.confirm(
      isDeactivate
        ? `Desativar o alias “${alias.alias}” de ${alias.teamName}? Deixará de ser usado no reconhecimento, mas permanecerá no histórico.`
        : `Reativar o alias “${alias.alias}” de ${alias.teamName}? Voltará a ser usado no reconhecimento.`
    );
    if (!confirmed) {
      return;
    }

    const payload: MutationPayload = isDeactivate
      ? { action: "deactivate", aliasId: alias.id }
      : { action: "reactivate", aliasId: alias.id };
    void executeMutation(payload, alias.id);
  }

  const requestsPending = isLoading || mutationKey !== null;
  const createDisabled =
    !apiAvailable ||
    requestsPending ||
    !countryId ||
    !selectedCreateTeam ||
    !newAlias.trim() ||
    Array.from(newAlias.trim()).length > 160;

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Jornada.pt</p>
          <h1>Aliases dos clubes</h1>
          <span>
            Os aliases reconhecem variantes de nomes e encaminham-nas para o clube canónico. Não alteram o nome
            apresentado no site.
          </span>
        </div>
        <a className={styles.backLink} href="/admin/clubes">Voltar a Clubes</a>
      </header>

      {initialError ? <div className={`${styles.message} ${styles.error}`} role="alert">{initialError}</div> : null}
      {notice ? <div className={`${styles.message} ${styles.success}`} role="status">{notice}</div> : null}
      {actionError ? <div className={`${styles.message} ${styles.error}`} role="alert">{actionError}</div> : null}

      <section className={styles.panel} aria-labelledby="alias-filters-title">
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Consulta</p>
            <h2 id="alias-filters-title">Filtrar aliases</h2>
          </div>
          <span>Escolhe primeiro um país para carregar a listagem.</span>
        </header>
        <div className={styles.filterGrid}>
          <label className={styles.field}>
            <span>País</span>
            <select
              disabled={!apiAvailable || mutationKey !== null}
              onChange={(event) => changeCountry(event.target.value)}
              required
              value={countryId}
            >
              <option value="">Selecionar país</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.flagEmoji ? `${country.flagEmoji} ` : ""}{country.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Clube</span>
            <select
              disabled={!apiAvailable || !countryId || mutationKey !== null}
              onChange={(event) => {
                setTeamId(event.target.value);
                setEditingAliasId(null);
                setActionError(null);
                setNotice(null);
              }}
              value={teamId}
            >
              <option value="">Todos os clubes</option>
              {teamsForCountry.map((team) => (
                <option key={team.id} value={team.id}>{teamOptionLabel(team)}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Estado</span>
            <select
              disabled={!apiAvailable || !countryId || mutationKey !== null}
              onChange={(event) => {
                setStatus(event.target.value as StatusFilter);
                setEditingAliasId(null);
                setActionError(null);
                setNotice(null);
              }}
              value={status}
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="create-alias-title">
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Nova variante</p>
            <h2 id="create-alias-title">Criar alias</h2>
          </div>
          <span>O clube é escolhido explicitamente; não existem sugestões por semelhança.</span>
        </header>
        <form className={styles.createForm} onSubmit={handleCreate}>
          <label className={styles.field}>
            <span>País</span>
            <select
              disabled={!apiAvailable || mutationKey !== null}
              onChange={(event) => changeCountry(event.target.value)}
              required
              value={countryId}
            >
              <option value="">Selecionar país</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.flagEmoji ? `${country.flagEmoji} ` : ""}{country.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Clube canónico</span>
            <select
              disabled={!apiAvailable || !countryId || mutationKey !== null}
              onChange={(event) => {
                setCreateTeamId(event.target.value);
                setActionError(null);
                setNotice(null);
              }}
              required
              value={createTeamId}
            >
              <option value="">Selecionar clube</option>
              {teamsForCountry.map((team) => (
                <option key={team.id} value={team.id}>{teamOptionLabel(team)}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Novo alias</span>
            <input
              disabled={!apiAvailable || mutationKey !== null}
              maxLength={160}
              onChange={(event) => {
                setNewAlias(event.target.value);
                setActionError(null);
                setNotice(null);
              }}
              placeholder="Ex.: Sporting Lisboa"
              required
              type="text"
              value={newAlias}
            />
          </label>
          <button className={styles.primaryButton} disabled={createDisabled} type="submit">
            {mutationKey === "create" ? "A criar…" : "Criar alias"}
          </button>
        </form>
        <div className={styles.canonicalNotice} aria-live="polite">
          {selectedCreateTeam ? (
            <>
              O novo alias será ligado a <strong>{teamOptionLabel(selectedCreateTeam)}</strong>.
            </>
          ) : (
            "Seleciona explicitamente o clube canónico antes de criar o alias."
          )}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="alias-list-title" aria-busy={isLoading}>
        <header className={styles.panelHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Reconhecimento</p>
            <h2 id="alias-list-title">Aliases registados</h2>
          </div>
          <span>{countryId && !isLoading && !listError ? `${aliases.length} aliases na seleção atual` : ""}</span>
        </header>

        {!countryId ? <div className={styles.emptyState}>Seleciona um país para carregar os aliases.</div> : null}
        {countryId && isLoading ? <div className={styles.loadingState} role="status">A carregar aliases…</div> : null}
        {countryId && !isLoading && listError ? <div className={`${styles.inlineMessage} ${styles.error}`} role="alert">{listError}</div> : null}
        {countryId && !isLoading && !listError && aliases.length === 0 ? (
          <div className={styles.emptyState}>Não existem aliases para os filtros selecionados.</div>
        ) : null}

        {countryId && !isLoading && !listError && aliases.length > 0 ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Clube canónico</th>
                  <th>Alias</th>
                  <th>Chave normalizada</th>
                  <th>Origem</th>
                  <th>Estado</th>
                  <th>Atualizado</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {aliases.map((alias) => {
                  const isEditing = editingAliasId === alias.id;
                  const editFormId = `edit-team-alias-${alias.id}`;
                  const rowPending = mutationKey === alias.id;

                  return (
                    <tr key={alias.id}>
                      <td>
                        <strong>{alias.teamName}</strong>
                        {alias.teamShortName || alias.teamCode ? (
                          <small>{alias.teamShortName || alias.teamCode}</small>
                        ) : null}
                      </td>
                      <td className={styles.aliasCell}>
                        {isEditing ? (
                          <input
                            aria-label={`Editar alias de ${alias.teamName}`}
                            autoFocus
                            className={styles.editInput}
                            disabled={requestsPending}
                            form={editFormId}
                            maxLength={160}
                            onChange={(event) => setEditAlias(event.target.value)}
                            required
                            value={editAlias}
                          />
                        ) : (
                          alias.alias
                        )}
                      </td>
                      <td><code>{alias.normalizedAlias}</code></td>
                      <td>{sourceLabel(alias.source)}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${alias.status === "active" ? styles.active : styles.inactive}`}>
                          {alias.status === "active" ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td>{formatUpdatedAt(alias.updatedAt)}</td>
                      <td>
                        {isEditing ? (
                          <div className={styles.actions}>
                            <form id={editFormId} onSubmit={(event) => handleUpdate(event, alias)}>
                              <button className={styles.primaryButton} disabled={requestsPending} type="submit">
                                {rowPending ? "A guardar…" : "Confirmar alteração"}
                              </button>
                            </form>
                            <button className={styles.secondaryButton} disabled={requestsPending} onClick={cancelEditing} type="button">
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className={styles.actions}>
                            <button className={styles.secondaryButton} disabled={requestsPending} onClick={() => startEditing(alias)} type="button">
                              Editar
                            </button>
                            <button
                              className={alias.status === "active" ? styles.dangerButton : styles.primaryButton}
                              disabled={requestsPending}
                              onClick={() => changeAliasStatus(alias)}
                              type="button"
                            >
                              {rowPending ? "A confirmar…" : alias.status === "active" ? "Desativar" : "Reativar"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
