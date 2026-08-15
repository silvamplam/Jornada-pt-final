import MatchdayEditorialDeskClient from "./MatchdayEditorialDeskClient";
import { readMatchdayEditorialDesk } from "@/lib/editorial-matchday-desk";

export const dynamic = "force-dynamic";

type MatchdayEditorialDeskPageProps = {
  params: Promise<{ matchdayId: string }>;
};

const deskStyles = `
  body {
    margin: 0;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  * { box-sizing: border-box; }

  .desk-shell {
    min-height: 100vh;
    padding: 10px 12px;
  }

  .desk-hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    max-width: 1920px;
    min-height: 50px;
    margin: 0 auto;
    padding: 8px 12px;
    border-radius: 8px;
    background: #10151b;
    color: #ffffff;
    box-shadow: 0 8px 20px rgba(12, 22, 34, 0.10);
  }

  .desk-hero-main {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
  }

  .desk-hero p,
  .desk-hero h1,
  .desk-hero small { margin: 0; }

  .desk-hero p {
    flex: 0 0 auto;
    color: #ff4a50;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .05em;
    text-transform: uppercase;
  }

  .desk-hero h1 {
    font-size: 20px;
    line-height: 1.1;
  }

  .desk-hero small {
    color: #cbd5e1;
    font-size: 11px;
  }

  .desk-hero-context {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    color: #cbd5e1;
    font-size: 12px;
    font-weight: 700;
  }

  .desk-hero-context strong {
    color: #ffffff;
  }

  .desk-mode-badge {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    margin-left: 4px;
    padding: 2px 7px;
    border: 1px solid rgba(255,255,255,.22);
    border-radius: 999px;
    color: #dbeafe;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .03em;
    text-transform: uppercase;
  }

  .desk-hero nav {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .desk-hero a,
  .desk-pending-bar button,
  .desk-bulk-bar button,
  .desk-filters button,
  .desk-zone .visibility {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .desk-hero a {
    padding: 7px 10px;
    border-color: rgba(255,255,255,.28);
    background: transparent;
    color: #ffffff;
    text-decoration: none;
  }

  .desk-workspace {
    position: relative;
    display: grid;
    grid-template-columns: minmax(420px, .9fr) minmax(620px, 1.1fr);
    gap: 10px;
    max-width: 1920px;
    margin: 8px auto 62px;
  }

  .desk-library,
  .desk-map {
    height: calc(100vh - 126px);
    min-height: 500px;
    overflow: auto;
    border: 1px solid #d8e0e9;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 7px 18px rgba(12, 22, 34, .05);
  }

  .desk-library-toolbar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid #dce3eb;
    background: rgba(255,255,255,.98);
    backdrop-filter: blur(8px);
  }

  .desk-search-row {
    display: grid;
    grid-template-columns: minmax(0,1fr) auto;
    gap: 7px;
    align-items: center;
  }

  .desk-search-row input,
  .desk-bulk-bar select {
    min-height: 34px;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 12px;
  }

  .desk-search-row input { padding: 0 10px; }
  .desk-search-row strong { font-size: 11px; color: #64748b; }

  .desk-filters,
  .desk-bulk-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
  }

  .desk-filters button,
  .desk-bulk-bar button,
  .desk-zone .visibility,
  .desk-pending-bar button {
    min-height: 28px;
    padding: 4px 8px;
  }

  .desk-filters button.active,
  .desk-bulk-bar button.primary {
    border-color: #1d4ed8;
    background: #1d4ed8;
    color: #ffffff;
  }

  .desk-bulk-bar {
    padding-top: 6px;
    border-top: 1px solid #edf1f5;
  }

  .desk-bulk-bar strong {
    margin-right: 2px;
    font-size: 11px;
  }

  .desk-bulk-bar select {
    min-width: 190px;
    padding: 0 7px;
  }

  .desk-message {
    margin: 0;
    padding: 5px 8px;
    border-radius: 5px;
    background: #eff6ff;
    color: #1e3a8a;
    font-size: 11px;
    font-weight: 700;
  }

  .desk-article-list {
    display: grid;
    gap: 5px;
    padding: 7px;
  }

  .desk-article-row {
    position: relative;
    display: grid;
    grid-template-columns: 18px 22px 56px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    min-height: 64px;
    padding: 6px;
    border: 1px solid #e0e6ed;
    border-radius: 6px;
    background: #ffffff;
    cursor: pointer;
  }

  .desk-article-row.selected {
    border-color: #2563eb;
    box-shadow: inset 3px 0 0 #2563eb;
  }

  .desk-article-row input { width: 15px; height: 15px; }

  .desk-selection-rank {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #1d4ed8;
    color: #ffffff;
    font-size: 10px;
  }

  .desk-selection-rank.empty { background: #eef2f6; color: #94a3b8; }

  .desk-article-row img,
  .desk-image-placeholder {
    display: block;
    width: 56px;
    height: 42px;
    border-radius: 4px;
    background: #e9eef4;
    object-fit: cover;
  }

  .desk-article-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .desk-article-copy strong {
    overflow: hidden;
    font-size: 13px;
    line-height: 1.14;
    text-overflow: ellipsis;
  }

  .desk-article-copy small {
    color: #526174;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .02em;
  }

  .desk-article-meta {
    display: flex;
    gap: 7px;
    align-items: center;
    color: #64748b;
    font-size: 9px;
  }

  .desk-article-meta em {
    color: #c40012;
    font-style: normal;
    font-weight: 900;
    text-transform: uppercase;
  }

  .desk-article-copy mark {
    width: fit-content;
    padding: 1px 4px;
    border-radius: 3px;
    background: #fff2cc;
    color: #6b4f00;
    font-size: 9px;
    font-weight: 800;
  }

  .desk-map {
    display: grid;
    gap: 7px;
    align-content: start;
    padding: 8px;
  }

  .desk-map-summary {
    position: sticky;
    top: -8px;
    z-index: 4;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    min-height: 30px;
    padding: 5px 7px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: rgba(255,255,255,.98);
    backdrop-filter: blur(8px);
  }

  .desk-map-summary div {
    display: flex;
    align-items: baseline;
    gap: 4px;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .desk-map-summary span {
    color: #64748b;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .desk-map-summary strong {
    color: #10151b;
    font-size: 13px;
  }

  .desk-zone {
    display: grid;
    gap: 6px;
    padding: 8px;
    border: 1px solid #dce3eb;
    border-radius: 7px;
    background: #f8fafc;
  }

  .desk-zone > header {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
  }

  .desk-zone h3,
  .desk-zone p { margin: 0; }

  .desk-zone h3 { font-size: 14px; }
  .desk-zone p { margin-top: 1px; color: #64748b; font-size: 10px; }

  .desk-zone > header > span {
    color: #64748b;
    font-size: 9px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .desk-zone-slots {
    display: grid;
    gap: 6px;
  }

  .desk-zone-slots-1 { grid-template-columns: 1fr; }
  .desk-zone-slots-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .desk-zone-slots-4 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .desk-zone-slots-5 { grid-template-columns: repeat(5, minmax(0,1fr)); }
  .desk-zone-slots-6 { grid-template-columns: repeat(3, minmax(0,1fr)); }

  .desk-slot {
    position: relative;
    min-width: 0;
    min-height: 66px;
    padding: 6px;
    border: 1px dashed #b8c4d2;
    border-radius: 5px;
    background: #ffffff;
  }

  .desk-slot > small {
    display: block;
    margin-bottom: 4px;
    color: #64748b;
    font-size: 8px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .desk-slot-empty {
    display: grid;
    place-items: center;
    min-height: 42px;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
  }

  .desk-slot-card {
    position: relative;
    min-height: 44px;
    padding: 6px 6px 15px;
    border-radius: 5px;
    background: #ffffff;
    box-shadow: 0 2px 7px rgba(15,23,42,.07);
    cursor: grab;
  }

  .desk-slot-card:active { cursor: grabbing; }

  .desk-slot-card strong {
    display: block;
    padding-right: 2px;
    font-size: 11px;
    line-height: 1.12;
  }

  .desk-drag-hint {
    position: absolute;
    right: 6px;
    bottom: 3px;
    color: #94a3b8;
    font-size: 8px;
    font-weight: 700;
    pointer-events: none;
  }

  .desk-slot-drop-target {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .desk-faixa.hidden-zone { opacity: .55; }
  .desk-zone .visibility.public { border-color: #15803d; color: #15803d; }

  .desk-faixa-slots {
    display: flex;
    gap: 6px;
    min-height: 72px;
    padding-bottom: 3px;
    overflow-x: auto;
  }

  .desk-faixa-slot {
    flex: 0 0 180px;
  }

  .desk-warning {
    padding: 8px;
    border: 1px solid #f1c76b;
    border-radius: 6px;
    background: #fff8e6;
    color: #684b0e;
  }

  .desk-warning strong { font-size: 11px; }
  .desk-warning p { margin: 3px 0 0; font-size: 10px; }

  .desk-pending-bar {
    position: fixed;
    z-index: 20;
    right: 12px;
    bottom: 8px;
    left: 12px;
    display: flex;
    gap: 6px;
    align-items: center;
    max-width: 1920px;
    margin: 0 auto;
    padding: 7px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: rgba(255,255,255,.97);
    box-shadow: 0 10px 26px rgba(15,23,42,.16);
    backdrop-filter: blur(10px);
  }

  .desk-pending-bar div {
    display: grid;
    gap: 1px;
    margin-right: auto;
  }

  .desk-pending-bar strong { font-size: 12px; }
  .desk-pending-bar span { color: #64748b; font-size: 9px; }
  .desk-pending-bar button:disabled { opacity: .45; cursor: default; }
  .desk-pending-bar button.apply { border-color: #1d4ed8; background: #1d4ed8; color: #ffffff; }

  @media (max-width: 1180px) {
    .desk-workspace { grid-template-columns: 1fr; }
    .desk-library, .desk-map { height: auto; max-height: none; min-height: 0; }
    .desk-zone-slots-5, .desk-zone-slots-6 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }

  @media (max-width: 720px) {
    .desk-shell { padding: 8px; }
    .desk-hero { align-items: flex-start; flex-wrap: wrap; }
    .desk-hero nav { justify-content: flex-start; }
    .desk-map-summary { position: static; }
    .desk-zone-slots-3,
    .desk-zone-slots-4,
    .desk-zone-slots-5,
    .desk-zone-slots-6 { grid-template-columns: 1fr; }
    .desk-article-row { grid-template-columns: 18px 22px minmax(0,1fr); }
    .desk-article-row img,
    .desk-image-placeholder { display: none; }
    .desk-pending-bar { right: 8px; bottom: 8px; left: 8px; flex-wrap: wrap; }
    .desk-pending-bar div { flex: 1 1 100%; }
  }`;

