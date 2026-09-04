"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { readAdminJsonResponse } from "@/lib/admin-json-response";
import type {
  MatchdayEditorialProfileDeskAutomaticItem,
  MatchdayEditorialSelectionCandidate,
} from "@/lib/editorial-matchday-profile-desk";
import {
  thematicEditorialIdentity,
} from "@/lib/editorial-matchday-profile-desk-operations";
import type {
  EditorialProfileZoneKey,
} from "@/lib/editorial-profiles";

type ClassificationZone = Readonly<{
  key: EditorialProfileZoneKey;
  label: string;
}>;

type ClassificationItem = Readonly<{
  bankItemId: string;
  title: string;
  label: string | null;
  classificationKey: EditorialProfileZoneKey | null;
}>;

type CorrectionResponse = Readonly<{
  ok?: boolean;
  message?: string;
}>;

export default function MatchdayContextualClassificationCorrectionPanel({
  activeItems,
  candidates,
  matchdayId,
  zones,
}: Readonly<{
  activeItems: readonly MatchdayEditorialProfileDeskAutomaticItem[];
  candidates: readonly MatchdayEditorialSelectionCandidate[];
  matchdayId: string;
  zones: readonly ClassificationZone[];
}>) {
  const router = useRouter();

  const items =
    useMemo<readonly ClassificationItem[]>(
      () => {
        const activeByIdentity =
          new Map(
            activeItems.map(
              (item) => [
                thematicEditorialIdentity(
                  item.sourceType,
                  item.sourceId,
                ),
                item,
              ] as const,
            ),
          );

        return candidates
          .flatMap((candidate) => {
            const sourceType =
              candidate.sourceType
                ?.trim()
                .toLowerCase()
              ?? "";

            const sourceId =
              candidate.sourceId
                ?.trim()
                .toLowerCase()
              ?? "";

            if (
              sourceType !== "editorial_article"
              || !sourceId
            ) {
              return [];
            }

            const activeItem =
              activeByIdentity.get(
                thematicEditorialIdentity(
                  sourceType,
                  sourceId,
                ),
              );

            if (!activeItem) {
              return [];
            }

            return [{
              bankItemId:
                candidate.bankItemId
                  .trim()
                  .toLowerCase(),
              title:
                candidate.title,
              label:
                candidate.label,
              classificationKey:
                activeItem.classifiedZoneKey,
            }];
          })
          .sort(
            (left, right) =>
              left.title.localeCompare(
                right.title,
                "pt-PT",
              ),
          );
      },
      [
        activeItems,
        candidates,
      ],
    );

  const firstItem =
    items[0] ?? null;

  const defaultZoneKey =
    zones[0]?.key
      ?? "outside_liga_other";

  const [
    bankItemId,
    setBankItemId,
  ] = useState(
    firstItem?.bankItemId ?? "",
  );

  const [
    classificationKey,
    setClassificationKey,
  ] = useState<EditorialProfileZoneKey>(
    firstItem?.classificationKey
      ?? defaultZoneKey,
  );

  const [
    state,
    setState,
  ] = useState<
    "idle"
    | "saving"
    | "saved"
    | "error"
  >("idle");

  const [
    message,
    setMessage,
  ] = useState("");

  const selectedItem =
    items.find(
      (item) =>
        item.bankItemId === bankItemId,
    ) ?? null;

  const currentZone =
    selectedItem?.classificationKey
      ? zones.find(
          (zone) =>
            zone.key
              === selectedItem.classificationKey,
        ) ?? null
      : null;

  function selectItem(
    nextBankItemId: string,
  ) {
    const nextItem =
      items.find(
        (item) =>
          item.bankItemId
            === nextBankItemId,
      ) ?? null;

    setBankItemId(
      nextBankItemId,
    );

    setClassificationKey(
      nextItem?.classificationKey
        ?? defaultZoneKey,
    );

    setState("idle");
    setMessage("");
  }

  async function correctClassification() {
    if (
      !selectedItem
      || state === "saving"
    ) {
      return;
    }

    setState("saving");
    setMessage("");

    try {
      const response =
        await fetch(
          `/api/admin/editorial/jornada/${encodeURIComponent(
            matchdayId,
          )}/organizar/classificacao`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              bankItemId:
                selectedItem.bankItemId,
              classificationKey,
            }),
          },
        );

      const result =
        await readAdminJsonResponse<
          CorrectionResponse
        >(response);

      if (
        !response.ok
        || result.ok !== true
      ) {
        throw new Error(
          result.message
            ?? "A correção foi recusada.",
        );
      }

      setState("saved");

      setMessage(
        result.message
          ?? "Classificação corrigida. A posição editorial não foi alterada.",
      );

      router.refresh();
    } catch (error) {
      setState("error");

      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível corrigir a classificação.",
      );
    }
  }

  return (
    <section
      aria-label="Corrigir classificação contextual"
      style={{
        display: "grid",
        gap: 7,
        minWidth: 420,
        padding: 7,
      }}
    >
      {items.length > 0 ? (
        <>
          <label className="thematic-field">
            Notícia
            <select
              disabled={state === "saving"}
              onChange={(event) =>
                selectItem(
                  event.target.value,
                )
              }
              value={bankItemId}
            >
              {items.map((item) => (
                <option
                  key={item.bankItemId}
                  value={item.bankItemId}
                >
                  {item.label
                    ? `${item.label} · `
                    : ""}
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          <label className="thematic-field">
            Classificação
            <select
              disabled={state === "saving"}
              onChange={(event) =>
                setClassificationKey(
                  event.target.value as EditorialProfileZoneKey,
                )
              }
              value={classificationKey}
            >
              {zones.map((zone) => (
                <option
                  key={zone.key}
                  value={zone.key}
                >
                  {zone.label}
                </option>
              ))}
            </select>
          </label>

          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            Atual:{" "}
            {currentZone?.label
              ?? "sem classificação"}.
            A classificação é contextual e não
            altera a posição editorial.
          </p>

          <button
            className="thematic-button dark"
            disabled={
              state === "saving"
              || !selectedItem
            }
            onClick={
              correctClassification
            }
            type="button"
          >
            {state === "saving"
              ? "A corrigir…"
              : "Corrigir classificação"}
          </button>

          {message ? (
            <p
              aria-live={
                state === "error"
                  ? "assertive"
                  : "polite"
              }
              className={`thematic-message${
                state === "error"
                  ? " error"
                  : ""
              }`}
              style={{
                position: "static",
              }}
            >
              {message}
            </p>
          ) : null}
        </>
      ) : (
        <p className="thematic-empty">
          Sem notícias editoriais disponíveis
          para classificação.
        </p>
      )}
    </section>
  );
}