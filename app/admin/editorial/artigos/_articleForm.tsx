import {
  EDITORIAL_CONTEXT_DESTINATION,
  EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS,
  EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS,
} from "@/lib/editorial-context-post-title";

import ExternalArticleImport from "./_externalArticleImport";

export type EditorialArticle = {
  id: string;
  slug: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  label: string | null;
  author: string | null;
  status: string | null;
  scope: string | null;
  image_url: string | null;
  image_caption: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
};

export type CompetitionOption = {
  id: string;
  name: string | null;
  slug: string | null;
  is_active?: boolean | null;
};

export type SeasonOption = {
  id: string;
  competition_id: string | null;
  label: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  is_current?: boolean | null;
};

export type MatchdayOption = {
  id: string;
  season_id: string | null;
  number: number | null;
  label: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  status?: string | null;
};

const DEFAULT_ARTICLE_AUTHOR = "Silvestre Chícharo";

type ArticleEditorFormProps = {
  mode: "create" | "edit";
  article?: EditorialArticle | null;
  competitions: CompetitionOption[];
  seasons: SeasonOption[];
  matchdays: MatchdayOption[];
  message?: string | null;
  returnTo?: string;
};

export function publicArticleHref(slug: string | null | undefined) {
  const cleanSlug = (slug ?? "").trim();
  if (!cleanSlug) {
    return null;
  }

  return `/noticias/${encodeURIComponent(cleanSlug)}`;
}

export function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const cleanValue = value?.trim();
    if (cleanValue) {
      return cleanValue;
    }
  }

  return "";
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function seasonLabel(season: SeasonOption) {
  return firstText(season.label, season.id);
}

function matchdayLabel(matchday: MatchdayOption) {
  const baseLabel = firstText(matchday.label, matchday.number ? `J${String(matchday.number).padStart(2, "0")}` : null, matchday.id);
  return matchday.number ? `${baseLabel} · J${String(matchday.number).padStart(2, "0")}` : baseLabel;
}

const articleFormEnhancer = `
(function () {
  function normalizeSlug(value) {
    return (value || "")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function selectedOption(select) {
    return select.options[select.selectedIndex] || null;
  }

  function init(form) {
    var title = form.querySelector("[data-article-title]");
    var slug = form.querySelector("[data-article-slug]");
    var scope = form.querySelector("[data-article-scope]");
    var competition = form.querySelector("[data-article-competition]");
    var season = form.querySelector("[data-article-season]");
    var matchday = form.querySelector("[data-article-matchday]");
    var initialPlacementField = form.querySelector('[data-article-initial-placement-field]');

    if (title && slug) {
      slug.addEventListener("blur", function () {
        slug.value = normalizeSlug(slug.value);
      });
      title.addEventListener("blur", function () {
        if (!slug.value.trim()) {
          slug.value = normalizeSlug(title.value);
        }
      });
    }

    function setFieldState(field, enabled) {
      if (!field) return;
      field.hidden = !enabled;
      Array.prototype.forEach.call(field.querySelectorAll("select"), function (select) {
        select.disabled = !enabled;
      });
    }

    function filterOptions() {
      var scopeValue = scope ? scope.value : "home";
      var competitionField = form.querySelector('[data-article-context-field="competition"]');
      var seasonField = form.querySelector('[data-article-context-field="season"]');
      var matchdayField = form.querySelector('[data-article-context-field="matchday"]');
      var competitionId = competition ? competition.value : "";
      var seasonId = season ? season.value : "";
      var usesCompetition = scopeValue === "competition" || scopeValue === "matchday";
      var usesMatchday = scopeValue === "matchday";

      if (!usesCompetition) {
        if (competition) competition.value = "";
        if (season) season.value = "";
        if (matchday) matchday.value = "";
        competitionId = "";
        seasonId = "";
      }

      if (competition && !competition.value) {
        if (season) {
          season.value = "";
          seasonId = "";
        }
        if (matchday) {
          matchday.value = "";
        }
      }

      if (season) {
        Array.prototype.forEach.call(season.options, function (option) {
          if (!option.value) {
            option.hidden = false;
            option.disabled = false;
            return;
          }
          var keep = Boolean(competitionId) && option.getAttribute("data-competition-id") === competitionId;
          option.hidden = !keep;
          option.disabled = !keep;
        });

        if (selectedOption(season) && selectedOption(season).disabled) {
          season.value = "";
          seasonId = "";
        }
      }

      if (matchday) {
        Array.prototype.forEach.call(matchday.options, function (option) {
          if (!option.value) {
            option.hidden = false;
            option.disabled = false;
            return;
          }
          var keep = Boolean(seasonId) && option.getAttribute("data-season-id") === seasonId;
          option.hidden = !keep;
          option.disabled = !keep;
        });

        if (!usesMatchday || (selectedOption(matchday) && selectedOption(matchday).disabled)) {
          matchday.value = "";
        }
      }

      setFieldState(competitionField, usesCompetition);
      setFieldState(seasonField, usesCompetition && Boolean(competitionId));
      setFieldState(matchdayField, usesMatchday && Boolean(seasonId));
      setFieldState(initialPlacementField, usesMatchday && Boolean(seasonId) && Boolean(matchday && matchday.value));
    }

    if (scope) {
      scope.addEventListener("change", filterOptions);
    }
    if (competition) {
      competition.addEventListener("change", function () {
        if (season) season.value = "";
        if (matchday) matchday.value = "";
        filterOptions();
      });
    }
    if (season) {
      season.addEventListener("change", function () {
        if (matchday) matchday.value = "";
        filterOptions();
      });
    }
    if (matchday) {
      matchday.addEventListener("change", filterOptions);
    }

    filterOptions();
  }

document.querySelectorAll("[data-article-admin-form]").forEach(init);
})();
`;

