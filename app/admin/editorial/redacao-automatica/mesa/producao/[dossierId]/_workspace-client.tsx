"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type {
  EditorialDossierArticlePlan,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";
import type {
  EditorialDossierImage,
  EditorialDossierPublishedContext,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-repository";
import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
} from "@/lib/redacao-automatica/editorial-dossier-repository";

import styles from "./workspace.module.css";

const WORKSPACE_ROUTE = "/api/admin/editorial/redacao-automatica/mesa/workspace";
const ARTICLE_IMAGE_SIGN_ROUTE = "/api/admin/editorial/artigos/upload-image/sign";

type WorkspaceSource = Readonly<{
  id: string;
  newsroomArticleId: string;
  title: string;
  sourceLabel: string;
  included: boolean;
}>;

type WorkspaceDossier = Readonly<{
  id: string;
  articleKind: EditorialDossierArticleKind;
  lengthMode: EditorialDossierLengthMode;
}>;

type CommandResponse = Readonly<{
  ok?: boolean;
  code?: string;
  message?: string;
  partialPersistence?: boolean;
}>;

type SignedUpload = Readonly<{
  bucket: string;
  path: string;
  signedUrl: string;
  publicUrl: string;
  fileName: string;
}>;

const articleKindLabels: Record<EditorialDossierArticleKind, string> = {
  news: "Notícia",
  analysis: "Análise",
  preview: "Antevisão",
  summary: "Síntese",
};

const lengthModeLabels: Record<EditorialDossierLengthMode, string> = {
  brief: "Breve",
  standard: "Normal",
  developed: "Desenvolvido",
};

function numberValue(value: FormDataEntryValue | null, fallback: number): number {
  const parsed = Number(typeof value === "string" ? value : "");
  return Number.isInteger(parsed) ? parsed : fallback;
}

function imageSelectValue(plan: EditorialDossierArticlePlan | null): string {
  if (!plan || plan.imageChoice.mode === "unselected") return "unselected";
  if (plan.imageChoice.mode === "preserve_published") return "preserve_published";
  return `dossier_image:${plan.imageChoice.dossierImageId}`;
}

function imageChoice(value: string) {
  if (value === "preserve_published") return { mode: "preserve_published" } as const;
  if (value.startsWith("dossier_image:")) {
    return {
      mode: "dossier_image" as const,
      dossierImageId: value.slice("dossier_image:".length),
    };
  }
  return { mode: "unselected" } as const;
}

