import { notFound } from "next/navigation";

import {
  EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH,
  EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH,
  editorialSourcePackageArticleImageSources,
  editorialSourcePackageImagesFileName,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import {
  readEditorialSourcePackage,
} from "@/lib/redacao-automatica/editorial-source-package";

import SourcePackageActions from "../../../../_sourcePackageActions";
import styles from "../../../../redacao-automatica.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type SourcePackagePageProps = Readonly<{
  params: Promise<{
    year: string;
    month: string;
    id: string;
  }>;
  searchParams?: Promise<SearchParams>;
}>;

const updateErrorMessages: Record<string, string> = {
  input_invalid: "Revê o título e as instruções. Um dos campos ultrapassa o limite permitido.",
  location_invalid: "A localização deste pacote deixou de ser válida.",
  package_not_found: "O pacote já não está disponível no armazenamento editorial.",
  package_read_failed: "Não foi possível ler o pacote editorial com segurança.",
  package_write_failed: "Não foi possível atualizar o pacote editorial.",
};

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}

function formatCreatedAt(value: string): string {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat("pt-PT", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Lisbon",
      }).format(new Date(timestamp));
}

export default async function SourcePackagePage({
  params,
  searchParams,
}: SourcePackagePageProps) {
  const { year, month, id } = await params;
  const query = (await searchParams) ?? {};
  const result = await readEditorialSourcePackage({
    year,
    month,
    packageId: id,
  });

  if (!result.ok) {
    notFound();
  }

  const { manifest } = result.value;
  const contentUrl =
    `/api/admin/editorial/redacao-automatica/source-package/${year}/${month}/${id}`;
  const failedEntries = manifest.entries.filter((entry) => entry.status === "failed");
  const articleImages = editorialSourcePackageArticleImageSources(manifest.entries);
  const imageSourceCount = articleImages.length;
  const imagesUrl = `${contentUrl}/images`;
  const imagesFileName = editorialSourcePackageImagesFileName(
    manifest.genre,
    manifest.suggestedTitle,
  );
  const packageUpdated = firstQueryValue(query.package_updated) === "1";
  const packageUpdateErrorCode = firstQueryValue(query.package_update_error);
  const packageUpdateError = packageUpdateErrorCode
    ? updateErrorMessages[packageUpdateErrorCode]
      ?? "Não foi possível atualizar o pacote."
    : null;

  return (
    <main className={styles.shell}>
      <div className={styles.simpleContainer}>
        <header className={styles.simpleHero}>
          <div>
            <p className={styles.eyebrow}>Preparação editorial</p>
            <h1>Fontes preparadas</h1>
          </div>
          <nav aria-label="Navegação editorial">
            <a href="/admin/editorial/redacao-automatica">Voltar às fontes</a>
            <a className={styles.simplePrimaryLink} href="/admin/editorial/artigos">
              Artigos
            </a>
          </nav>
        </header>

        <ol className={styles.simpleSteps} aria-label="Percurso editorial">
          <li><span>1</span><strong>Atualidade</strong></li>
          <li data-active="true"><span>2</span><strong>Preparar fontes</strong></li>
          <li><span>3</span><strong>Publicar</strong></li>
        </ol>

        {packageUpdateError ? (
          <p className={styles.simpleFeedbackError} role="status">
            {packageUpdateError}
          </p>
        ) : packageUpdated ? (
          <p className={styles.simpleFeedbackSuccess} role="status">
            {manifest.articleCount === 1
              ? "O assunto principal e as instruções foram atualizados. As fontes e as imagens mantiveram-se."
              : "As instruções foram atualizadas. Os grupos, as fontes e as imagens mantiveram-se."}
          </p>
        ) : null}

        <section className={styles.sourcePackageSummary} aria-labelledby="package-summary-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Pacote Markdown · {manifest.genreLabel}</p>
              <h2 id="package-summary-title">Recolha concluída</h2>
            </div>
            <p>Criado em {formatCreatedAt(manifest.createdAt)}</p>
          </div>

          <div className={styles.sourcePackageStats}>
            <div><span>Fontes selecionadas</span><strong>{manifest.selectedCount}</strong></div>
            <div><span>Artigos finais</span><strong>{manifest.articleCount}</strong></div>
            <div><span>Fontes preparadas</span><strong>{manifest.preparedCount}</strong></div>
            <div><span>Com falha</span><strong>{manifest.failedCount}</strong></div>
            <div><span>Imagens para artigos</span><strong>{imageSourceCount}</strong></div>
            <div><span>Imagens locais</span><strong>{manifest.imageCount}</strong></div>
          </div>

          <p className={styles.sourcePackagePath}>
            {manifest.localDirectory ? (
              <>
                <strong>Arquivo local de imagens:</strong>{" "}
                <code>{manifest.localDirectory}</code>
              </>
            ) : (
              <>
                <strong>Arquivo local de imagens:</strong>{" "}
                indisponível neste ambiente; o pacote permanece acessível para copiar.
              </>
            )}
          </p>

          <div className={styles.sourcePackageEditorialSummary}>
            <p><strong>Género:</strong> {manifest.genreLabel}</p>
            {manifest.articleCount === 1 ? (
              <p>
                <strong>Assunto principal:</strong>{" "}
                {manifest.suggestedTitle ?? "Não indicado"}
              </p>
            ) : null}
            <p>
              <strong>Instruções adicionais:</strong>{" "}
              {manifest.additionalInstructions ?? "Sem instruções adicionais"}
            </p>
          </div>

          <form
            action={contentUrl}
            method="post"
            className={styles.sourcePackageEditForm}
          >
            <div className={styles.sourcePackageEditHeader}>
              <div>
                <h3>Ajustar antes de copiar</h3>
                <p>
                  {manifest.articleCount === 1
                    ? "Ajusta o assunto principal ou as instruções sem voltar a recolher as fontes nem as imagens."
                    : "Ajusta as instruções sem voltar a recolher as fontes nem as imagens."}
                </p>
              </div>
              <p><strong>Género:</strong> {manifest.genreLabel}</p>
            </div>

            {manifest.articleCount === 1 ? (
              <label>
                <span>Assunto principal</span>
                <input
                  type="text"
                  name="suggested_title"
                  defaultValue={manifest.suggestedTitle ?? ""}
                  maxLength={EDITORIAL_SOURCE_PACKAGE_SUGGESTED_TITLE_MAX_LENGTH}
                  placeholder="Tema, protagonista ou foco principal"
                />
              </label>
            ) : (
              <input type="hidden" name="suggested_title" value="" />
            )}

            <label>
              <span>Instruções adicionais</span>
              <textarea
                name="editorial_instructions"
                defaultValue={manifest.additionalInstructions ?? ""}
                maxLength={EDITORIAL_SOURCE_PACKAGE_INSTRUCTIONS_MAX_LENGTH}
                rows={5}
                placeholder="Acrescenta o enfoque, contexto, limites ou elementos que devem ter prioridade."
              />
            </label>

            <div className={styles.sourcePackageEditActions}>
              <button type="submit">
                {manifest.articleCount === 1
                  ? "Atualizar assunto e instruções"
                  : "Atualizar instruções"}
              </button>
              <p>
                Os grupos, os textos integrais e as imagens guardadas não são alterados.
              </p>
            </div>
          </form>

          <SourcePackageActions
            contentUrl={contentUrl}
            genreLabel={manifest.genreLabel}
            imagesUrl={imagesUrl}
            imagesFileName={imagesFileName}
            imageSourceCount={imageSourceCount}
            articleCount={manifest.articleCount}
            sourcePackage={{ year, month, packageId: id }}
          />
        </section>

        <section className={styles.sourcePackageContents} aria-labelledby="package-contents-title">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Conteúdo</p>
              <h2 id="package-contents-title">Fontes por artigo</h2>
            </div>
            <p>O ficheiro preserva os grupos e a ordem das fontes.</p>
          </div>

          <ol>
            {manifest.entries.map((entry) => (
              <li key={`${entry.position}-${entry.title ?? entry.errorCode}`}>
                <span>{String(entry.articlePosition).padStart(2, "0")}</span>
                <div>
                  <strong>{entry.title ?? "Notícia indisponível"}</strong>
                  <p>
                    {`Fonte ${String(entry.position).padStart(2, "0")} · ${entry.sourceName ?? "Fonte não identificada"}`}
                    {entry.status === "failed"
                      ? ` · Falha: ${entry.errorCode}`
                      : " · Texto integral preparado"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {failedEntries.length > 0 ? (
          <p className={styles.simpleFeedbackError} role="status">
            {failedEntries.length === 1
              ? "Uma notícia não pôde ser preparada integralmente. A falha está identificada no ficheiro."
              : `${failedEntries.length} notícias não puderam ser preparadas integralmente. As falhas estão identificadas no ficheiro.`}
          </p>
        ) : null}
      </div>
    </main>
  );
}