const articleImageUploadScript = `
(function () {
  if (window.__editorialArticleImageUploadBound) return;
  window.__editorialArticleImageUploadBound = true;
  var allowedExtensions = /\\.(jpe?g|png|webp|avif)$/i;
  var allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];

  function uploadParts(uploadRoot) {
    var fileInput = uploadRoot ? uploadRoot.querySelector('[data-article-image-file]') : null;
    var uploadButton = uploadRoot ? uploadRoot.querySelector('[data-article-image-upload-button]') : null;
    var status = uploadRoot ? uploadRoot.querySelector('[data-article-image-upload-status]') : null;
    var form = uploadRoot ? uploadRoot.closest('form') : null;
    var targetInput = form ? form.querySelector('[name="image_url"]') : null;
    return { fileInput: fileInput, uploadButton: uploadButton, status: status, targetInput: targetInput };
  }

  function setStatus(parts, message, state) {
    var status = parts.status;
    if (!status) return;
    status.textContent = message;
    status.setAttribute('data-upload-state', state || 'idle');
  }

  function selectedFile(parts) {
    var fileInput = parts.fileInput;
    return fileInput && fileInput.files ? fileInput.files[0] : null;
  }

  function validateFile(file) {
    if (!file) return 'Escolhe uma imagem.';
    if (!allowedExtensions.test(file.name || '') || allowedTypes.indexOf(file.type) === -1) {
      return 'Formato de imagem nao suportado.';
    }
    if (file.size <= 0) return 'A imagem escolhida esta vazia.';
    return '';
  }

  function uploadLimitMessage(maxUploadMb) {
    return 'Imagem demasiado grande. Limite atual: ' + (maxUploadMb || 8) + ' MB.';
  }

  function detailMessage(detail) {
    return detail ? ' Detalhe: ' + String(detail).slice(0, 180) : '';
  }

  function setLoading(parts, isLoading) {
    if (parts.uploadButton) parts.uploadButton.disabled = isLoading;
    if (parts.fileInput) parts.fileInput.disabled = isLoading;
  }

  async function uploadImage(uploadRoot) {
    var parts = uploadParts(uploadRoot);
    var file = selectedFile(parts);
    var validationError = validateFile(file);
    if (validationError) {
      setStatus(parts, validationError, 'error');
      return;
    }

    setLoading(parts, true);
    setStatus(parts, 'A preparar upload...', 'loading');

    try {
      var signResponse = await fetch('/api/admin/editorial/artigos/upload-image/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size
        })
      });
      var signPayload = await signResponse.json().catch(function () { return null; });
      if (!signResponse.ok) {
        if (signPayload && signPayload.error === 'image-too-large') {
          throw new Error('image-too-large:' + (signPayload.maxUploadMb || 8));
        }
        var apiError = signPayload && signPayload.error ? signPayload.error : 'sign-failed';
        var apiDetail = signPayload && signPayload.detail ? ':' + signPayload.detail : '';
        throw new Error(apiError + apiDetail);
      }
      if (!signPayload || !signPayload.signedUrl || !signPayload.publicUrl) {
        throw new Error('sign-failed');
      }

      setStatus(parts, 'A carregar imagem...', 'loading');
      var uploadResponse = await fetch(signPayload.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          'Cache-Control': 'max-age=31536000',
          'x-upsert': 'false'
        },
        body: file
      });
      if (!uploadResponse.ok) {
        var uploadDetail = await uploadResponse.text().catch(function () { return ''; });
        throw new Error('upload-failed:' + (uploadDetail || uploadResponse.status));
      }

      if (parts.targetInput) {
        parts.targetInput.value = signPayload.publicUrl;
        parts.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        parts.targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setStatus(parts, 'Imagem carregada. O URL foi preenchido automaticamente.', 'success');
    } catch (error) {
      var message = 'Nao foi possivel carregar a imagem.';
      if (error && /^missing-editorial-images-bucket/.test(error.message || '')) {
        message = 'Bucket editorial-images nao encontrado ou indisponivel.' + detailMessage(error.message.split(':').slice(1).join(':'));
      }
      if (error && /^signed-upload-failed/.test(error.message || '')) {
        message = 'Nao foi possivel assinar o upload da imagem.' + detailMessage(error.message.split(':').slice(1).join(':'));
      }
      if (error && /^sign-failed/.test(error.message || '')) {
        message = 'Nao foi possivel assinar o upload da imagem.';
      }
      if (error && error.message === 'missing-signed-upload-url') {
        message = 'Nao foi possivel assinar o upload da imagem.';
      }
      if (error && error.message === 'missing-supabase-service-config') {
        message = 'Nao foi possivel preparar o upload. Falta configuracao da Supabase.';
      }
      if (error && error.message === 'invalid-image-format') {
        message = 'Formato de imagem nao suportado.';
      }
      if (error && /^image-too-large:/.test(error.message || '')) {
        message = uploadLimitMessage(error.message.split(':')[1]);
      }
      if (error && /^upload-failed:/.test(error.message || '')) {
        message = 'Nao foi possivel enviar a imagem para o Storage.' + detailMessage(error.message.split(':').slice(1).join(':'));
      }
      setStatus(parts, message, 'error');
    } finally {
      setLoading(parts, false);
    }
  }

  document.addEventListener('click', function (event) {
    var uploadButton = event.target && event.target.closest
      ? event.target.closest('[data-article-image-upload-button]')
      : null;
    if (!uploadButton) return;
    var uploadRoot = uploadButton.closest('[data-article-image-upload]');
    if (!uploadRoot) return;
    event.preventDefault();
    uploadImage(uploadRoot);
  });

  document.addEventListener('change', function (event) {
    var fileInput = event.target && event.target.closest
      ? event.target.closest('[data-article-image-file]')
      : null;
    if (!fileInput) return;
    var uploadRoot = fileInput.closest('[data-article-image-upload]');
    var parts = uploadParts(uploadRoot);
    var error = validateFile(selectedFile(parts));
    setStatus(parts, error || 'Pronto para carregar imagem.', error ? 'error' : 'idle');
  });
})();
`;

