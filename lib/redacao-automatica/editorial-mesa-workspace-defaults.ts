type UnknownRecord = Readonly<Record<string, unknown>>;

type WorkspaceStartingPointSource = Readonly<{
  dossierSourceId: string;
  newsroomArticleId: string;
}>;

type WorkspaceOutputDefaultSource = WorkspaceStartingPointSource & Readonly<{
  articleTitle: string;
}>;

function objectValue(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceRefArticleId(value: unknown): string | null {
  return textValue(objectValue(value)?.newsroomArticleId);
}

export function editorialMesaWorkspaceInitialOutputCount(
  selectionPayload: unknown,
  includedSourceCount: number,
): number {
  const selection = objectValue(selectionPayload);
  const selectedSourceCount = Array.isArray(selection?.sources) ? selection.sources.length : 0;
  const selectedMaterialCount = Array.isArray(selection?.materials) ? selection.materials.length : 0;
  const selectedNucleusCount = selectedSourceCount + selectedMaterialCount;
  return Math.min(30, Math.max(1, selectedNucleusCount || includedSourceCount));
}

export function editorialMesaWorkspaceVisualSourceOrder(
  selectionPayload: unknown,
  materialRefs: unknown,
  fallbackArticleIds: readonly string[],
): readonly string[] {
  const selection = objectValue(selectionPayload);
  const selectedSources = Array.isArray(selection?.sources) ? selection.sources : [];
  const selectedMaterials = Array.isArray(selection?.materials) ? selection.materials : [];
  const frozenMaterials = Array.isArray(materialRefs) ? materialRefs : [];
  const ordered: string[] = [];

  for (const selectedSource of selectedSources) {
    const newsroomArticleId = sourceRefArticleId(selectedSource);
    if (newsroomArticleId) ordered.push(newsroomArticleId);
  }
  for (const selectedMaterialValue of selectedMaterials) {
    const selectedMaterial = objectValue(selectedMaterialValue);
    const selectedKey = textValue(selectedMaterial?.key)?.toLowerCase() ?? null;
    const selectedVersionId = textValue(selectedMaterial?.versionId)?.toLowerCase() ?? null;
    const frozenMaterial = frozenMaterials.find((candidate) => {
      const material = objectValue(candidate);
      return textValue(material?.key)?.toLowerCase() === selectedKey
        && textValue(material?.versionId)?.toLowerCase() === selectedVersionId;
    });
    const frozenSources = objectValue(frozenMaterial)?.sources;
    const newsroomArticleId = Array.isArray(frozenSources)
      ? sourceRefArticleId(frozenSources[0])
      : null;
    if (newsroomArticleId) ordered.push(newsroomArticleId);
  }

  return Array.from(new Set([...ordered, ...fallbackArticleIds]));
}

export function editorialMesaWorkspaceStartingPointSourceIds(
  selectionPayload: unknown,
  materialRefs: unknown,
  sources: readonly WorkspaceStartingPointSource[],
  outputCount: number,
): readonly string[] {
  if (sources.length < 1 || outputCount < 1) return [];
  const sourceByArticleId = new Map(
    sources.map((source) => [source.newsroomArticleId, source.dossierSourceId]),
  );
  const ordered = editorialMesaWorkspaceVisualSourceOrder(
    selectionPayload,
    materialRefs,
    sources.map((source) => source.newsroomArticleId),
  ).flatMap((newsroomArticleId) => {
    const dossierSourceId = sourceByArticleId.get(newsroomArticleId);
    return dossierSourceId ? [dossierSourceId] : [];
  });
  if (ordered.length < 1) return [];

  // A prioridade técnica torna a âncora determinística. Se houver mais
  // outputs do que fontes, a ordem recomeça sem restringir o source scope.
  return Array.from(
    { length: outputCount },
    (_, index) => ordered[index % ordered.length],
  );
}

export function editorialMesaWorkspaceOutputWorkingTitle(
  outputPosition: number,
  startingPointSourceId: string | null | undefined,
  sources: readonly WorkspaceOutputDefaultSource[],
): string | null {
  if (!Number.isInteger(outputPosition) || outputPosition < 1 || !startingPointSourceId) {
    return null;
  }
  const startingPoint = sources.find(
    (source) => source.dossierSourceId === startingPointSourceId,
  );
  const articleTitle = startingPoint?.articleTitle.trim() ?? "";
  return articleTitle
    ? `Output ${String(outputPosition).padStart(2, "0")} — ${articleTitle}`.slice(0, 180)
    : null;
}
