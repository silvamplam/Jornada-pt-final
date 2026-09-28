"use client";

import { columnGroupDiagnostic, columnGroupStoryCount, type EditorialColumnGroup } from "@/lib/editorial-column-groups";

export default function EditorialColumnGroupControls({ group, selectedZoneId, count, onSelect, onChange, onUngroup, disabled = false }: {
  group: EditorialColumnGroup;
  selectedZoneId: string;
  count: (zoneId: string) => number;
  onSelect: (zoneId: string) => void;
  onChange: (change: Partial<Pick<EditorialColumnGroup, "publicTitle" | "enabled">>) => void;
  onUngroup: () => void;
  disabled?: boolean;
}) {
  const diagnostic = columnGroupDiagnostic(group, count);
  return <div className="editorial-column-group-controls" data-column-group-id={group.id}>
    <style>{`
      .editorial-column-group-controls { padding: 4px 8px; display: grid; gap: 4px; background: #f3f6f9; border-bottom: 1px solid #dce3eb; color: #182532; }
      .editorial-column-group-title-row { display: flex; align-items: center; gap: 6px; }
      .editorial-column-group-title-row > input { flex: 1; min-width: 70px; height: 28px; padding: 3px 6px; box-sizing: border-box; border: 1px solid #cbd5df; border-radius: 5px; font: inherit; font-size: 12px; background: #fff; color: #10151b; }
      .editorial-column-group-count { font-size: 11px; font-weight: 800; white-space: nowrap; }
      .editorial-column-group-switch { display: flex; align-items: center; gap: 5px; }
      .editorial-column-group-switch span { color: #526174; font-size: 10px; }
      .editorial-column-group-title-row button { flex-shrink: 0; font: inherit; font-size: 11px; min-height: 28px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; color: #263647; padding: 3px 6px; white-space: nowrap; }
      .editorial-column-group-tabs { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 5px; }
      .editorial-column-group-tabs button { min-width: 0; min-height: 26px; padding: 3px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; color: #334155; font: inherit; font-size: 11px; white-space: nowrap; }
      .editorial-column-group-tabs button[aria-pressed=true] { color: #fff; background: #243c55; border-color: #243c55; font-weight: 800; }
      .editorial-column-group-diagnostic { margin: 0; font-size: 11px; line-height: 1.4; color: #735015; }
      @media(max-width: 600px) { .editorial-column-group-switch span { display: none; } }
    `}</style>
    <div className="editorial-column-group-title-row">
      <input aria-label="Título público do grupo" type="text" maxLength={120}
        key={`${group.id}:${group.publicTitle}`} defaultValue={group.publicTitle} disabled={disabled}
        onBlur={(event) => { if (event.target.value.trim() !== group.publicTitle) onChange({ publicTitle: event.target.value.trim() }); }} />
      <span className="editorial-column-group-count" aria-label="Total de histórias no grupo">{columnGroupStoryCount(group, count)}/25</span>
      <button className="editorial-column-group-switch" type="button" disabled={disabled}
        aria-label={group.enabled ? "Desligar grupo" : "Ligar grupo"} title={group.enabled ? "Grupo ligado — desligar" : "Grupo desligado — ligar"}
        onClick={() => onChange({ enabled: !group.enabled })}>
        <span>{group.enabled ? "Ligado" : "Desligado"}</span>{group.enabled ? "Desligar" : "Ligar"}
      </button>
      <button type="button" disabled={disabled} onClick={onUngroup}>Desagrupar</button>
    </div>
    <div className="editorial-column-group-tabs" role="group" aria-label="Colunas do grupo">
      {group.zoneIds.map((id, index) => <button key={id} type="button" aria-pressed={selectedZoneId === id}
        aria-label={`Coluna ${index + 1} · ${count(id)}/5`} onClick={() => onSelect(id)}>{index + 1} · {count(id)}/5</button>)}
    </div>
    {diagnostic ? <p className="editorial-column-group-diagnostic" role="status">{diagnostic}</p> : null}
  </div>;
}
