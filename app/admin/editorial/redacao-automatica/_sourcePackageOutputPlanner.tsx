"use client";

import { useState } from "react";

import {
  EDITORIAL_SOURCE_PACKAGE_MAX_DOSSIER_OUTPUTS,
  EDITORIAL_SOURCE_PACKAGE_OUTPUT_FOCUS_MAX_LENGTH,
  type EditorialSourcePackageOutput,
} from "@/lib/redacao-automatica/editorial-source-package-internal";

import styles from "./redacao-automatica.module.css";

type OutputImageCandidate = Readonly<{
  newsroomArticleId: string;
  sourceName: string;
  title: string;
  imageUrl: string;
}>;

type SourcePackageOutputPlannerProps = Readonly<{
  actionUrl: string;
  sourceArticlePosition: number;
  outputs: readonly EditorialSourcePackageOutput[];
  imageCandidates: readonly OutputImageCandidate[];
}>;

export default function SourcePackageOutputPlanner({
  actionUrl,
  sourceArticlePosition,
  outputs,
  imageCandidates,
}: SourcePackageOutputPlannerProps) {
  const [outputCount, setOutputCount] =
    useState(Math.max(1, outputs.length));

  const rows =
    Array.from(
      { length: outputCount },
      (_, index) => {
        const position = index + 1;
        const existing = outputs[index];

        return {
          position,
          focus:
            existing?.focus
            ?? `Artigo ${String(position).padStart(2, "0")}`,
          imageNewsroomArticleId:
            existing?.imageNewsroomArticleId
            ?? imageCandidates[0]?.newsroomArticleId
            ?? "",
        };
      },
    );

  return (
    <section
      className={styles.sourcePackageOutputPlanner}
      aria-labelledby="source-package-outputs-title"
    >
      <div
        className={
          styles.sourcePackageOutputPlannerHeader
        }
      >
        <div>
          <p className={styles.sectionEyebrow}>
            Saídas editoriais do Dossiê
          </p>

          <h3 id="source-package-outputs-title">
            Artigos a produzir
          </h3>

          <p>
            As fontes continuam juntas no mesmo Dossiê.
            Define quantos artigos devem nascer dele,
            o foco de cada peça e a respetiva imagem.
          </p>
        </div>

        <label>
          <span>Quantidade</span>

          <select
            value={outputCount}
            onChange={(event) =>
              setOutputCount(
                Number(event.target.value),
              )
            }
          >
            {Array.from(
              {
                length:
                  EDITORIAL_SOURCE_PACKAGE_MAX_DOSSIER_OUTPUTS,
              },
              (_, index) => (
                <option
                  key={index + 1}
                  value={index + 1}
                >
                  {index + 1}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      <form
        action={actionUrl}
        method="post"
        className={styles.sourcePackageOutputForm}
      >
        <input
          type="hidden"
          name="update_mode"
          value="outputs"
        />

        <input
          type="hidden"
          name="output_count"
          value={outputCount}
        />

        <div
          className={
            styles.sourcePackageOutputRows
          }
        >
          {rows.map((row) => (
            <section
              className={
                styles.sourcePackageOutputCard
              }
              key={row.position}
            >
              <div
                className={
                  styles.sourcePackageOutputNumber
                }
              >
                {String(row.position).padStart(2, "0")}
              </div>

              <input
                type="hidden"
                name={
                  `output_source_group_${row.position}`
                }
                value={sourceArticlePosition}
              />

              <label
                className={
                  styles.sourcePackageOutputFocus
                }
              >
                <span>Foco editorial</span>

                <input
                  type="text"
                  name={
                    `output_focus_${row.position}`
                  }
                  defaultValue={row.focus}
                  maxLength={
                    EDITORIAL_SOURCE_PACKAGE_OUTPUT_FOCUS_MAX_LENGTH
                  }
                  required
                  placeholder="Ex.: Crónica do jogo, Reações, Arbitragem"
                />
              </label>

              <fieldset
                className={
                  styles.sourcePackageOutputImages
                }
              >
                <legend>
                  Imagem deste artigo
                </legend>

                {imageCandidates.length > 0
                  ? (
                    <div
                      className={
                        styles.sourcePackageOutputImageGrid
                      }
                    >
                      {imageCandidates.map(
                        (candidate) => (
                          <label
                            className={
                              styles.sourcePackageOutputImageOption
                            }
                            key={
                              candidate.newsroomArticleId
                            }
                          >
                            <input
                              type="radio"
                              name={
                                `output_image_${row.position}`
                              }
                              value={
                                candidate.newsroomArticleId
                              }
                              defaultChecked={
                                candidate.newsroomArticleId
                                === row.imageNewsroomArticleId
                              }
                            />

                            <img
                              src={
                                candidate.imageUrl
                              }
                              alt=""
                              loading="lazy"
                            />

                            <span>
                              <strong>
                                {
                                  candidate.sourceName
                                }
                              </strong>

                              <small>
                                {candidate.title}
                              </small>
                            </span>
                          </label>
                        ),
                      )}
                    </div>
                  )
                  : (
                    <>
                      <input
                        type="hidden"
                        name={
                          `output_image_${row.position}`
                        }
                        value=""
                      />

                      <p
                        className={
                          styles.sourcePackageOutputNoImage
                        }
                      >
                        O Dossiê não contém imagens de fonte
                        disponíveis. A imagem poderá ser
                        resolvida na publicação.
                      </p>
                    </>
                  )}
              </fieldset>
            </section>
          ))}
        </div>

        <div
          className={
            styles.sourcePackageOutputActions
          }
        >
          <button type="submit">
            Guardar artigos e imagens
          </button>

          <p>
            Depois de guardar, o pacote enviado ao ChatGPT
            exigirá exatamente este número de artigos.
          </p>
        </div>
      </form>
    </section>
  );
}
