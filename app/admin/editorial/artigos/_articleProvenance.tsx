import type {
  EditorialArticleProvenance,
  ProvenanceValueOrigin,
} from "@/lib/redacao-automatica/editorial-article-provenance-internal";
import type { PublishedAtPrecision } from "@/lib/redacao-automatica/types";
import {
  MANUAL_NEWSROOM_SOURCE_LABEL,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";

import { formatShortDate } from "./_articleForm";

const sourceRoleLabels: Record<string, string> = {
  primary: "Principal",
  corroboration: "Confirmação",
  context: "Contexto",
  complementary: "Complementar",
};

function safeSourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function fallbackNote(origin: ProvenanceValueOrigin) {
  if (origin === "legacy_current_article") {
    return <small className="article-provenance-legacy">Fallback legacy: valor atual do artigo-fonte</small>;
  }
  if (origin === "missing") {
    return <small className="article-provenance-missing">Não persistido</small>;
  }
  return null;
}

export function formatProvenancePublishedAt(
  value: string | null,
  precision: PublishedAtPrecision | null,
): string {
  if (precision !== "date") {
    return formatShortDate(value);
  }
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatShortDate(value);
  }

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  }).format(date);
}

function ValueWithOrigin({
  value,
  origin,
}: {
  value: string | null;
  origin: ProvenanceValueOrigin;
}) {
  return (
    <>
      <strong>{value ?? "Não disponível"}</strong>
      {fallbackNote(origin)}
    </>
  );
}

