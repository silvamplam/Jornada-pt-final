"use client";

import { columnGroupDiagnostic, type EditorialColumnGroup } from "@/lib/editorial-column-groups";

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
      .editorial-column-group-controls { padding: 10px; display: grid; gap: 9px; background: #f3f6f9; border-bottom: 1px solid #dce3eb; color: #182532; }
      .editorial-column-group-title-row { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }
      .editorial-column-group-title-row > label:first-child { flex: 1; display: grid; gap: 4px; min-width: 150px; font-size: 11px; font-weight: 700; }
      .editorial-column-group-title-row input[type=text] { min-height: 31px; width: 100%; padding: 4px 7px; box-sizing: border-box; border: 1px solid #cbd5df; border-radius: 5px; font: inherit; font-size: 13px; background: #fff; color: #10151b; }
      .editorial-column-group-switch { display: flex; align-items: center; gap: 4px; font-size: 11px; min-height: 31px; }
      .editorial-column-group-title-row button { font: inherit; font-size: 11px; min-height: 31px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; color: #263647; padding: 4px 7px; }
      .editorial-column-group-tabs { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 5px; }
      .editorial-column-group-tabs button { min-width: 0; min-height: 32px; padding: 5px 3px; border: 1px solid #cbd5df; border-radius: 5px; background: #fff; color: #334155; font: inherit; font-size: 11px; }
      .editorial-column-group-tabs button[aria-pressed=true] { color: #fff; background: #243c55; border-color: #243c55; font-weight: 800; }
      .editorial-column-group-diagnostic { margin: 0; font-size: 11px; line-height: 1.4; color: #735015; }
      @media(max-width: 600px) { .editorial-column-group-tabs { grid-template-columns: repeat(3,minmax(0,1fr)); } }
    `}</style>
    <div className="editorial-column-group-title-row">
      <label>Título do grupo<input aria-label="Título público do grupo" type="text" maxLength={120}
        key={`${group.id}:${group.publicTitle}`} defaultValue={group.publicTitle} disabled={disabled}
        onBlur={(event) => { if (event.target.value.trim() !== group.publicTitle) onChange({ publicTitle: event.target.value.trim() }); }} /></label>
      <label className="editorial-column-group-switch"><input type="checkbox" checked={group.enabled} disabled={disabled}
        onChange={(event) => onChange({ enabled: event.target.checked })} />Grupo ligado</label>
      <button type="button" disabled={disabled} onClick={onUngroup}>Desagrupar</button>
    </div>
    <div className="editorial-column-group-tabs" role="group" aria-label="Colunas do grupo">
      {group.zoneIds.map((id, index) => <button key={id} type="button" aria-pressed={selectedZoneId === id}
        onClick={() => onSelect(id)}>Coluna {index + 1} · {count(id)}/5</button>)}
    </div>
    {diagnostic ? <p className="editorial-column-group-diagnostic" role="status">{diagnostic}</p> : null}
  </div>;
}
