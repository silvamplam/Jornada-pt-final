from pathlib import Path
import re

client_path = Path('app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx')
client = client_path.read_text()

old_remove = '''  function removeDynamicZone(clientId: string) {
    if (plan.dynamicZones.find((zone) => zone.clientId === clientId)?.columnGroup) {
      setMessage("Desagrupa as colunas antes de apagar uma zona."); return;
    }
    const index = plan.dynamicZones.findIndex((zone) => zone.clientId === clientId);
    if (index < 0) return;
    const dynamicZones = renumberAutomaticDynamicZoneTitles(
      plan.dynamicZones.filter((zone) => zone.clientId !== clientId),
    );
    const videoPosition = Math.min(
      plan.settings.videoPosition
        - (index < plan.settings.videoPosition ? 1 : 0),
      dynamicZones.length,
    );
    commit(
      {
        ...plan,
        dynamicZones,
        settings: {
          ...plan.settings,
          videoPosition: Math.max(videoPosition, 0),
        },
      },
      "Zona editorial retirada. As notícias regressaram ao reservatório.",
    );
    const fallback = dynamicZones[Math.min(index, Math.max(0, dynamicZones.length - 1))];
    setActiveWorkspaceKey(fallback ? `dynamic:${fallback.clientId}` : "opening");
    setSelectedReorderBlockKey((current) =>
      current === `dynamic:${clientId}` ? null : current,
    );
    setSelectedBankItemIds([]);
  }
'''
new_remove = '''  function removeDynamicZone(clientId: string) {
    const selectedZone = plan.dynamicZones.find((zone) => zone.clientId === clientId);
    if (!selectedZone) return;
    const columnGroup = columnGroupForZone(columnGroupsForPlan(), clientId);
    const removedIds = new Set(columnGroup?.zoneIds ?? [clientId]);
    const removedIndexes = plan.dynamicZones.flatMap((zone, index) => removedIds.has(zone.clientId) ? [index] : []);
    if (removedIndexes.length === 0) return;
    const firstIndex = Math.min(...removedIndexes);
    const removedBeforeVideo = removedIndexes.filter((index) => index < plan.settings.videoPosition).length;
    const dynamicZones = renumberAutomaticDynamicZoneTitles(
      plan.dynamicZones.filter((zone) => !removedIds.has(zone.clientId)),
    );
    const videoPosition = Math.min(
      plan.settings.videoPosition - removedBeforeVideo,
      dynamicZones.length,
    );
    commit(
      {
        ...plan,
        dynamicZones,
        settings: {
          ...plan.settings,
          videoPosition: Math.max(videoPosition, 0),
        },
      },
      columnGroup
        ? "Grupo de cinco colunas retirado. As notícias regressaram ao reservatório."
        : "Zona editorial retirada. As notícias regressaram ao reservatório.",
    );
    const fallback = dynamicZones[Math.min(firstIndex, Math.max(0, dynamicZones.length - 1))];
    setActiveWorkspaceKey(fallback ? `dynamic:${fallback.clientId}` : "opening");
    setSelectedReorderBlockKey((current) => {
      if (!current?.startsWith("dynamic:")) return current;
      return removedIds.has(current.slice("dynamic:".length)) ? null : current;
    });
    setSelectedBankItemIds([]);
  }
'''
if client.count(old_remove) != 1:
    raise SystemExit(f'removeDynamicZone source drift: {client.count(old_remove)}')
client = client.replace(old_remove, new_remove)

old_import = '''                <button type="button" disabled={pendingCount > 0 || isApplying} onClick={async () => {
                  setIsApplying(true);
                  try {
                    const body = new FormData();
                    body.set("action_type", "import_column_groups"); body.set("matchday_id", matchdayId); body.set("composition_id", compositionId);
                    body.set("expected_column_groups_json", JSON.stringify(columnGroupsForPlan(basePlan.dynamicZones)));
                    const response = await fetch("/api/admin/editorial/composicao", { method: "POST", body });
                    const result = await response.json();
                    if (!response.ok || !result.ok) throw new Error(result.message ?? "Importação recusada.");
                    window.location.reload();
                  } catch (error) { setMessage(error instanceof Error ? error.message : "Importação recusada."); }
                  finally { setIsApplying(false); }
                }}>Importar grupos da Viva</button>'''
