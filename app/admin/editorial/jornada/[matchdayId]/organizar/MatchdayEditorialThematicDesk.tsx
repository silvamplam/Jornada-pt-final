import type {
  MatchdayEditorialProfileDeskDiagnostic,
  MatchdayEditorialProfileDeskItem,
  MatchdayEditorialProfileDeskReadResult,
} from "@/lib/editorial-matchday-profile-desk";

const thematicDeskStyles = `
  body {
    margin: 0;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  * { box-sizing: border-box; }

  .thematic-desk-shell {
    min-height: 100vh;
    padding: 14px;
  }

  .thematic-desk-content {
    display: grid;
    gap: 12px;
    width: min(1500px, 100%);
    margin: 0 auto;
  }

  .thematic-desk-hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 18px 20px;
    border-radius: 10px;
    background: #10151b;
    color: #ffffff;
    box-shadow: 0 9px 24px rgba(12, 22, 34, .12);
  }

  .thematic-desk-eyebrow,
  .thematic-desk-hero h1,
  .thematic-desk-hero p { margin: 0; }

  .thematic-desk-eyebrow {
    color: #ff5c63;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .thematic-desk-hero h1 {
    margin-top: 4px;
    font-size: clamp(22px, 3vw, 34px);
    line-height: 1.05;
  }

  .thematic-desk-subtitle {
    margin-top: 7px !important;
    color: #cbd5e1;
    font-size: 13px;
  }

  .thematic-desk-badges,
  .thematic-desk-context {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .thematic-desk-badges { margin-top: 12px; }

  .thematic-desk-badge {
    padding: 4px 8px;
    border: 1px solid rgba(255, 255, 255, .24);
    border-radius: 999px;
    color: #dbeafe;
    font-size: 10px;
    font-weight: 800;
  }

  .thematic-desk-hero nav {
    display: flex;
    flex: 0 0 auto;
    gap: 7px;
  }

  .thematic-desk-hero a {
    padding: 8px 11px;
    border: 1px solid rgba(255, 255, 255, .28);
    border-radius: 6px;
    color: #ffffff;
    font-size: 12px;
    font-weight: 800;
    text-decoration: none;
  }

  .thematic-desk-context {
    padding: 11px 14px;
    border: 1px solid #d8e0e9;
    border-radius: 8px;
    background: #ffffff;
    color: #526174;
    font-size: 12px;
  }

  .thematic-desk-context strong { color: #10151b; }

  .thematic-desk-summary {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .thematic-desk-summary article {
    display: grid;
    gap: 3px;
    padding: 11px 12px;
    border: 1px solid #d8e0e9;
    border-radius: 8px;
    background: #ffffff;
  }

  .thematic-desk-summary span {
    color: #64748b;
    font-size: 10px;
    font-weight: 800;
  }

  .thematic-desk-summary strong { font-size: 20px; }

  .thematic-desk-zones { display: grid; gap: 10px; }

  .thematic-desk-zone,
  .thematic-desk-secondary {
    display: grid;
    gap: 10px;
    padding: 13px;
    border: 1px solid #d8e0e9;
    border-radius: 9px;
    background: #ffffff;
    box-shadow: 0 6px 16px rgba(12, 22, 34, .04);
  }

  .thematic-desk-zone > header,
  .thematic-desk-secondary > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .thematic-desk-zone h2,
  .thematic-desk-secondary h2,
  .thematic-desk-zone p,
  .thematic-desk-secondary p { margin: 0; }

  .thematic-desk-zone h2,
  .thematic-desk-secondary h2 { font-size: 17px; }

  .thematic-desk-zone-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 5px;
  }

  .thematic-desk-zone-meta span {
    padding: 3px 6px;
    border-radius: 4px;
    background: #eef2f6;
    color: #526174;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
  }

  .thematic-desk-items {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 8px;
  }

  .thematic-desk-item {
    display: grid;
    grid-template-columns: 28px 88px minmax(0, 1fr);
    gap: 9px;
    min-width: 0;
    min-height: 92px;
    padding: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    background: #f8fafc;
  }

  .thematic-desk-item-position {
    display: grid;
    place-items: center;
    align-self: start;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: #10151b;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
  }

  .thematic-desk-item-position.is-overflow {
    background: #e2e8f0;
    color: #526174;
  }

  .thematic-desk-image,
  .thematic-desk-image-placeholder {
    width: 88px;
    height: 66px;
    border-radius: 5px;
    background: #e8edf3;
    object-fit: cover;
  }

  .thematic-desk-item-copy {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: 3px;
  }

  .thematic-desk-item-label {
    color: #c40012;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .03em;
    text-transform: uppercase;
  }

  .thematic-desk-item-title {
    font-size: 13px;
    line-height: 1.2;
  }

  .thematic-desk-item-subtitle {
    color: #526174;
    font-size: 10px;
    line-height: 1.25;
  }

  .thematic-desk-item time {
    color: #64748b;
    font-size: 9px;
  }

  .thematic-desk-empty {
    padding: 12px;
    border: 1px dashed #cbd5e1;
    border-radius: 6px;
    color: #64748b;
    font-size: 12px;
    text-align: center;
  }

  .thematic-desk-history {
    color: #64748b;
    font-size: 11px;
  }

  .thematic-desk-diagnostics {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .thematic-desk-diagnostics li {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-left: 3px solid #d97706;
    background: #fff8e6;
    color: #684b0e;
    font-size: 11px;
  }

  .thematic-desk-diagnostics code { font-size: 9px; font-weight: 900; }

  @media (max-width: 1000px) {
    .thematic-desk-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (max-width: 650px) {
    .thematic-desk-shell { padding: 8px; }
    .thematic-desk-hero { align-items: flex-start; flex-direction: column; }
    .thematic-desk-summary { grid-template-columns: 1fr; }
    .thematic-desk-zone > header,
    .thematic-desk-secondary > header { flex-direction: column; }
    .thematic-desk-zone-meta { justify-content: flex-start; }
    .thematic-desk-items { grid-template-columns: 1fr; }
    .thematic-desk-item { grid-template-columns: 28px minmax(0, 1fr); }
    .thematic-desk-image,
    .thematic-desk-image-placeholder { display: none; }
  }
`;

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Lisbon",
});

function formattedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
}

function renderableImageUrl(value: string | null): value is string {
  if (!value) return false;
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function ArticleCard({ item, overflow = false }: Readonly<{
  item: MatchdayEditorialProfileDeskItem;
  overflow?: boolean;
}>) {
  const publishedAt = formattedDate(item.publishedAt);

  return (
    <article className="thematic-desk-item">
      <span className={`thematic-desk-item-position${overflow ? " is-overflow" : ""}`}>
        {overflow ? "—" : item.sortOrder}
      </span>
      {renderableImageUrl(item.imageUrl) ? (
        <img
          alt=""
          className="thematic-desk-image"
          height={66}
          loading="lazy"
          src={item.imageUrl}
          width={88}
        />
      ) : (
        <span aria-hidden="true" className="thematic-desk-image-placeholder" />
      )}
      <div className="thematic-desk-item-copy">
        {item.label ? <span className="thematic-desk-item-label">{item.label}</span> : null}
        <strong className="thematic-desk-item-title">{item.title ?? "Artigo sem título"}</strong>
        {item.subtitle ? <span className="thematic-desk-item-subtitle">{item.subtitle}</span> : null}
        {publishedAt ? <time dateTime={item.publishedAt ?? undefined}>{publishedAt}</time> : null}
      </div>
    </article>
  );
}

function Diagnostics({ diagnostics }: Readonly<{
  diagnostics: readonly MatchdayEditorialProfileDeskDiagnostic[];
}>) {
  if (diagnostics.length === 0) return null;

  return (
    <section className="thematic-desk-secondary" aria-labelledby="thematic-diagnostics-title">
      <header>
        <h2 id="thematic-diagnostics-title">Diagnósticos · {diagnostics.length}</h2>
      </header>
      <ul className="thematic-desk-diagnostics">
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}:${diagnostic.sourceType ?? ""}:${diagnostic.sourceId ?? ""}:${index}`}>
            <code>{diagnostic.code}</code>
            <span>{diagnostic.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function MatchdayEditorialThematicDesk({ desk }: Readonly<{
  desk: MatchdayEditorialProfileDeskReadResult;
}>) {
  const unsupported = desk.kind === "unsupported_profile";

  return (
    <main className="thematic-desk-shell">
      <style>{thematicDeskStyles}</style>
      <div className="thematic-desk-content">
        <header className="thematic-desk-hero">
          <div>
            <p className="thematic-desk-eyebrow">Mesa Temática</p>
            <h1>{unsupported ? "Perfil temático não suportado" : desk.profileDisplayName}</h1>
            <p className="thematic-desk-subtitle">Distribuição automática por atualidade</p>
            <div className="thematic-desk-badges">
              <span className="thematic-desk-badge">Modo de leitura</span>
              <span className="thematic-desk-badge">{desk.profileKey}</span>
            </div>
          </div>
          <nav>
            <a href={`/admin/editorial/jornada/${desk.matchdayId}`}>Editorial atual</a>
            <a href="/admin">Backoffice</a>
          </nav>
        </header>

        <section className="thematic-desk-context" aria-label="Contexto da Jornada">
          <strong>{desk.competitionName}</strong>
          <span>·</span>
          <span>{desk.seasonLabel}</span>
          <span>·</span>
          <span>{desk.matchdayLabel}</span>
        </section>

        {unsupported ? (
          <Diagnostics diagnostics={desk.diagnostics} />
        ) : (
          <>
            <section className="thematic-desk-summary" aria-label="Resumo das zonas temáticas">
              {desk.zones.map((zone) => (
                <article key={zone.key}>
                  <span>{zone.label}</span>
                  <strong>{zone.items.length}/{zone.capacity}</strong>
                </article>
              ))}
            </section>

            <section className="thematic-desk-zones" aria-label="Zonas temáticas">
              {desk.zones.map((zone) => (
                <article className="thematic-desk-zone" key={zone.key}>
                  <header>
                    <div>
                      <h2>{zone.label}</h2>
                      <p>{zone.items.length}/{zone.capacity} posições ocupadas</p>
                    </div>
                    <div className="thematic-desk-zone-meta">
                      <span>{zone.visualFamily}</span>
                      <span>{zone.placementMode}</span>
                    </div>
                  </header>
                  {zone.items.length > 0 ? (
                    <div className="thematic-desk-items">
                      {zone.items.map((item) => (
                        <ArticleCard item={item} key={`${item.sourceType}:${item.sourceId}`} />
                      ))}
                    </div>
                  ) : (
                    <p className="thematic-desk-empty">Sem notícias colocadas nesta zona.</p>
                  )}
                </article>
              ))}
            </section>

            <section className="thematic-desk-secondary" aria-labelledby="thematic-overflow-title">
              <header>
                <h2 id="thematic-overflow-title">Fora da capacidade automática · {desk.overflow.length}</h2>
              </header>
              {desk.overflow.length > 0 ? (
                <div className="thematic-desk-items">
                  {desk.overflow.map((item) => (
                    <ArticleCard item={item} key={`${item.sourceType}:${item.sourceId}`} overflow />
                  ))}
                </div>
              ) : (
                <p className="thematic-desk-empty">Sem notícias atuais fora da capacidade.</p>
              )}
              {desk.inactiveHistoricalCount > 0 ? (
                <p className="thematic-desk-history">
                  Estado histórico inativo: {desk.inactiveHistoricalCount}
                </p>
              ) : null}
            </section>

            <Diagnostics diagnostics={desk.diagnostics} />
          </>
        )}
      </div>
    </main>
  );
}