export function ArticleProvenancePanel({
  provenance,
}: {
  provenance: EditorialArticleProvenance;
}) {
  return (
    <section className="article-admin-diagnostic article-provenance" aria-labelledby="article-provenance-title">
      <div className="article-admin-diagnostic-header">
        <div>
          <p className="article-provenance-eyebrow">Rastreabilidade read-only</p>
          <h3 id="article-provenance-title">Proveniência da Redação Automática</h3>
        </div>
        <a href={`/admin/editorial/redacao-automatica/dossies/${encodeURIComponent(provenance.dossier.id)}`}>
          Abrir dossiê
        </a>
      </div>
      <p className="article-provenance-intro">
        O texto editável abaixo é a revisão atual. A geração identificada neste painel corresponde apenas à primeira versão.
      </p>

      <div className="article-provenance-grid">
        <section>
          <h4>Dossiê</h4>
          <dl>
            <div><dt>ID</dt><dd><code>{provenance.dossier.id}</code></dd></div>
            <div><dt>Título</dt><dd>{provenance.dossier.title}</dd></div>
            <div><dt>Estado persistido</dt><dd>{provenance.dossier.status}</dd></div>
          </dl>
        </section>
        <section>
          <h4>Plano</h4>
          <dl>
            <div><dt>ID</dt><dd><code>{provenance.plan.id}</code></dd></div>
            <div><dt>Título de trabalho</dt><dd>{provenance.plan.workingTitle}</dd></div>
            <div><dt>Género / extensão</dt><dd>{provenance.plan.articleKind} / {provenance.plan.lengthMode}</dd></div>
            <div><dt>Idioma / estado</dt><dd>{provenance.plan.outputLanguage} / {provenance.plan.status}</dd></div>
            <div><dt>Criado em</dt><dd>{formatShortDate(provenance.plan.createdAt)}</dd></div>
          </dl>
        </section>
        <section>
          <h4>Artigo</h4>
          <dl>
            <div><dt>ID</dt><dd><code>{provenance.article.id}</code></dd></div>
            <div><dt>Estado atual</dt><dd>{provenance.article.status ?? "Não disponível"}</dd></div>
            <div><dt>Relação</dt><dd>Plano <code>{provenance.article.planId}</code></dd></div>
          </dl>
        </section>
      </div>

      <details className="article-provenance-instructions">
        <summary>Instruções editoriais persistidas</summary>
        <pre>{provenance.plan.editorialInstructions || "Sem instruções persistidas."}</pre>
      </details>

      <div className="article-admin-diagnostic-header"><h4>Fontes congeladas</h4></div>
      <ol className="article-provenance-sources">
        {provenance.sources.map((source) => {
          const sourceUrl = safeSourceUrl(source.originalUrl ?? source.normalizedUrl);
          const sourceLabel = source.isManualEntry
            ? MANUAL_NEWSROOM_SOURCE_LABEL
            : source.sourceCode;
          return (
            <li key={source.dossierSourceId}>
              <header>
                <span>Ordem {source.sortOrder} · prioridade {source.priority}</span>
                <strong>{sourceRoleLabels[source.sourceRole] ?? source.sourceRole}</strong>
              </header>
              {!source.snapshotMatchesArticle ? (
                <p className="article-provenance-warning">
                  A identidade do snapshot não corresponde ao artigo-fonte; os seus metadados não foram apresentados.
                </p>
              ) : null}
              <dl>
                <div>
                  <dt>Órgão / fonte</dt>
                  <dd>
                    <ValueWithOrigin value={sourceLabel} origin={source.sourceCodeOrigin} />
                    {source.isManualEntry ? (
                      <small className="article-provenance-manual">
                        Conteúdo introduzido manualmente no arquivo editorial.
                      </small>
                    ) : null}
                  </dd>
                </div>
                <div><dt>Título</dt><dd><ValueWithOrigin value={source.title} origin={source.titleOrigin} /></dd></div>
                <div><dt>Publicado em</dt><dd><ValueWithOrigin value={source.publishedAt ? formatProvenancePublishedAt(source.publishedAt, source.publishedAtPrecision) : null} origin={source.publishedAtOrigin} /></dd></div>
                {!source.isManualEntry ? (
                  <div><dt>URL original</dt><dd><ValueWithOrigin value={source.originalUrl} origin={source.originalUrlOrigin} /></dd></div>
                ) : null}
                {!source.isManualEntry && source.normalizedUrl && source.normalizedUrl !== source.originalUrl ? (
                  <div><dt>URL normalizada</dt><dd><ValueWithOrigin value={source.normalizedUrl} origin={source.normalizedUrlOrigin} /></dd></div>
                ) : null}
                <div><dt>ID do artigo-fonte</dt><dd><code>{source.newsroomArticleId}</code></dd></div>
                <div><dt>ID do snapshot congelado</dt><dd><code>{source.newsroomSnapshotId}</code></dd></div>
                <div><dt>Hash</dt><dd><code>{source.contentHash ?? "Não disponível"}</code></dd></div>
                <div>
                  <dt>{source.isManualEntry ? "Introduzido em" : "Extraído em"}</dt>
                  <dd>{formatShortDate(source.extractedAt)}</dd>
                </div>
                {source.editorialNote ? <div><dt>Nota editorial</dt><dd>{source.editorialNote}</dd></div> : null}
              </dl>
              <footer>
                {!source.isManualEntry && sourceUrl ? (
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Consultar fonte original</a>
                ) : null}
                <a href={`/admin/editorial/redacao-automatica?articleId=${encodeURIComponent(source.newsroomArticleId)}`}>
                  Abrir artigo-fonte no arquivo
                </a>
              </footer>
            </li>
          );
        })}
      </ol>

      <div className="article-admin-diagnostic-header"><h4>Geração</h4></div>
      {provenance.generation ? (
        <>
          <dl className="article-provenance-generation">
            <div><dt>Provider / modelo</dt><dd>{provenance.generation.provider} / {provenance.generation.model}</dd></div>
            <div><dt>Prompt</dt><dd>{provenance.generation.promptVersion}</dd></div>
            <div><dt>Response ID</dt><dd><code>{provenance.generation.providerResponseId ?? "Não persistido"}</code></dd></div>
            <div><dt>Gerado em</dt><dd>{formatShortDate(provenance.generation.generatedAt)}</dd></div>
            <div><dt>Tokens</dt><dd>input {provenance.generation.inputTokens ?? "—"} / output {provenance.generation.outputTokens ?? "—"}</dd></div>
            <div><dt>Hash do input</dt><dd><code>{provenance.generation.inputHash}</code></dd></div>
            <div><dt>Hash da primeira versão</dt><dd><code>{provenance.generation.generatedBodyHash ?? "Não persistido (geração legacy)"}</code></dd></div>
            <div><dt>Estado</dt><dd>{provenance.generation.status}</dd></div>
          </dl>
          {provenance.generation.editorialProfile ? (
            <section className="article-provenance-editorial-profile">
              <h5>Linha editorial usada</h5>
              <dl>
                <div>
                  <dt>Perfil</dt>
                  <dd>
                    {provenance.generation.editorialProfile.profileName
                      ?? provenance.generation.editorialProfile.profileCode
                      ?? provenance.generation.editorialProfile.profileId}
                  </dd>
                </div>
                <div><dt>ID do perfil</dt><dd><code>{provenance.generation.editorialProfile.profileId}</code></dd></div>
                <div><dt>Versão</dt><dd>{provenance.generation.editorialProfile.versionNumber}</dd></div>
                <div><dt>ID da versão</dt><dd><code>{provenance.generation.editorialProfile.versionId}</code></dd></div>
                <div><dt>Hash editorial</dt><dd><code>{provenance.generation.editorialProfile.contentHash}</code></dd></div>
                <div><dt>Estado na geração</dt><dd>{provenance.generation.editorialProfile.stateAtGeneration}</dd></div>
                <div><dt>Versão criada em</dt><dd>{formatShortDate(provenance.generation.editorialProfile.versionCreatedAt)}</dd></div>
                <div><dt>Fixada no plano em</dt><dd>{formatShortDate(provenance.generation.editorialProfile.pinnedAt)}</dd></div>
              </dl>
              <p>
                O corpo atual do artigo pode divergir desta primeira versão
                depois da revisão humana. O hash acima identifica o texto
                originalmente gerado e preservado.
              </p>
            </section>
          ) : (
            <p className="article-admin-empty-note">
              Geração legacy: não existe uma versão editorial persistida para apresentar.
            </p>
          )}
        </>
      ) : (
        <p className="article-admin-empty-note">Ainda não existe uma geração concluída para este plano.</p>
      )}
    </section>
  );
}