new_import = '''                <button type="button" disabled={pendingCount > 0 || isApplying} onClick={async () => {
                  setIsApplying(true);
                  try {
                    const body = new FormData();
                    body.set("action_type", "import_viva_zones"); body.set("matchday_id", matchdayId); body.set("composition_id", compositionId);
                    body.set("expected_column_groups_json", JSON.stringify(columnGroupsForPlan(basePlan.dynamicZones)));
                    const response = await fetch("/api/admin/editorial/composicao", { method: "POST", body });
                    const result = await response.json() as { ok?: boolean; importedZoneCount?: number; message?: string };
                    if (!response.ok || !result.ok) throw new Error(result.message ?? "Importação recusada.");
                    if ((result.importedZoneCount ?? 0) === 0) {
                      setMessage(result.message ?? "Todas as zonas da Viva já estão nesta composição.");
                      return;
                    }
                    window.location.reload();
                  } catch (error) { setMessage(error instanceof Error ? error.message : "Importação recusada."); }
                  finally { setIsApplying(false); }
                }}>Importar zonas da Viva</button>'''
if client.count(old_import) != 1:
    raise SystemExit(f'import button source drift: {client.count(old_import)}')
client = client.replace(old_import, new_import)

old_label = '''                      >
                        Remover
                      </button>'''
new_label = '''                      >
                        {columnGroupForZone(columnGroupsForPlan(), zone.clientId) ? "Remover grupo" : "Remover"}
                      </button>'''
if client.count(old_label) != 1:
    raise SystemExit(f'remove label source drift: {client.count(old_label)}')
client = client.replace(old_label, new_label)
client_path.write_text(client)

route_path = Path('app/api/admin/editorial/composicao/route.ts')
route = route_path.read_text()
pattern = re.compile(r'''  if \(actionType === "import_column_groups"\) \{.*?\n  \}\n\n(?=  if \(actionType === )''', re.S)
matches = list(pattern.finditer(route))
if len(matches) != 1:
    raise SystemExit(f'import route source drift: {len(matches)}')
replacement = '''  if (actionType === "import_viva_zones") {
    if (!(await hasAuthenticatedAdminSession())) return Response.json({ ok: false, message: "É necessária uma sessão administrativa válida." }, { status: 401 });
    try {
      const compositionId = cleanText(formData.get("composition_id"));
      if (!matchdayId || !compositionId || !UUID_PATTERN.test(matchdayId) || !UUID_PATTERN.test(compositionId)) throw new Error("invalid-context");
      const expected = parseEditorialColumnGroups(JSON.parse(cleanText(formData.get("expected_column_groups_json")) ?? "[]"));
      const rows = await writeSupabaseAdminReturning<{ imported_zone_count: number }>("rpc/import_historical_viva_zones_v32", {
        method: "POST",
        body: JSON.stringify({
          p_matchday_id: matchdayId,
          p_composition_id: compositionId,
          p_expected_column_groups: expected,
        }),
      });
      const importedZoneCount = Number(rows[0]?.imported_zone_count ?? 0);
      return Response.json({
        ok: true,
        importedZoneCount,
        message: importedZoneCount === 0
          ? "Todas as zonas da Viva já estão nesta composição."
          : `${importedZoneCount} ${importedZoneCount === 1 ? "zona importada" : "zonas importadas"} da Viva.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível importar as zonas da Viva.";
      return Response.json({ ok: false, message }, { status: 400 });
    }
  }

'''
route = pattern.sub(replacement, route, count=1)
route_path.write_text(route)
