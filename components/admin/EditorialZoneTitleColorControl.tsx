"use client";

import { useId, useRef, useState } from "react";
import { normalizeEditorialZoneTitleColor } from "@/lib/editorial-zone-title-color";

export default function EditorialZoneTitleColorControl({ value, onChange, disabled = false, compact = false }: {
  value: string | null;
  onChange: (color: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  const hexInput = useRef<HTMLInputElement>(null);
  return <fieldset className={`editorial-column-color-control${compact ? " is-compact" : ""}`} disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <style>{`
      .editorial-column-color-control { grid-column: 1 / -1; }
      .editorial-column-color-control legend { padding: 0; margin-bottom: 4px; font-size: 11px; line-height: 1.2; }
      .editorial-column-color-control input[type=color] { flex: 0 0 32px; width: 32px !important; height: 28px; min-height: 28px !important; padding: 2px !important; }
      .editorial-column-color-control input:not([type=color]) { flex: 0 0 96px; width: 96px !important; min-height: 28px !important; font-size: 12px; }
      .editorial-column-color-control button { min-height: 28px; padding: 3px 7px; border: 1px solid #cbd5df; border-radius: 4px; background: #fff; color: #263647; font: inherit; font-size: 11px; }
      .editorial-column-color-control.is-compact { grid-column: auto; }
      .editorial-column-color-control.is-compact legend { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      .editorial-column-color-control.is-compact input[type=color] { flex-basis: 28px; width: 28px !important; }
      .editorial-column-color-control.is-compact input:not([type=color]) { flex-basis: 78px; width: 78px !important; font-size: 11px; padding-inline: 5px; }
      .editorial-column-color-control.is-compact button { padding-inline: 5px; }
    `}</style>
    <legend>Cor do título da coluna</legend>
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 5 : 8, flexWrap: compact ? "nowrap" : "wrap" }}>
      <input type="color" aria-label="Escolher cor do título da coluna" value={value ?? "#526174"}
        onChange={(event) => { setInvalid(false); onChange(normalizeEditorialZoneTitleColor(event.target.value)); }} />
      <input ref={hexInput} key={value ?? "default"} aria-label="Cor hexadecimal do título da coluna"
        aria-invalid={invalid} aria-describedby={invalid ? id : undefined}
        defaultValue={value ?? ""} placeholder="Default" maxLength={7} style={{ width: 100 }}
        onBlur={(event) => {
          try {
            const color = normalizeEditorialZoneTitleColor(event.target.value || null);
            event.target.value = color ?? "";
            setInvalid(false); onChange(color);
          } catch { setInvalid(true); }
        }} />
      <button type="button" aria-label={compact ? "Usar default para a cor do título da coluna" : undefined} title={compact ? "Usar default" : undefined} onClick={() => {
        if (hexInput.current) hexInput.current.value = "";
        setInvalid(false); onChange(null);
      }}>{compact ? "Default" : "Usar default"}</button>
    </div>
    {invalid ? <small id={id} role="alert">Usa uma cor no formato #RRGGBB.</small> : null}
  </fieldset>;
}