export default async function MatchdayEditorialDeskPage({ params }: MatchdayEditorialDeskPageProps) {
  const { matchdayId } = await params;
  const snapshot = await readMatchdayEditorialDesk(matchdayId);

  if (!snapshot) {
    return (
      <main className="desk-shell">
        <style dangerouslySetInnerHTML={{ __html: deskStyles }} />
        <section className="desk-hero">
          <div>
            <p>Mesa de Edição · Beta</p>
            <h1>Jornada não encontrada</h1>
            <small>Não foi possível carregar esta jornada.</small>
          </div>
          <nav><a href="/admin">Voltar ao Backoffice</a></nav>
        </section>
      </main>
    );
  }

  return (
    <main className="desk-shell">
      <style dangerouslySetInnerHTML={{ __html: deskStyles }} />
      <section className="desk-hero">
        <div className="desk-hero-main">
          <p>{"Mesa de Edi\u00e7\u00e3o \u00b7 Beta"}</p>
          <div className="desk-hero-context">
            <strong>{snapshot.competitionName}</strong>
            <span>·</span>
            <span>{snapshot.seasonLabel}</span>
            <span>·</span>
            <span>{snapshot.matchdayLabel}</span>
            <span>·</span>
            <span>{snapshot.articles.length} {"not\u00edcias"}</span>
            <span className="desk-mode-badge" title="Ensaio não destrutivo">Modo de ensaio</span>
          </div>
        </div>
        <nav>
          <a href={`/admin/editorial/jornada/${snapshot.matchdayId}`}>Editorial atual</a>
          <a href="/admin">Backoffice</a>
        </nav>
      </section>
      <MatchdayEditorialDeskClient snapshot={snapshot} />
    </main>
  );
}