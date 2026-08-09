"use client";

import { useMemo, useState, type CSSProperties } from "react";

export const EDITORIAL_COLOR_PRESET_LIST_ID = "editorial-color-presets";

export const EDITORIAL_COLOR_PRESETS = [
  ["#10151b", "Texto principal"],
  ["#607086", "Texto secundário"],
  ["#c40012", "Jornada.pt — vermelho"],
  ["#00235a", "Liga Portugal — azul"],
  ["#f4c300", "Liga Portugal — dourado"],
  ["#3d195b", "Premier League — roxo"],
  ["#00ff85", "Premier League — verde"],
  ["#04f5ff", "Premier League — azul"],
  ["#ff4b44", "LaLiga — coral"],
  ["#f7b32b", "LaLiga — dourado"],
  ["#3478f6", "LaLiga — azul"],
  ["#7c4dff", "LaLiga — violeta"],
  ["#20c4d9", "LaLiga — ciano"],
  ["#e30613", "Benfica — vermelho"],
  ["#0046ad", "FC Porto — azul"],
  ["#008c45", "Sporting — verde"],
  ["#d71920", "Braga — vermelho"],
] as const;

type EditorialColorInputProps = {
  id?: string;
  name: string;
  form?: string;
  defaultValue?: string | null;
  placeholder?: string;
  pattern?: string;
};

const colorControlStyles = `
  .editorial-color-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(190px, 250px) 28px;
    gap: 8px;
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  .editorial-color-control > input,
  .editorial-color-control > select {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
  }

  .editorial-color-control > select {
    cursor: pointer;
  }

  .editorial-color-swatch {
    box-sizing: border-box;
    display: block;
    width: 28px;
    height: 28px;
    border: 1px solid #cdd6e1;
    border-radius: 5px;
    background: var(--editorial-color-swatch, #ffffff);
    box-shadow: inset 0 0 0 2px #ffffff;
  }

  @media (max-width: 720px) {
    .editorial-color-control {
      grid-template-columns: minmax(0, 1fr) 28px;
    }

    .editorial-color-control > select {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .editorial-color-swatch {
      grid-column: 2;
      grid-row: 1;
    }
  }
`;

export function EditorialColorInput({
  id,
  name,
  form,
  defaultValue,
  placeholder,
  pattern,
}: EditorialColorInputProps) {
  const [value, setValue] = useState(defaultValue?.trim() ?? "");
  const selectedPreset = useMemo(() => {
    const normalizedValue = value.trim().toLowerCase();
    return EDITORIAL_COLOR_PRESETS.find(([preset]) => preset.toLowerCase() === normalizedValue)?.[0] ?? "";
  }, [value]);
  const swatchColor = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#ffffff";

  return (
    <div className="editorial-color-control">
      <style>{colorControlStyles}</style>
      <input
        id={id}
        form={form}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        pattern={pattern}
        list={EDITORIAL_COLOR_PRESET_LIST_ID}
      />
      <select
        aria-label="Cores principais"
        value={selectedPreset}
        onChange={(event) => {
          if (event.target.value) {
            setValue(event.target.value);
          }
        }}
      >
        <option value="">Cores principais…</option>
        {EDITORIAL_COLOR_PRESETS.map(([preset, label]) => (
          <option key={`${label}-${preset}`} value={preset}>
            {label} · {preset}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="editorial-color-swatch"
        style={{ "--editorial-color-swatch": swatchColor } as CSSProperties}
      />
    </div>
  );
}

export default function EditorialColorPresets() {
  return (
    <datalist id={EDITORIAL_COLOR_PRESET_LIST_ID}>
      {EDITORIAL_COLOR_PRESETS.map(([value, label]) => (
        <option key={`${label}-${value}`} label={label} value={value} />
      ))}
    </datalist>
  );
}