function ImageBank({
  dossierId,
  images,
  sources,
  publishedContexts,
}: Readonly<{
  dossierId: string;
  images: readonly EditorialDossierImage[];
  sources: readonly WorkspaceSource[];
  publishedContexts: readonly EditorialDossierPublishedContext[];
}>) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingRegistration, setPendingRegistration] = useState<SignedUpload | null>(null);

  async function registerUpload(upload: SignedUpload) {
    const response = await fetch(WORKSPACE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register_upload_image",
        dossierId,
        bucket: upload.bucket,
        path: upload.path,
        publicUrl: upload.publicUrl,
        fileName: upload.fileName,
      }),
    });
    const result = await response.json().catch(() => null) as CommandResponse | null;
    if (!response.ok || !result?.ok) {
      throw new Error(
        result?.message
        || "O ficheiro foi carregado, mas ainda não ficou registado no banco do Dossiê.",
      );
    }
  }

  async function uploadSelectedFile() {
    const file = fileInput.current?.files?.[0] ?? null;
    if (!file) {
      setMessage("Escolhe um ficheiro JPG, PNG, WEBP ou AVIF.");
      return;
    }

    setUploading(true);
    setMessage("A pedir autorização de upload…");

    try {
      const signResponse = await fetch(ARTICLE_IMAGE_SIGN_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const signed = await signResponse.json().catch(() => null) as Partial<SignedUpload> | null;
      if (
        !signResponse.ok
        || !signed?.bucket
        || !signed.path
        || !signed.signedUrl
        || !signed.publicUrl
      ) {
        throw new Error("Não foi possível preparar o upload da imagem.");
      }

      setMessage("A carregar a imagem…");
      const uploadResponse = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "x-upsert": "false",
        },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("Não foi possível carregar a imagem.");
      }

      const registration: SignedUpload = {
        bucket: signed.bucket,
        path: signed.path,
        signedUrl: signed.signedUrl,
        publicUrl: signed.publicUrl,
        fileName: file.name,
      };
      setPendingRegistration(registration);
      setMessage("A registar a imagem no banco do Dossiê…");
      await registerUpload(registration);
      setPendingRegistration(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage("Imagem disponível no banco comum.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível guardar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  async function retryRegistration() {
    if (!pendingRegistration) return;
    setUploading(true);
    setMessage("A tentar registar novamente a imagem já carregada…");
    try {
      await registerUpload(pendingRegistration);
      setPendingRegistration(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage("Imagem disponível no banco comum.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível registar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  function originLabel(image: EditorialDossierImage): string {
    if (image.origin === "upload") return `UPLOAD · ${image.fileName}`;
    if (image.origin === "newsroom") {
      const source = sources.find(
        (candidate) => candidate.newsroomArticleId === image.newsroomArticleId,
      );
      return source ? `NOVA · ${source.sourceLabel}` : "NOVA";
    }
    const context = publishedContexts.find(
      (candidate) => candidate.editorialArticleId === image.editorialArticleId,
    );
    return context ? `PUBLICADA · ${context.title}` : "PUBLICADA";
  }

  return (
    <section className={styles.section} aria-labelledby="workspace-images-title">
      <header className={styles.sectionHeader}>
        <div>
          <p>Banco local ao Dossiê</p>
          <h2 id="workspace-images-title">Banco comum de imagens</h2>
        </div>
        <span>A mesma imagem pode ser escolhida por vários Article Plans.</span>
      </header>

      {images.length > 0 ? (
        <ol className={styles.imageBank}>
          {images.map((image) => (
            <li key={image.id}>
              <img src={image.frozenUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <div>
                <strong>{originLabel(image)}</strong>
                <small>{image.id}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className={styles.empty}>Ainda não existem imagens disponíveis.</p>}

      <div className={styles.uploadBar}>
        <label>
          <span>Adicionar ao banco comum</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={uploading || Boolean(pendingRegistration)}
          />
        </label>
        {pendingRegistration ? (
          <button type="button" onClick={retryRegistration} disabled={uploading}>
            Registar upload já concluído
          </button>
        ) : (
          <button type="button" onClick={uploadSelectedFile} disabled={uploading}>
            {uploading ? "A carregar…" : "Upload"}
          </button>
        )}
      </div>
      {message ? <p className={styles.commandMessage} role="status">{message}</p> : null}
    </section>
  );
}

function PlanEditor({
  dossier,
  plan,
  priority,
  sources,
  contexts,
  images,
}: Readonly<{
  dossier: WorkspaceDossier;
  plan: EditorialDossierArticlePlan | null;
  priority: number;
  sources: readonly WorkspaceSource[];
  contexts: readonly EditorialDossierPublishedContext[];
  images: readonly EditorialDossierImage[];
}>) {
  const router = useRouter();
  const [destination, setDestination] = useState<"new" | "update">(
    plan?.destination ?? "new",
  );
  const [targetId, setTargetId] = useState(plan?.updateTargetEditorialArticleId ?? "");
  const [selectedImage, setSelectedImage] = useState(imageSelectValue(plan));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (plan?.editorialArticleId) {
    return (
      <article className={styles.planCard} data-materialized="true">
        <header>
          <div><span>Article Plan materializado</span><h3>{plan.workingTitle}</h3></div>
          <strong>{plan.destination === "update" ? "UPDATE" : "NOVO"}</strong>
        </header>
        <p>
          Este plano já materializou o output canónico {plan.editorialArticleId} e está bloqueado para o writer normal.
        </p>
      </article>
    );
  }

  const assignedSourceIds = new Set(
    plan?.sources.map((assignment) => assignment.dossierSourceId) ?? [],
  );
  const assignedContextIds = new Set(
    plan?.publishedContexts.map((assignment) => assignment.dossierPublishedContextId) ?? [],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const sourceSelections = sources.flatMap((source, index) => (
      data.has(`source:${source.id}`)
        ? [{
            dossierSourceId: source.id,
            priority: numberValue(data.get(`source_priority:${source.id}`), index + 1),
          }]
        : []
    ));
    const publishedContextIds = contexts.flatMap((context) => (
      data.has(`context:${context.id}`) ? [context.id] : []
    ));

    setSaving(true);
    setMessage("A guardar as duas famílias de estado…");

    try {
      const response = await fetch(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_article_plan",
          dossierId: dossier.id,
          articlePlanId: plan?.id ?? null,
          workingTitle: String(data.get("working_title") ?? ""),
          status: String(data.get("status") ?? "planned"),
          priority: numberValue(data.get("priority"), priority),
          articleKind: String(data.get("article_kind") ?? "news"),
          lengthMode: String(data.get("length_mode") ?? "standard"),
          editorialInstructions: String(data.get("editorial_instructions") ?? ""),
          sources: sourceSelections,
          destination,
          updateTargetEditorialArticleId: destination === "update" ? targetId : null,
          dossierPublishedContextIds: publishedContextIds,
          imageChoice: imageChoice(selectedImage),
        }),
      });
      const result = await response.json().catch(() => null) as CommandResponse | null;
      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message
          || "Não foi possível guardar o Article Plan. Recarrega para confirmar o estado persistido.",
        );
      }

      setMessage(plan ? "Article Plan guardado." : "Article Plan criado.");
      if (!plan) {
        form.reset();
        setDestination("new");
        setTargetId("");
        setSelectedImage("unselected");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível guardar o Article Plan.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={styles.planCard} data-destination={destination}>
      <header>
        <div>
          <span>{plan ? `Article Plan ${plan.id}` : "Novo Article Plan"}</span>
          <h3>{plan?.workingTitle ?? "Planear output concreto"}</h3>
        </div>
        <strong>{destination === "update" ? "UPDATE" : "NOVO"}</strong>
      </header>

      <form onSubmit={save}>
        <div className={styles.planFields}>
          <label className={styles.wideField}>
            <span>Título de trabalho</span>
            <input name="working_title" defaultValue={plan?.workingTitle ?? ""} maxLength={180} required />
          </label>
          <label>
            <span>Estado</span>
            <select name="status" defaultValue={plan?.status ?? "planned"}>
              <option value="planned">Em preparação</option>
              <option value="ready">Pronto</option>
              {plan ? <option value="cancelled">Cancelado</option> : null}
            </select>
          </label>
          <label>
            <span>Prioridade</span>
            <input name="priority" type="number" min={1} max={999} defaultValue={priority} required />
          </label>
          <label>
            <span>Género</span>
            <select name="article_kind" defaultValue={plan?.articleKind ?? dossier.articleKind}>
              {Object.entries(articleKindLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Extensão</span>
            <select name="length_mode" defaultValue={plan?.lengthMode ?? dossier.lengthMode}>
              {Object.entries(lengthModeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className={styles.instructionsField}>
          <span>Instruções editoriais deste artigo</span>
          <textarea
            name="editorial_instructions"
            defaultValue={plan?.editorialInstructions ?? ""}
            maxLength={12000}
            rows={4}
          />
        </label>

        <fieldset>
          <legend>Fontes concretas do Dossiê</legend>
          <p>A mesma fonte pode sustentar vários Article Plans.</p>
          {sources.length > 0 ? (
            <ul className={styles.choiceList}>
              {sources.map((source, index) => {
                const assigned = assignedSourceIds.has(source.id);
                const enabled = source.included || assigned;
                const assignment = plan?.sources.find(
                  (candidate) => candidate.dossierSourceId === source.id,
                );
                return (
                  <li key={source.id}>
                    <label>
                      <input
                        type="checkbox"
                        name={`source:${source.id}`}
                        defaultChecked={assigned}
                        disabled={!enabled}
                      />
                      <span><strong>{source.title}</strong><small>{source.sourceLabel}</small></span>
                    </label>
                    <input
                      aria-label={`Ordem de ${source.title}`}
                      type="number"
                      name={`source_priority:${source.id}`}
                      min={1}
                      max={999}
                      defaultValue={assignment ? Math.max(1, Math.round(assignment.sortOrder / 10)) : index + 1}
                      disabled={!enabled}
                    />
                  </li>
                );
              })}
            </ul>
          ) : <span className={styles.empty}>Sem NOVAS neste Dossiê.</span>}
        </fieldset>

        <fieldset>
          <legend>PUBLICADAS usadas como contexto</legend>
          <p>Esta seleção é independente do target de UPDATE.</p>
          {contexts.length > 0 ? (
            <ul className={styles.choiceList}>
              {contexts.map((context) => (
                <li key={context.id}>
                  <label>
                    <input
                      type="checkbox"
                      name={`context:${context.id}`}
                      defaultChecked={assignedContextIds.has(context.id)}
                    />
                    <span><strong>{context.title}</strong><small>{context.editorialArticleId}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          ) : <span className={styles.empty}>Sem PUBLICADAS disponíveis.</span>}
        </fieldset>

        <fieldset>
          <legend>Destino do Article Plan</legend>
          <p>UPDATE nunca é inferido. A decisão e o target são humanos.</p>
          <div className={styles.destinationFields}>
            <label>
              <span>Destino</span>
              <select
                value={destination}
                onChange={(event) => {
                  const next = event.currentTarget.value === "update" ? "update" : "new";
                  setDestination(next);
                  if (next === "new") {
                    setTargetId("");
                    if (selectedImage === "preserve_published") setSelectedImage("unselected");
                  }
                }}
              >
                <option value="new">NOVO</option>
                <option value="update">UPDATE</option>
              </select>
            </label>
            {destination === "update" ? (
              <label>
                <span>Artigo publicado a atualizar</span>
                <select value={targetId} onChange={(event) => setTargetId(event.currentTarget.value)} required>
                  <option value="">Escolher target publicado</option>
                  {contexts.filter((context) => context.status === "published").map((context) => (
                    <option key={context.editorialArticleId} value={context.editorialArticleId}>
                      {context.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </fieldset>

        <fieldset>
          <legend>Imagem do Article Plan</legend>
          <div className={styles.destinationFields}>
            <label>
              <span>Decisão</span>
              <select value={selectedImage} onChange={(event) => setSelectedImage(event.currentTarget.value)}>
                <option value="unselected">SEM ESCOLHA</option>
                {destination === "update" ? (
                  <option value="preserve_published">MANTER IMAGEM PUBLICADA</option>
                ) : null}
                {images.map((image, index) => (
                  <option key={image.id} value={`dossier_image:${image.id}`}>
                    IMAGEM DO BANCO {index + 1} · {image.origin.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <div className={styles.planActions}>
          <button type="submit" disabled={saving}>
            {saving ? "A guardar…" : plan ? "Guardar Article Plan" : "Criar Article Plan"}
          </button>
          <span>Guardar não cria draft, artigo editorial, Package nem geração.</span>
        </div>
        {message ? <p className={styles.commandMessage} role="status">{message}</p> : null}
      </form>
    </article>
  );
}

export function MesaProductionWorkspaceClient({
  dossier,
  sources,
  publishedContexts,
  images,
  plans,
}: Readonly<{
  dossier: WorkspaceDossier;
  sources: readonly WorkspaceSource[];
  publishedContexts: readonly EditorialDossierPublishedContext[];
  images: readonly EditorialDossierImage[];
  plans: readonly EditorialDossierArticlePlan[];
}>) {
  const activePlanCount = plans.filter((plan) => plan.status !== "cancelled").length;

  return (
    <>
      <ImageBank
        dossierId={dossier.id}
        images={images}
        sources={sources}
        publishedContexts={publishedContexts}
      />

      <section className={styles.section} aria-labelledby="workspace-plans-title">
        <header className={styles.sectionHeader}>
          <div>
            <p>0 / 1 / N outputs concretos</p>
            <h2 id="workspace-plans-title">Article Plans</h2>
          </div>
          <span>{activePlanCount} / 4 ativos · restrição operacional atual</span>
        </header>

        <div className={styles.planList}>
          {plans.map((plan, index) => (
            <PlanEditor
              key={plan.id}
              dossier={dossier}
              plan={plan}
              priority={Math.max(1, Math.round(plan.sortOrder / 10)) || index + 1}
              sources={sources}
              contexts={publishedContexts}
              images={images}
            />
          ))}
          {activePlanCount < 4 ? (
            <PlanEditor
              key="new-plan"
              dossier={dossier}
              plan={null}
              priority={activePlanCount + 1}
              sources={sources}
              contexts={publishedContexts}
              images={images}
            />
          ) : (
            <p className={styles.limitNotice}>
              Limite operacional de quatro planos ativos atingido. Cancela um plano antes de criar outro.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
