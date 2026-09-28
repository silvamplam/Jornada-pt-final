"use client";

import { useId, useRef, useState } from "react";
import { normalizeEditorialZoneTitleColor } from "@/lib/editorial-zone-title-color";

export default function EditorialZoneTitleColorControl({ value, onChange, disabled = false }: {
  value: string | null;
  onChange: (color: string | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  const hexInput = useRef<HTMLInputElement>(null);
  return <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <legend>Cor do título da coluna</legend>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
      <button type="button" onClick={() => {
        if (hexInput.current) hexInput.current.value = "";
        setInvalid(false); onChange(null);
      }}>Usar default</button>
    </div>
    {invalid ? <small id={id} role="alert">Usa uma cor no formato #RRGGBB.</small> : null}
  </fieldset>;
}