export function ArticleEditorForm({
  mode,
  article,
  competitions,
  seasons,
  matchdays,
  message,
  returnTo,
}: ArticleEditorFormProps) {
  const publicHref = publicArticleHref(article?.slug);
  const isEdit = mode === "edit";
  const currentStatus = firstText(article?.status) || "draft";
  const publicationDateLabel = currentStatus === "published"
    ? firstText(formatShortDate(article?.published_at), "Publicado")
    : "Por publicar";
  const canOpenPublicArticle = Boolean(publicHref && currentStatus === "published");
  const saveActionLabel = currentStatus === "published"
    ? "Guardar alterações"
    : "Guardar em revisão";
  const initialMatchday = article?.matchday_id ? matchdays.find((item) => item.id === article.matchday_id) : null;
  const initialSeasonId = article?.season_id ?? initialMatchday?.season_id ?? "";
  const initialSeason = initialSeasonId ? seasons.find((item) => item.id === initialSeasonId) : null;
  const initialCompetitionId = article?.competition_id ?? initialSeason?.competition_id ?? "";
  const currentScope = article?.matchday_id ? "matchday" : initialCompetitionId || initialSeasonId ? "competition" : "home";
  const showCompetition = currentScope === "competition" || currentScope === "matchday";
  const showSeason = showCompetition && Boolean(initialCompetitionId);
  const showMatchday = currentScope === "matchday" && Boolean(initialSeasonId);
  const allowInitialPlacement = currentStatus !== "published";
  const competitionBySeasonId = new Map(seasons.map((season) => [season.id, season.competition_id ?? ""]));

  return (
    <form className="editorial-article-form" action="/api/admin/editorial/artigos" method="post" data-article-admin-form>
      <input type="hidden" name="action_type" value={isEdit ? "update_article" : "create_article"} />
      {isEdit ? <input type="hidden" name="article_id" value={article?.id ?? ""} /> : null}
      <input type="hidden" name="published_at" value={article?.published_at ?? ""} />
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}

      {message ? <p className="article-admin-alert">{message}</p> : null}
      {!isEdit ? <ExternalArticleImport /> : null}

      <section className="article-admin-section article-admin-compact-section">
        <p className="article-admin-section-title">Imagem</p>
        <div className="article-admin-grid">
          <label className="article-admin-full">
            <span>Imagem principal</span>
            <input name="image_url" defaultValue={article?.image_url ?? ""} placeholder="https://..." required />
          </label>

          <div className="article-admin-upload article-admin-full" data-article-image-upload>
            <label>
              <span>Carregar imagem do computador</span>
              <input data-article-image-file type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" />
            </label>
            <button type="button" data-article-image-upload-button>
              Carregar imagem
            </button>
            <span className="article-admin-upload-help" data-article-image-upload-status>
              Pronto para carregar .jpg, .png, .webp ou .avif.
            </span>
          </div>

          <label className="article-admin-full">
            <span>Legenda da imagem</span>
            <input name="image_caption" defaultValue={article?.image_caption ?? ""} />
          </label>
        </div>
      </section>

      <section className="article-admin-section">
        <div className="article-admin-grid">
          <label className="article-admin-full">
            <span>Título</span>
            <input name="title" data-article-title defaultValue={article?.title ?? ""} required />
          </label>

          <label>
            <span>Antetítulo · obrigatório para publicar</span>
            <input name="label" defaultValue={article?.label ?? ""} placeholder="Ex.: LIGA PORTUGAL" />
          </label>

          <label>
            <span>Autor · obrigatório para publicar</span>
            <input
              name="author"
              defaultValue={isEdit ? article?.author ?? "" : DEFAULT_ARTICLE_AUTHOR}
              placeholder="Nome do autor"
            />
          </label>

          {!isEdit ? (
            <label className="article-admin-full">
              <span>Destino previsto do pós-título</span>
              <select name="editorial_destination" data-article-editorial-destination defaultValue="">
                <option value="">Artigo geral</option>
                <option value={EDITORIAL_CONTEXT_DESTINATION}>Contexto</option>
              </select>
              <small>
                Quando a resposta da IA indicar explicitamente Contexto, esta opção é preenchida automaticamente.
              </small>
            </label>
          ) : null}

          <label className="article-admin-full">
            <span>Pós-título</span>
            <textarea
              name="subtitle"
              data-article-post-title
              rows={3}
              defaultValue={article?.subtitle ?? ""}
              required
            />
            {!isEdit ? (
              <small
                className="article-admin-context-post-title-note"
                data-article-context-post-title-note
                hidden
              >
                Contexto: procurar {EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS}–{EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS} caracteres. O mínimo é editorial: se os factos não justificarem esse comprimento, não acrescentar texto artificial.
              </small>
            ) : null}
          </label>

          <div className="article-admin-publication-date article-admin-full">
            <span>Data Jornada.pt</span>
            <strong>{publicationDateLabel}</strong>
          </div>

          <label className="article-admin-full">
            <span>Corpo</span>
            <textarea name="body" rows={12} defaultValue={article?.body ?? ""} required />
          </label>
        </div>
      </section>

      <details className="article-admin-publication-options">
        <summary>Onde publicar</summary>
        <p className="article-admin-context-note">
          Ao publicar uma notícia de Jornada, escolhe a colocação inicial. Últimas é opcional e mantém sempre a ordem cronológica, com a notícia mais recente no topo.
        </p>
        <div className="article-admin-grid">
          <label>
            <span>Âmbito</span>
            <select name="scope" data-article-scope defaultValue={currentScope}>
              <option value="home">Home</option>
              <option value="competition">Competição</option>
              <option value="matchday">Jornada</option>
            </select>
          </label>

          <label data-article-context-field="competition" hidden={!showCompetition}>
            <span>Competição</span>
            <select name="competition_id" data-article-competition defaultValue={initialCompetitionId} disabled={!showCompetition}>
              <option value="">Sem competição</option>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {firstText(competition.name, competition.slug, competition.id)}
                </option>
              ))}
            </select>
          </label>

          <label data-article-context-field="season" hidden={!showSeason}>
            <span>Época</span>
            <select name="season_id" data-article-season defaultValue={initialSeasonId} disabled={!showSeason}>
              <option value="">Sem época</option>
              {seasons.map((season) => {
                const enabled = Boolean(initialCompetitionId) && season.competition_id === initialCompetitionId;

                return (
                  <option
                    key={season.id}
                    value={season.id}
                    data-competition-id={season.competition_id ?? ""}
                    hidden={!enabled}
                    disabled={!enabled}
                  >
                    {seasonLabel(season)}
                  </option>
                );
              })}
            </select>
          </label>

          <label data-article-context-field="matchday" hidden={!showMatchday}>
            <span>Jornada</span>
            <select name="matchday_id" data-article-matchday defaultValue={article?.matchday_id ?? ""} disabled={!showMatchday}>
              <option value="">Sem jornada</option>
              {matchdays.map((matchday) => {
                const enabled = Boolean(initialSeasonId) && matchday.season_id === initialSeasonId;

                return (
                  <option
                    key={matchday.id}
                    value={matchday.id}
                    data-season-id={matchday.season_id ?? ""}
                    data-competition-id={matchday.season_id ? competitionBySeasonId.get(matchday.season_id) ?? "" : ""}
                    hidden={!enabled}
                    disabled={!enabled}
                  >
                    {matchdayLabel(matchday)}
                  </option>
                );
              })}
            </select>
          </label>

          {allowInitialPlacement ? (
            <label data-article-initial-placement-field hidden={!showMatchday}>
              <span>Colocação inicial</span>
              <select name="initial_placement" data-article-initial-placement defaultValue="none" disabled={!showMatchday}>
                <option value="none">Publicar sem colocação editorial</option>
                <option value="headline">Manchete</option>
                <option value="highlight">3 notícias abaixo da manchete</option>
                <option value="editorial_line_item">Últimas</option>
                <option value="complement">Notícia ao lado do vídeo</option>
                <option value="important_item">Faixa de notícias</option>
              </select>
              <small>
                A colocação é independente do artigo. Se a zona escolhida estiver ocupada, o artigo permanece publicado e podes colocá-lo manualmente sem perder conteúdo.
              </small>
            </label>
          ) : null}
        </div>
      </details>

      <details className="article-admin-publication-options">
        <summary>Endereço</summary>
        <label>
          <span>Endereço do artigo</span>
          <input name="slug" data-article-slug defaultValue={article?.slug ?? ""} placeholder="gerado-a-partir-do-titulo" />
        </label>
      </details>

      <div className="article-admin-form-actions">
        <a className="article-admin-secondary" href="/admin/editorial/artigos">
          Voltar à lista
        </a>
        {canOpenPublicArticle && publicHref ? (
          <a className="article-admin-secondary" href={publicHref} target="_blank" rel="noreferrer">
            Abrir artigo publicado
          </a>
        ) : null}
        <button name="editorial_action" type="submit" value="save">{saveActionLabel}</button>
        {currentStatus !== "published" ? (
          <button className="article-admin-publish-action" name="editorial_action" type="submit" value="publish">
            Publicar
          </button>
        ) : null}
      </div>
      <script dangerouslySetInnerHTML={{ __html: articleFormEnhancer }} />
      <script dangerouslySetInnerHTML={{ __html: articleImageUploadScript }} />
    </form>
  );
}