export const articleProvenanceStyles = `
  .article-provenance { border-color: rgba(31, 111, 139, 0.35); }
  .article-provenance-eyebrow { margin: 0 0 4px; color: #1f6f8b; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
  .article-provenance-intro { margin: 0 0 18px; padding: 10px 12px; border-left: 3px solid #1f6f8b; background: #f4fafc; }
  .article-provenance-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .article-provenance-grid > section { padding: 14px; border: 1px solid #d9e4e8; border-radius: 10px; background: #fff; }
  .article-provenance h4 { margin: 0 0 10px; }
  .article-provenance dl { display: grid; gap: 8px; margin: 0; }
  .article-provenance dl > div { display: grid; gap: 2px; }
  .article-provenance dt { color: #63727a; font-size: 0.76rem; font-weight: 700; text-transform: uppercase; }
  .article-provenance dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .article-provenance code { font-size: 0.78rem; overflow-wrap: anywhere; }
  .article-provenance-instructions { margin: 14px 0 20px; }
  .article-provenance-instructions pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  .article-provenance-sources { display: grid; gap: 12px; padding: 0; list-style: none; }
  .article-provenance-sources > li { padding: 14px; border: 1px solid #d9e4e8; border-radius: 10px; background: #fff; }
  .article-provenance-sources header, .article-provenance-sources footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }
  .article-provenance-sources dl { margin: 12px 0; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .article-provenance-legacy, .article-provenance-missing { display: block; color: #8a5a13; }
  .article-provenance-manual { display: block; color: #1f6f8b; }
  .article-provenance-warning { color: #9b2c2c; font-weight: 700; }
  .article-provenance-generation { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .article-provenance-editorial-profile { margin-top: 14px; padding: 14px; border: 1px solid #d9e4e8; border-radius: 10px; background: #f8fafc; }
  .article-provenance-editorial-profile h5 { margin: 0 0 10px; font-size: 0.95rem; }
  .article-provenance-editorial-profile dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .article-provenance-editorial-profile p { margin: 12px 0 0; color: #52606d; font-size: 0.82rem; line-height: 1.5; }
  @media (max-width: 900px) {
    .article-provenance-grid, .article-provenance-sources dl, .article-provenance-generation, .article-provenance-editorial-profile dl { grid-template-columns: 1fr; }
  }
`;
