import Script from "next/script";

export type EditorialContent = {
  id: string;
  slug: string | null;
  status: string | null;
  scope: string | null;
  content_type: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  summary: string | null;
  body: string | null;
  author: string | null;
  image_url: string | null;
  image_caption: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  video_provider: string | null;
  embed_url: string | null;
  duration: string | null;
  is_embeddable: boolean | null;
  published_at: string | null;
  competition_id: string | null;
  season_id: string | null;
  matchday_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ContentFormProps = {
  mode: "create" | "edit";
  content?: EditorialContent | null;
  message?: string | null;
  competitions?: EditorialContentCompetition[];
  seasons?: EditorialContentSeason[];
  matchdays?: EditorialContentMatchday[];
};

export type EditorialContentCompetition = {
  id: string;
  name: string | null;
  slug?: string | null;
  country?: string | null;
  country_id?: string | null;
  is_active?: boolean | null;
};

export type EditorialContentSeason = {
  id: string;
  competition_id: string | null;
  label: string | null;
  is_current?: boolean | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

export type EditorialContentMatchday = {
  id: string;
  season_id: string | null;
  number: number | null;
  label: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  status?: string | null;
};

export const editorialContentsSelect = [
  "id",
  "slug",
  "status",
  "scope",
  "content_type",
  "label",
  "title",
  "subtitle",
  "summary",
  "body",
  "author",
  "image_url",
  "image_caption",
  "thumbnail_url",
  "video_url",
  "video_provider",
  "embed_url",
  "duration",
  "is_embeddable",
  "published_at",
  "competition_id",
  "season_id",
  "matchday_id",
  "created_at",
  "updated_at",
].join(",");

export function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const cleanValue = value?.trim();
    if (cleanValue) {
      return cleanValue;
    }
  }

  return "";
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (match) {
    return match[1];
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function matchdayOptionLabel(matchday: EditorialContentMatchday) {
  const number = Number.isFinite(matchday.number) ? `J${String(matchday.number).padStart(2, "0")}` : "";
  return [number, matchday.label].filter(Boolean).join(" - ") || "Jornada sem nome";
}

function scriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

type EditorialContentScope = "home" | "competition" | "matchday";

function normalizedInitialScope(content?: EditorialContent | null): EditorialContentScope {
  if (content?.matchday_id) {
    return "matchday";
  }

  if (content?.season_id || content?.competition_id) {
    return "competition";
  }

  const storedScope = firstText(content?.scope);
  return storedScope === "competition" || storedScope === "matchday" ? storedScope : "home";
}

export function EditorialContentForm({
  mode,
  content,
  message,
  competitions = [],
  seasons = [],
  matchdays = [],
}: ContentFormProps) {
  const isEdit = mode === "edit";
  const action = "/api/admin/editorial/conteudos";
  const initialMatchday = content?.matchday_id ? matchdays.find((item) => item.id === content.matchday_id) : null;
  const initialSeasonId = content?.season_id ?? initialMatchday?.season_id ?? "";
  const initialSeason = initialSeasonId ? seasons.find((item) => item.id === initialSeasonId) : null;
  const initialCompetitionId = content?.competition_id ?? initialSeason?.competition_id ?? "";
  const initialScope = normalizedInitialScope(content);
  const showCompetition = initialScope === "competition" || initialScope === "matchday";
  const showSeason = showCompetition && Boolean(initialCompetitionId);
  const showMatchday = initialScope === "matchday" && Boolean(initialSeasonId);
  const seasonsById = new Map(seasons.map((season) => [season.id, season]));
  const matchdayOptionsById = new Map<string, EditorialContentMatchday & { competition_id: string | null }>();
  matchdays.forEach((matchday) => {
    const season = matchday.season_id ? seasonsById.get(matchday.season_id) : null;
    matchdayOptionsById.set(matchday.id, { ...matchday, competition_id: season?.competition_id ?? null });
  });
  const matchdayOptions = Array.from(matchdayOptionsById.values());
  const initialMatchdayOptions = matchdayOptions.filter((matchday) =>
    initialSeasonId ? matchday.season_id === initialSeasonId : matchday.competition_id === initialCompetitionId,
  );

  return (
    <form className="content-admin-form" action={action} method="post">
      <input type="hidden" name="action_type" value={isEdit ? "update_content" : "create_content"} />
      {isEdit ? <input type="hidden" name="content_id" value={content?.id ?? ""} /> : null}

      {message ? <p className="content-admin-alert">{message}</p> : null}

      <section className="content-admin-panel">
        <div className="content-admin-panel-heading">
          <p>Essencial</p>
          <span>Campos principais para identificar e preparar o conteudo.</span>
        </div>

        <div className="content-admin-grid">
          <label className="content-admin-full">
            <span>Titulo</span>
            <input name="title" defaultValue={content?.title ?? ""} required />
          </label>

          <label>
            <span>Tipo</span>
            <select name="content_type" defaultValue={content?.content_type ?? "video"}>
              <option value="video">video</option>
              <option value="reportagem">reportagem</option>
              <option value="entrevista">entrevista</option>
              <option value="especial">especial</option>
            </select>
          </label>

          <label>
            <span>Etiqueta</span>
            <input name="label" defaultValue={content?.label ?? ""} placeholder="REPORTAGEM, ENTREVISTA..." />
          </label>

          <label>
            <span>Estado</span>
            <select name="status" defaultValue={content?.status ?? "draft"}>
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>

          <label className="content-admin-full">
            <span>Subtitulo</span>
            <textarea name="subtitle" rows={3} defaultValue={content?.subtitle ?? ""} />
          </label>

          <label className="content-admin-full">
            <span>Resumo</span>
            <textarea name="summary" rows={3} defaultValue={content?.summary ?? ""} />
          </label>
        </div>
      </section>

      <section className="content-admin-panel">
        <div className="content-admin-panel-heading">
          <p>Texto / autoria</p>
          <span>Informacao editorial complementar.</span>
        </div>

        <div className="content-admin-grid">
          <label>
            <span>Autor</span>
            <input name="author" defaultValue={content?.author ?? ""} placeholder="Nome do autor" />
          </label>

          <label className="content-admin-full">
            <span>Corpo / descricao longa</span>
            <textarea name="body" rows={8} defaultValue={content?.body ?? ""} />
          </label>
        </div>
      </section>

      <section className="content-admin-panel">
        <div className="content-admin-panel-heading">
          <p>Media</p>
          <span>Preparado para futuro media slot. Nao liga a Home, Jornada ou Composicao nesta fase.</span>
        </div>

        <div className="content-admin-grid">
          <label className="content-admin-full">
            <span>Imagem principal</span>
            <input name="image_url" defaultValue={content?.image_url ?? ""} placeholder="https://..." />
          </label>

          <div
            className="content-admin-upload content-admin-full"
            data-content-image-upload
            data-content-image-target="image_url"
            data-content-image-success="Imagem carregada. O URL foi preenchido automaticamente."
          >
            <label>
              <span>Carregar imagem principal</span>
              <input data-content-image-file type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" />
            </label>
            <button type="button" data-content-image-upload-button>
              Carregar imagem
            </button>
            <span className="content-admin-help" data-content-image-upload-status>
              Pronto para carregar .jpg, .png, .webp ou .avif.
            </span>
          </div>

          <label className="content-admin-full">
            <span>Thumbnail</span>
            <input name="thumbnail_url" defaultValue={content?.thumbnail_url ?? ""} placeholder="https://..." />
            <span className="content-admin-help">Imagem alternativa para video.</span>
          </label>

          <div
            className="content-admin-upload content-admin-full"
            data-content-image-upload
            data-content-image-target="thumbnail_url"
            data-content-image-success="Thumbnail carregada. O URL foi preenchido automaticamente."
          >
            <label>
              <span>Carregar thumbnail</span>
              <input data-content-image-file type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" />
            </label>
            <button type="button" data-content-image-upload-button>
              Carregar thumbnail
            </button>
            <span className="content-admin-help" data-content-image-upload-status>
              Pronto para carregar .jpg, .png, .webp ou .avif.
            </span>
          </div>

          <label className="content-admin-full">
            <span>Video URL</span>
            <input name="video_url" defaultValue={content?.video_url ?? ""} placeholder="https://..." />
            <span className="content-admin-help">Link original do video, por exemplo YouTube ou Vimeo.</span>
          </label>

          <div className="content-admin-upload content-admin-full" data-content-video-upload>
            <label>
              <span>Carregar video proprio</span>
              <input data-content-video-file type="file" accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogg" />
            </label>
            <button type="button" data-content-video-upload-button>
              Carregar video
            </button>
            <span className="content-admin-help" data-content-video-upload-status>
              Pronto para carregar .mp4, .webm ou .ogg.
            </span>
          </div>

          <label>
            <span>Provider</span>
            <input name="video_provider" defaultValue={content?.video_provider ?? ""} placeholder="youtube, vimeo..." />
          </label>

          <label>
            <span>Duracao</span>
            <input name="duration" defaultValue={content?.duration ?? ""} placeholder="5:42" />
          </label>

          <label className="content-admin-full">
            <span>Embed URL</span>
            <input name="embed_url" defaultValue={content?.embed_url ?? ""} placeholder="https://..." />
            <span className="content-admin-help">Opcional. Sera usado numa fase futura para media slot.</span>
          </label>

          <label className="content-admin-full">
            <span>Legenda da imagem</span>
            <input name="image_caption" defaultValue={content?.image_caption ?? ""} />
          </label>

          <label className="content-admin-checkbox">
            <input name="is_embeddable" type="checkbox" defaultChecked={Boolean(content?.is_embeddable)} value="true" />
            <span>Permitir embed quando a pagina publica existir</span>
          </label>
        </div>
      </section>

      <section className="content-admin-panel" data-content-context-panel>
        <div className="content-admin-panel-heading">
          <p>Contexto editorial</p>
          <span>Define onde este conteudo deve ficar disponivel no admin editorial.</span>
        </div>

        <div className="content-admin-grid">
          <label>
            <span>Ambito</span>
            <select name="scope" defaultValue={initialScope} data-content-scope>
              <option value="home">Home</option>
              <option value="competition">Competicao</option>
              <option value="matchday">Jornada</option>
            </select>
          </label>

          <label data-content-context-field="competition" hidden={!showCompetition}>
            <span>Competicao / Liga</span>
            <select name="competition_id" defaultValue={initialCompetitionId} disabled={!showCompetition}>
              <option value="">Sem competicao</option>
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {[competition.country, competition.name].filter(Boolean).join(" / ") || competition.slug || competition.id}
                </option>
              ))}
            </select>
          </label>

          <label data-content-context-field="season" hidden={!showSeason}>
            <span>Epoca</span>
            <select name="season_id" defaultValue={initialSeasonId} disabled={!showSeason}>
              <option value="">Sem epoca</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id} data-competition={season.competition_id ?? ""}>
                  {season.label ?? "Epoca sem nome"}
                </option>
              ))}
            </select>
          </label>

          <label data-content-context-field="matchday" hidden={!showMatchday}>
            <span>Jornada</span>
            <select
              name="matchday_id"
              defaultValue={content?.matchday_id ?? ""}
              data-matchday-options={scriptJson(matchdayOptions)}
              disabled={!showMatchday}
            >
              <option value="">Sem jornada</option>
              {initialMatchdayOptions.map((matchday) => (
                <option
                  key={matchday.id}
                  value={matchday.id}
                  data-competition={matchday.competition_id ?? ""}
                  data-season={matchday.season_id ?? ""}
                >
                  {matchdayOptionLabel(matchday)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <details className="content-admin-panel content-admin-advanced">
        <summary>
          <span>Avancado / tecnico</span>
          <small>Slug e data de publicacao.</small>
        </summary>

        <div className="content-admin-grid">
          <label>
            <span>Slug</span>
            <input name="slug" defaultValue={content?.slug ?? ""} placeholder="gerado-a-partir-do-titulo" />
            <span className="content-admin-help">E gerado automaticamente a partir do titulo. So altere se souber o que esta a fazer.</span>
          </label>

          <label>
            <span>Publicado em</span>
            <input name="published_at" type="datetime-local" defaultValue={formatDateTimeLocal(content?.published_at)} />
            <span className="content-admin-help">Se publicar sem data, o sistema preenche automaticamente.</span>
          </label>
        </div>
      </details>

      <div className="content-admin-actions">
        <a href="/admin/editorial/conteudos">Voltar a lista</a>
        <button type="submit" data-content-submit>
          {isEdit ? "Guardar alteracoes" : "Criar conteudo"}
        </button>
      </div>
      <Script
        id="editorial-content-context-selector"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              if (window.__editorialContentContextSelectorBound) return;
              window.__editorialContentContextSelectorBound = true;

              function readMatchdayOptions(matchday) {
                try {
                  return JSON.parse(matchday.getAttribute('data-matchday-options') || '[]');
                } catch (error) {
                  return [];
                }
              }

              function setFieldVisibility(field, isVisible) {
                if (!field) return;
                field.hidden = !isVisible;
                field.style.display = isVisible ? '' : 'none';
                Array.prototype.forEach.call(field.querySelectorAll('select, input, textarea'), function (control) {
                  control.disabled = !isVisible;
                });
              }

              function renderMatchdays(form) {
                var competition = form.querySelector('[name="competition_id"]');
                var season = form.querySelector('[name="season_id"]');
                var matchday = form.querySelector('[name="matchday_id"]');
                if (!competition || !season || !matchday) return;

                var previousValue = matchday.value;
                while (matchday.options.length > 1) {
                  matchday.remove(1);
                }
                if (!competition.value) {
                  matchday.value = '';
                  return;
                }

                var seen = {};
                readMatchdayOptions(matchday).forEach(function (option) {
                  var visible = season.value
                    ? option.season_id === season.value
                    : option.competition_id === competition.value;
                  if (!visible || seen[option.id]) return;
                  seen[option.id] = true;

                  var item = document.createElement('option');
                  item.value = option.id;
                  item.textContent = [
                    Number.isFinite(option.number) ? 'J' + String(option.number).padStart(2, '0') : '',
                    option.label || ''
                  ].filter(Boolean).join(' - ') || 'Jornada sem nome';
                  item.setAttribute('data-competition', option.competition_id || '');
                  item.setAttribute('data-season', option.season_id || '');
                  matchday.appendChild(item);
                });

                matchday.value = previousValue && matchday.querySelector('option[value="' + previousValue + '"]') ? previousValue : '';
              }

              function syncContext(form) {
                var scope = form.querySelector('[data-content-scope]');
                var competition = form.querySelector('[name="competition_id"]');
                var season = form.querySelector('[name="season_id"]');
                var matchday = form.querySelector('[name="matchday_id"]');
                var competitionField = form.querySelector('[data-content-context-field="competition"]');
                var seasonField = form.querySelector('[data-content-context-field="season"]');
                var matchdayField = form.querySelector('[data-content-context-field="matchday"]');
                if (!scope || !competition || !season || !matchday) return;

                var scopedToCompetition = scope.value === 'competition' || scope.value === 'matchday';
                var scopedToMatchday = scope.value === 'matchday';

                if (!scopedToCompetition) {
                  competition.value = '';
                  season.value = '';
                  matchday.value = '';
                }
                if (!competition.value) {
                  season.value = '';
                  matchday.value = '';
                }
                if (!season.value) {
                  matchday.value = '';
                }

                Array.prototype.forEach.call(season.options, function (option) {
                  if (!option.value) return;
                  var visible = Boolean(competition.value) && option.getAttribute('data-competition') === competition.value;
                  option.hidden = !visible;
                  option.disabled = !visible;
                });
                if (season.selectedOptions[0] && season.selectedOptions[0].disabled) {
                  season.value = '';
                }

                renderMatchdays(form);
                setFieldVisibility(competitionField, scopedToCompetition);
                setFieldVisibility(seasonField, scopedToCompetition && Boolean(competition.value));
                setFieldVisibility(matchdayField, scopedToMatchday && Boolean(competition.value) && Boolean(season.value));
              }

              document.addEventListener('change', function (event) {
                var control = event.target && event.target.closest
                  ? event.target.closest('[data-content-scope], [name="competition_id"], [name="season_id"]')
                  : null;
                if (!control) return;
                var form = control.closest('form');
                if (form) syncContext(form);
              });

              Array.prototype.forEach.call(document.querySelectorAll('[data-content-context-panel]'), function (panel) {
                var form = panel.closest('form');
                if (form) syncContext(form);
              });
            })();
          `
        }}
      />
      <Script
        id="editorial-content-video-upload"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              if (window.__editorialContentVideoUploadBound) return;
              window.__editorialContentVideoUploadBound = true;
              var allowedExtensions = /\\.(mp4|webm|ogg)$/i;
              var allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'application/ogg'];

              function uploadParts(uploadRoot) {
                var fileInput = uploadRoot ? uploadRoot.querySelector('[data-content-video-file]') : null;
                var uploadButton = uploadRoot ? uploadRoot.querySelector('[data-content-video-upload-button]') : null;
                var status = uploadRoot ? uploadRoot.querySelector('[data-content-video-upload-status]') : null;
                var form = uploadRoot ? uploadRoot.closest('form') : null;
                var videoUrlInput = form ? form.querySelector('[name="video_url"]') : null;
                return { fileInput: fileInput, uploadButton: uploadButton, status: status, videoUrlInput: videoUrlInput };
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
                if (!file) return 'Escolhe um ficheiro de video.';
                if (!allowedExtensions.test(file.name || '') || allowedTypes.indexOf(file.type) === -1) {
                  return 'Formato invalido. Usa .mp4, .webm ou .ogg.';
                }
                if (file.size <= 0) return 'O ficheiro escolhido esta vazio.';
                return '';
              }

              function uploadLimitMessage(maxUploadMb) {
                return 'O ficheiro é demasiado grande. Limite atual: ' + (maxUploadMb || 45) + ' MB.';
              }

              function setLoading(parts, isLoading) {
                if (parts.uploadButton) parts.uploadButton.disabled = isLoading;
                if (parts.fileInput) parts.fileInput.disabled = isLoading;
              }

              async function uploadVideo(uploadRoot) {
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
                  var signResponse = await fetch('/api/admin/editorial/conteudos/upload-video/sign', {
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
                    if (signPayload && signPayload.error === 'video-too-large') {
                      throw new Error('video-too-large:' + (signPayload.maxUploadMb || 45));
                    }
                    throw new Error(signPayload && signPayload.error ? signPayload.error : 'sign-failed');
                  }
                  if (!signPayload || !signPayload.signedUrl || !signPayload.publicUrl) {
                    throw new Error('sign-failed');
                  }

                  setStatus(parts, 'A carregar video...', 'loading');
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
                    throw new Error('upload-failed');
                  }

                  if (parts.videoUrlInput) {
                    parts.videoUrlInput.value = signPayload.publicUrl;
                    parts.videoUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                  setStatus(parts, 'Video carregado. O URL foi preenchido automaticamente.', 'success');
                } catch (error) {
                  var message = 'Nao foi possivel carregar o video.';
                  if (error && error.message === 'missing-editorial-videos-bucket') {
                    message = 'Nao foi possivel preparar o upload. Confirma o bucket editorial-videos.';
                  }
                  if (error && /^video-too-large:/.test(error.message || '')) {
                    message = uploadLimitMessage(error.message.split(':')[1]);
                  }
                  setStatus(parts, message, 'error');
                } finally {
                  setLoading(parts, false);
                }
              }

              document.addEventListener('click', function (event) {
                var uploadButton = event.target && event.target.closest
                  ? event.target.closest('[data-content-video-upload-button]')
                  : null;
                if (!uploadButton) return;
                var uploadRoot = uploadButton.closest('[data-content-video-upload]');
                if (!uploadRoot) return;
                event.preventDefault();
                uploadVideo(uploadRoot);
              });

              document.addEventListener('change', function (event) {
                var fileInput = event.target && event.target.closest
                  ? event.target.closest('[data-content-video-file]')
                  : null;
                if (!fileInput) return;
                var uploadRoot = fileInput.closest('[data-content-video-upload]');
                var parts = uploadParts(uploadRoot);
                var error = validateFile(selectedFile(parts));
                setStatus(parts, error || 'Pronto para carregar video.', error ? 'error' : 'idle');
              });
            })();
          `
        }}
      />
      <Script
        id="editorial-content-image-upload"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              if (window.__editorialContentImageUploadBound) return;
              window.__editorialContentImageUploadBound = true;
              var allowedExtensions = /\\.(jpe?g|png|webp|avif)$/i;
              var allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];

              function uploadParts(uploadRoot) {
                var fileInput = uploadRoot ? uploadRoot.querySelector('[data-content-image-file]') : null;
                var uploadButton = uploadRoot ? uploadRoot.querySelector('[data-content-image-upload-button]') : null;
                var status = uploadRoot ? uploadRoot.querySelector('[data-content-image-upload-status]') : null;
                var form = uploadRoot ? uploadRoot.closest('form') : null;
                var targetName = uploadRoot ? uploadRoot.getAttribute('data-content-image-target') : '';
                var targetInput = form && targetName ? form.querySelector('[name="' + targetName + '"]') : null;
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
                  var signResponse = await fetch('/api/admin/editorial/conteudos/upload-image/sign', {
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
                  }
                  setStatus(
                    parts,
                    uploadRoot.getAttribute('data-content-image-success') || 'Imagem carregada. O URL foi preenchido automaticamente.',
                    'success'
                  );
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
                  ? event.target.closest('[data-content-image-upload-button]')
                  : null;
                if (!uploadButton) return;
                var uploadRoot = uploadButton.closest('[data-content-image-upload]');
                if (!uploadRoot) return;
                event.preventDefault();
                uploadImage(uploadRoot);
              });

              document.addEventListener('change', function (event) {
                var fileInput = event.target && event.target.closest
                  ? event.target.closest('[data-content-image-file]')
                  : null;
                if (!fileInput) return;
                var uploadRoot = fileInput.closest('[data-content-image-upload]');
                var parts = uploadParts(uploadRoot);
                var error = validateFile(selectedFile(parts));
                setStatus(parts, error || 'Pronto para carregar imagem.', error ? 'error' : 'idle');
              });
            })();
          `
        }}
      />
    </form>
  );
}

export const adminEditorialContentsStyles = `
  .content-admin-shell {
    min-height: 100vh;
    background: #f4f6f8;
    color: #111827;
    padding: 32px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .content-admin-header,
  .content-admin-notes,
  .content-admin-empty,
  .content-admin-card,
  .content-admin-alert,
  .content-admin-form,
  .content-admin-missing {
    max-width: 1180px;
    margin: 0 auto;
  }

  .content-admin-header {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-start;
    margin-bottom: 18px;
    border-radius: 10px;
    background: #10151b;
    color: #fff;
    padding: 26px;
    box-shadow: 0 18px 40px rgba(8, 15, 24, 0.14);
  }

  .content-admin-eyebrow,
  .content-admin-label {
    margin: 0 0 8px;
    color: #d71920;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .content-admin-header h1 {
    margin: 0;
    font-size: 32px;
    line-height: 1.08;
  }

  .content-admin-header p {
    max-width: 760px;
    margin: 10px 0 0;
    color: #cbd5e1;
    line-height: 1.55;
  }

  .content-admin-primary-action,
  .content-admin-actions a,
  .content-admin-actions button,
  .content-admin-edit-link {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    border: 1px solid #111827;
    border-radius: 8px;
    padding: 0 14px;
    background: #111827;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
  }

  .content-admin-header .content-admin-primary-action {
    border-color: #fff;
    background: #fff;
    color: #10151b;
  }

  .content-admin-actions a {
    border-color: #d1d5db;
    background: #fff;
    color: #111827;
  }

  .content-admin-notes {
    display: grid;
    gap: 10px;
    margin-bottom: 18px;
  }

  .content-admin-notes p,
  .content-admin-alert,
  .content-admin-empty,
  .content-admin-card,
  .content-admin-panel,
  .content-admin-missing {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fff;
  }

  .content-admin-notes p {
    margin: 0;
    padding: 12px 14px;
    color: #374151;
    line-height: 1.5;
  }

  .content-admin-notes code {
    border-radius: 5px;
    background: #f3f4f6;
    padding: 2px 5px;
    color: #111827;
    font-size: 12px;
  }

  .content-admin-view-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-width: 1180px;
    margin: 0 auto 18px;
  }

  .content-admin-view-tabs a {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    justify-content: center;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #fff;
    padding: 0 12px;
    color: #374151;
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
  }

  .content-admin-view-tabs a.active {
    border-color: #111827;
    background: #111827;
    color: #fff;
  }

  .content-admin-alert {
    margin-bottom: 18px;
    padding: 14px;
    border-color: #fecaca;
    background: #fff1f2;
    color: #991b1b;
    font-size: 13px;
    font-weight: 700;
  }

  .content-admin-empty,
  .content-admin-missing {
    padding: 34px 26px;
    text-align: center;
  }

  .content-admin-empty h2,
  .content-admin-missing h2 {
    margin: 0;
    font-size: 22px;
  }

  .content-admin-empty p,
  .content-admin-missing p {
    margin: 8px 0 0;
    color: #6b7280;
  }

  .content-admin-list {
    display: grid;
    gap: 16px;
  }

  .content-admin-card,
  .content-admin-panel {
    padding: 18px;
  }

  .content-admin-card-main {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }

  .content-admin-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    object-fit: cover;
    background: #e5e7eb;
  }

  .content-admin-thumb-empty {
    display: grid;
    place-items: center;
    color: #6b7280;
    font-size: 12px;
    font-weight: 800;
  }

  .content-admin-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }

  .content-admin-badges span {
    border-radius: 999px;
    background: #f3f4f6;
    padding: 5px 8px;
    color: #374151;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .content-admin-card h2 {
    margin: 0;
    font-size: 24px;
    line-height: 1.18;
  }

  .content-admin-subtitle,
  .content-admin-summary {
    margin: 8px 0 0;
    color: #4b5563;
    line-height: 1.5;
  }

  .content-admin-card-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
  }

  .content-admin-fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 18px 0 0;
  }

  .content-admin-field {
    min-width: 0;
    border-radius: 8px;
    background: #f9fafb;
    padding: 10px;
  }

  .content-admin-field dt {
    margin: 0 0 4px;
    color: #6b7280;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .content-admin-field dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: #111827;
    font-size: 13px;
    line-height: 1.4;
  }

  .content-admin-form {
    display: grid;
    gap: 16px;
  }

  .content-admin-panel-heading {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: baseline;
    margin-bottom: 14px;
  }

  .content-admin-panel-heading p {
    margin: 0;
    font-size: 18px;
    font-weight: 850;
  }

  .content-admin-panel-heading span {
    color: #6b7280;
    font-size: 13px;
  }

  .content-admin-advanced {
    padding: 0;
    overflow: hidden;
  }

  .content-admin-advanced summary {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 16px 18px;
    color: #374151;
    cursor: pointer;
    font-size: 15px;
    font-weight: 850;
  }

  .content-admin-advanced summary small {
    color: #6b7280;
    font-size: 12px;
    font-weight: 650;
  }

  .content-admin-advanced .content-admin-grid {
    border-top: 1px solid #e5e7eb;
    padding: 18px;
  }

  .content-admin-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .content-admin-grid label {
    display: grid;
    gap: 6px;
    min-width: 0;
    color: #374151;
    font-size: 13px;
    font-weight: 750;
  }

  .content-admin-full,
  .content-admin-checkbox {
    grid-column: 1 / -1;
  }

  .content-admin-grid input,
  .content-admin-grid select,
  .content-admin-grid textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #fff;
    padding: 10px 11px;
    color: #111827;
    font: inherit;
  }

  .content-admin-grid textarea {
    resize: vertical;
  }

  .content-admin-help {
    color: #6b7280;
    font-size: 12px;
    font-weight: 550;
    line-height: 1.35;
  }

  .content-admin-checkbox {
    display: flex !important;
    grid-template-columns: auto 1fr;
    align-items: center;
  }

  .content-admin-checkbox input {
    width: auto;
  }

  .content-admin-upload {
    display: grid;
    gap: 10px;
    border: 1px solid #dbe2ea;
    border-radius: 8px;
    background: #f8fafc;
    padding: 12px;
  }

  .content-admin-upload button {
    justify-self: start;
    border: 0;
    border-radius: 8px;
    background: #111827;
    padding: 10px 14px;
    color: #fff;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .content-admin-upload button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  [data-upload-state="success"] {
    color: #047857;
  }

  [data-upload-state="error"] {
    color: #b91c1c;
  }

  .content-admin-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
  }

  @media (max-width: 860px) {
    .content-admin-shell {
      padding: 18px;
    }

    .content-admin-header,
    .content-admin-panel-heading {
      display: grid;
    }

    .content-admin-card-main,
    .content-admin-fields,
    .content-admin-grid {
      grid-template-columns: 1fr;
    }
  }
`;