export const editorialArticleAdminStyles = `
  .editorial-admin-shell {
    min-height: 100vh;
    background: #f4f6f8;
    color: #111827;
    padding: 32px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .editorial-admin-container {
    max-width: 1360px;
    margin: 0 auto;
  }

  .editorial-admin-header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  .editorial-admin-hero {
    padding: 26px;
    border-radius: 10px;
    background: #10151b;
    color: #fff;
    box-shadow: 0 18px 40px rgba(8, 15, 24, 0.16);
  }

  .editorial-admin-header h1 {
    margin: 0;
    font-size: 32px;
    line-height: 1.08;
  }

  .editorial-admin-header p {
    max-width: 720px;
    margin: 8px 0 0;
    color: #4b5563;
    line-height: 1.55;
  }

  .editorial-admin-hero p {
    color: #cbd5e1;
  }

  .editorial-admin-actions,
  .article-admin-publication-date {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border: 1px solid #d9dee7;
    border-radius: 10px;
    background: #f8fafc;
  }

  .article-admin-publication-date span {
    font-size: 12px;
    font-weight: 700;
    color: #64748b;
  }

  .article-admin-publication-date strong {
    font-size: 14px;
    color: #111827;
  }

  .article-admin-form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
    align-items: center;
  }

  .article-admin-form-actions {
    padding: 18px 22px;
    border-top: 1px solid #e5e7eb;
  }

  .editorial-admin-actions a,
  .editorial-admin-actions button,
  .article-admin-form-actions a,
  .article-admin-form-actions span.article-admin-secondary,
  .article-admin-form-actions button,
  .article-card-actions a {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid #d1d5db;
    padding: 0 14px;
    background: #fff;
    color: #111827;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }

  .article-admin-form-actions span.article-admin-secondary {
    cursor: default;
  }

  .editorial-admin-actions .primary,
  .article-admin-form-actions button {
    border-color: #111827;
    background: #111827;
    color: #fff;
  }

  .editorial-admin-hero .editorial-admin-actions a {
    border-color: rgba(255, 255, 255, 0.28);
    background: transparent;
    color: #fff;
  }

  .editorial-admin-hero .editorial-admin-actions .primary {
    border-color: #fff;
    background: #fff;
    color: #10151b;
  }

  .article-admin-secondary {
    background: #fff;
  }

  .article-admin-disabled {
    border-color: #e5e7eb !important;
    background: #f3f4f6 !important;
    color: #6b7280 !important;
  }

  .article-admin-alert {
    margin: 0 0 18px;
    border-radius: 8px;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    padding: 12px 14px;
    color: #1e3a8a;
    font-size: 13px;
    font-weight: 700;
  }

  .article-admin-external-import {
    display: grid;
    gap: 12px;
    padding: 16px 22px;
    border-bottom: 1px solid #e5e7eb;
    background: #f8fafc;
  }

  .article-admin-external-import-heading {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 16px;
    align-items: center;
  }

  .article-admin-external-import strong {
    display: block;
    margin-bottom: 4px;
    color: #111827;
    font-size: 14px;
  }

  .article-admin-external-import p {
    margin: 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
  }

  .article-admin-external-import > p {
    min-height: 18px;
    color: #1e3a8a;
    font-weight: 700;
  }

  .article-admin-external-import-paste {
    display: grid;
    gap: 6px;
  }

  .article-admin-external-import-paste span {
    color: #334155;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .article-admin-external-import-paste textarea {
    width: 100%;
    min-height: 130px;
    resize: vertical;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px 12px;
    background: #fff;
    color: #111827;
    font: inherit;
    font-size: 12px;
    line-height: 1.5;
  }

  .article-admin-external-import-paste textarea:focus {
    border-color: #111827;
    outline: 2px solid rgba(15, 23, 42, 0.12);
    outline-offset: 1px;
  }

  .article-admin-external-import-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    align-items: center;
  }

  .article-admin-external-import-footer small {
    color: #64748b;
    font-size: 11px;
  }

  .article-admin-external-import button {
    min-height: 38px;
    border: 1px solid #111827;
    border-radius: 8px;
    padding: 0 14px;
    background: #111827;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .article-admin-external-import button:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }


  .article-admin-external-images {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid #dbe3ec;
    border-radius: 8px;
    background: #ffffff;
  }

  .article-admin-external-images-heading {
    display: grid;
    gap: 3px;
  }

  .article-admin-external-images-heading strong {
    margin: 0;
  }

  .article-admin-external-images-heading small {
    color: #64748b;
    font-size: 11px;
  }

  .article-admin-external-images-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
  }

  .article-admin-external-import .article-admin-external-image-option {
    display: grid;
    min-height: 0;
    gap: 5px;
    align-content: start;
    padding: 8px;
    border: 1px solid #dbe3ec;
    border-radius: 8px;
    background: #ffffff;
    color: #111827;
    text-align: left;
  }

  .article-admin-external-import .article-admin-external-image-option:hover:not(:disabled),
  .article-admin-external-import .article-admin-external-image-option[data-selected="true"] {
    border-color: #111827;
    background: #f8fafc;
  }

  .article-admin-external-image-option img {
    display: block;
    width: 100%;
    height: 92px;
    border-radius: 6px;
    background: #eef2f7;
    object-fit: cover;
  }

  .article-admin-external-image-option > span {
    color: #64748b;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .article-admin-external-image-option > strong {
    display: -webkit-box;
    min-height: 32px;
    margin: 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: #111827;
    font-size: 12px;
    line-height: 1.3;
  }

  .article-admin-external-image-option > small {
    color: #1e3a8a;
    font-size: 10px;
    font-weight: 800;
  }

  .article-admin-workspace {
    display: grid;
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
  }

  .article-admin-sidebar,
  .article-admin-editor {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
  }

  .article-admin-sidebar {
    position: sticky;
    top: 18px;
    max-height: calc(100vh - 36px);
    overflow: auto;
  }

  .article-admin-sidebar-header,
  .article-admin-editor-header {
    padding: 18px;
    border-bottom: 1px solid #e5e7eb;
  }

  .article-admin-sidebar-header h2,
  .article-admin-editor-header h2 {
    margin: 0;
    font-size: 18px;
  }

  .article-admin-sidebar-header p,
  .article-admin-editor-header p {
    margin: 6px 0 0;
    color: #6b7280;
    line-height: 1.45;
  }

  .article-admin-sidebar-list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .article-admin-sidebar-item {
    display: grid;
    gap: 5px;
    padding: 13px 16px;
    border-bottom: 1px solid #eef2f7;
    color: inherit;
    text-decoration: none;
  }

  .article-admin-sidebar-item:last-child {
    border-bottom: 0;
  }

  .article-admin-sidebar-item:hover,
  .article-admin-sidebar-item.is-selected {
    background: #f9fafb;
  }

  .article-admin-sidebar-item.is-selected {
    box-shadow: inset 4px 0 0 #b91c1c;
  }

  .article-admin-sidebar-item strong {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: #111827;
    font-size: 14px;
    line-height: 1.25;
  }

  .article-admin-sidebar-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: #6b7280;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .article-admin-section,
  .editorial-admin-panel,
  .article-card {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
  }

  .editorial-admin-panel {
    padding: 20px;
  }

  .article-admin-section {
    display: block;
    padding: 18px 22px;
    margin: 0;
    border-width: 0 0 1px;
    border-radius: 0;
    box-shadow: none;
  }

  .article-admin-section:last-of-type {
    border-bottom: 0;
  }

  .article-admin-section h2 {
    margin: 4px 0 8px;
    font-size: 20px;
  }

  .article-admin-section p {
    margin: 0;
    color: #6b7280;
    line-height: 1.5;
  }

  .article-admin-section-title {
    margin: 0 0 14px !important;
    color: #b91c1c !important;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .article-admin-kicker {
    margin: 0;
    color: #b91c1c !important;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .article-admin-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .article-admin-full {
    grid-column: 1 / -1;
  }

  .article-admin-grid label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
  }

  .article-admin-grid label[hidden] {
    display: none !important;
  }

  .article-admin-grid label > span {
    color: #475569;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .article-admin-grid input,
  .article-admin-grid select,
  .article-admin-grid textarea {
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 10px 11px;
    background: #fff;
    color: #111827;
    font: inherit;
    font-weight: 500;
  }

  .article-admin-grid textarea {
    resize: vertical;
  }

  .article-admin-upload {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px dashed #cbd5e1;
    border-radius: 10px;
    background: #f8fafc;
  }

  .article-admin-upload button {
    justify-self: start;
    min-height: 36px;
    border: 0;
    border-radius: 8px;
    padding: 0 12px;
    background: #111827;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .article-admin-upload button:disabled {
    background: #9ca3af;
    cursor: wait;
  }

  .article-admin-upload-help {
    color: #6b7280;
    font-size: 12px;
    font-weight: 700;
  }

  [data-upload-state="success"] {
    color: #047857;
  }

  [data-upload-state="error"] {
    color: #b91c1c;
  }

  .article-list {
    display: grid;
    gap: 14px;
  }

  .article-card {
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr);
    gap: 16px;
    padding: 14px;
  }

  .article-card img,
  .article-card-image-placeholder {
    width: 132px;
    height: 88px;
    border-radius: 8px;
    object-fit: cover;
    background: #e5e7eb;
  }

  .article-card-image-placeholder {
    display: grid;
    place-items: center;
    color: #6b7280;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .article-card-body {
    min-width: 0;
  }

  .article-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
    color: #6b7280;
    font-size: 12px;
    font-weight: 700;
  }

  .article-card h2 {
    margin: 0;
    font-size: 20px;
    line-height: 1.18;
  }

  .article-card h2 a {
    color: inherit;
    text-decoration: none;
  }

  .article-card h2 a:hover {
    text-decoration: underline;
  }

  .article-card p {
    margin: 8px 0 0;
    color: #4b5563;
    line-height: 1.45;
  }

  .article-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .article-card-context {
    display: grid;
    gap: 3px;
    margin-top: 10px;
    color: #6b7280;
    font-size: 12px;
  }

  .article-admin-delete-form {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
    padding: 18px 22px;
    border-top: 1px solid #fee2e2;
    background: #fff7f7;
  }

  .article-admin-delete-form strong {
    display: block;
    margin-bottom: 4px;
    color: #991b1b;
  }

  .article-admin-delete-form p {
    margin: 0;
    color: #7f1d1d;
    line-height: 1.45;
  }

  .article-admin-delete-confirm {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
    color: #7f1d1d;
    font-size: 13px;
    font-weight: 800;
  }

  .article-admin-delete-form button {
    flex: 0 0 auto;
    min-height: 38px;
    border: 1px solid #991b1b;
    border-radius: 8px;
    padding: 0 14px;
    background: #991b1b;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  @media (max-width: 820px) {
    .editorial-admin-shell {
      padding: 20px;
    }

    .editorial-admin-header,
    .article-admin-workspace,
    .article-admin-section,
    .article-admin-grid,
    .article-card {
      grid-template-columns: 1fr;
    }

    .article-admin-sidebar {
      position: static;
      max-height: none;
    }

    .editorial-admin-header {
      display: grid;
    }

    .editorial-admin-actions,
    .article-admin-form-actions {
      justify-content: flex-start;
    }

    .article-admin-delete-form {
      display: grid;
    }
  }
  .article-editor-workflow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
    gap: 24px;
    align-items: center;
    margin: 0 0 20px;
    padding: 20px;
    border: 1px solid #bfdbfe;
    border-radius: 14px;
    background: #eff6ff;
  }

  .article-editor-workflow h3,
  .article-editor-workflow p {
    margin: 0;
  }

  .article-editor-workflow h3 {
    margin-top: 4px;
    font-size: 22px;
  }

  .article-editor-workflow > div > p:last-child {
    margin-top: 8px;
    color: #475569;
    line-height: 1.55;
  }

  .article-editor-workflow-eyebrow {
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .article-editor-workflow ol {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .article-editor-workflow li {
    display: grid;
    gap: 6px;
    min-height: 72px;
    padding: 12px;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #fff;
  }

  .article-editor-workflow li span {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border-radius: 999px;
    background: #e2e8f0;
    font-size: 12px;
    font-weight: 900;
  }

  .article-editor-workflow li strong {
    font-size: 12px;
  }

  .article-editor-workflow li[data-state="complete"] {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .article-editor-workflow li[data-state="current"] {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgb(37 99 235 / 10%);
  }

  .article-editor-workflow li[data-state="current"] span {
    background: #2563eb;
    color: #fff;
  }

  .article-admin-context-post-title-note {
    color: #607086;
    font-size: 12px;
    line-height: 1.4;
  }

  .article-admin-context-note {
    margin: 10px 0 14px;
    color: #526173;
    font-size: 13px;
    line-height: 1.45;
  }

  .article-admin-publication-options {
    margin: 0 0 18px;
    padding: 14px 16px;
    border: 1px solid #dbe2ea;
    border-radius: 12px;
    background: #f8fafc;
  }

  .article-admin-publication-options summary {
    cursor: pointer;
    font-weight: 900;
  }

  .article-admin-publication-options label {
    display: grid;
    gap: 7px;
    max-width: 420px;
    margin-top: 14px;
  }

  .article-admin-publication-options label span {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .article-admin-publication-options input {
    min-height: 42px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 0 12px;
    background: #fff;
  }

  .article-admin-publication-options p,
  .article-admin-publication-note {
    margin: 10px 0 0;
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
  }

  .article-admin-form-actions .article-admin-publish-action {
    background: #dc2626;
  }

  .article-admin-form-actions .article-admin-publish-action:hover {
    background: #b91c1c;
  }

  @media (max-width: 900px) {
    .article-editor-workflow {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .article-editor-workflow ol {
      grid-template-columns: 1fr;
    }
  }

`;
