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
    padding: 22px;
  }

  .desk-hero {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
    max-width: 1680px;
    margin: 0 auto;
    padding: 20px 22px;
    border-radius: 10px;
    background: #10151b;
    color: #ffffff;
    box-shadow: 0 12px 28px rgba(12, 22, 34, 0.12);
  }

  .desk-hero p,
  .desk-hero h1,
  .desk-hero small { margin: 0; }

  .desk-hero p {
    color: #ff4a50;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: .05em;
    text-transform: uppercase;
  }

  .desk-hero h1 {
    margin-top: 6px;
    font-size: 30px;
    line-height: 1.05;
  }

  .desk-hero small {
    display: block;
    margin-top: 8px;
    color: #cbd5e1;
    font-size: 13px;
  }

  .desk-hero nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .desk-hero a,
  .desk-pending-bar button,
  .desk-bulk-bar button,
  .desk-filters button,
  .desk-slot-actions button,
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
    padding: 10px 12px;
    border-color: rgba(255,255,255,.28);
    background: transparent;
    color: #ffffff;
    text-decoration: none;
  }

  .desk-context {
    max-width: 1680px;
    margin: 10px auto 0;
    padding: 10px 14px;
    border: 1px solid #dbe3ec;
    border-radius: 8px;
    background: #ffffff;
    color: #526174;
    font-size: 13px;
    font-weight: 700;
  }

  .desk-context strong { color: #10151b; }

  .desk-workspace {
    position: relative;
    display: grid;
    grid-template-columns: minmax(420px, .9fr) minmax(620px, 1.1fr);
    gap: 14px;
    max-width: 1680px;
    margin: 14px auto 84px;
  }

  .desk-library,
  .desk-map {
    height: calc(100vh - 228px);
    min-height: 560px;
    overflow: auto;
    border: 1px solid #d8e0e9;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, .06);
  }

  .desk-library-toolbar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    gap: 9px;
    padding: 12px;
    border-bottom: 1px solid #dce3eb;
    background: rgba(255,255,255,.98);
    backdrop-filter: blur(8px);
  }

  .desk-search-row {
    display: grid;
    grid-template-columns: minmax(0,1fr) auto;
    gap: 8px;
    align-items: center;
  }

  .desk-search-row input,
  .desk-bulk-bar select {
    min-height: 38px;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 13px;
  }

  .desk-search-row input { padding: 0 11px; }
  .desk-search-row strong { font-size: 12px; color: #64748b; }

  .desk-filters,
  .desk-bulk-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .desk-filters button,
  .desk-bulk-bar button,
  .desk-slot-actions button,
  .desk-zone .visibility,
  .desk-pending-bar button {
    min-height: 32px;
    padding: 6px 9px;
  }

  .desk-filters button.active,
  .desk-bulk-bar button.primary {
    border-color: #1d4ed8;
    background: #1d4ed8;
    color: #ffffff;
  }

  .desk-bulk-bar {
    padding-top: 8px;
    border-top: 1px solid #edf1f5;
  }

  .desk-bulk-bar strong {
    margin-right: 3px;
    font-size: 12px;
  }

  .desk-bulk-bar select {
    min-width: 180px;
    padding: 0 8px;
  }

  .desk-message {
    margin: 0;
    padding: 7px 9px;
    border-radius: 6px;
    background: #eff6ff;
    color: #1e3a8a;
    font-size: 12px;
    font-weight: 700;
  }

  .desk-article-list {
    display: grid;
    gap: 7px;
    padding: 10px;
  }

  .desk-article-row {
    position: relative;
    display: grid;
    grid-template-columns: 20px 24px 64px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-height: 76px;
    padding: 8px;
    border: 1px solid #e0e6ed;
    border-radius: 7px;
    background: #ffffff;
    cursor: pointer;
  }

  .desk-article-row.selected {
    border-color: #2563eb;
    box-shadow: inset 3px 0 0 #2563eb;
  }

  .desk-article-row input { width: 16px; height: 16px; }

  .desk-selection-rank {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: #1d4ed8;
    color: #ffffff;
    font-size: 11px;
  }

  .desk-selection-rank.empty { background: #eef2f6; color: #94a3b8; }

  .desk-article-row img,
  .desk-image-placeholder {
    display: block;
    width: 64px;
    height: 48px;
    border-radius: 5px;
    background: #e9eef4;
    object-fit: cover;
  }

  .desk-article-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .desk-article-copy strong {
    overflow: hidden;
    font-size: 14px;
    line-height: 1.18;
    text-overflow: ellipsis;
  }

  .desk-article-copy small {
    color: #526174;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .02em;
  }

  .desk-article-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    color: #64748b;
    font-size: 10px;
  }

  .desk-article-meta em {
    color: #c40012;
    font-style: normal;
    font-weight: 900;
    text-transform: uppercase;
  }

  .desk-article-copy mark {
    width: fit-content;
    padding: 2px 4px;
    border-radius: 3px;
    background: #fff2cc;
    color: #6b4f00;
    font-size: 10px;
    font-weight: 800;
  }

  .desk-map {
    display: grid;
    gap: 10px;
    align-content: start;
    padding: 12px;
  }

  .desk-map-summary {
    position: sticky;
    top: -12px;
    z-index: 4;
    display: grid;
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 7px;
    padding: 12px 0 8px;
    background: rgba(255,255,255,.98);
  }

  .desk-map-summary div {
    display: grid;
    gap: 2px;
    padding: 9px;
    border: 1px solid #dce3eb;
    border-radius: 6px;
    background: #f8fafc;
  }

  .desk-map-summary span { color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; }
  .desk-map-summary strong { font-size: 20px; }

  .desk-zone {
    display: grid;
    gap: 9px;
    padding: 11px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #f8fafc;
  }

  .desk-zone > header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .desk-zone h3,
  .desk-zone p { margin: 0; }
  .desk-zone h3 { font-size: 15px; }
  .desk-zone p { margin-top: 2px; color: #64748b; font-size: 11px; }
  .desk-zone > header > span { color: #64748b; font-size: 10px; font-weight: 900; text-transform: uppercase; }

  .desk-zone-slots {
    display: grid;
    gap: 7px;
  }

  .desk-zone-slots-1 { grid-template-columns: 1fr; }
  .desk-zone-slots-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .desk-zone-slots-4 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .desk-zone-slots-5 { grid-template-columns: repeat(5, minmax(0,1fr)); }
  .desk-zone-slots-6 { grid-template-columns: repeat(3, minmax(0,1fr)); }

  .desk-slot {
    position: relative;
    min-width: 0;
    min-height: 82px;
    padding: 7px;
    border: 1px dashed #b8c4d2;
    border-radius: 6px;
    background: #ffffff;
  }

  .desk-slot > small {
    display: block;
    margin-bottom: 5px;
    color: #64748b;
    font-size: 9px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .desk-slot-empty {
    display: grid;
    place-items: center;
    min-height: 54px;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 700;
  }

  .desk-slot-card {
    position: relative;
    display: grid;
    gap: 5px;
    min-height: 54px;
    padding: 7px;
    border-radius: 5px;
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(15,23,42,.08);
    cursor: grab;
  }

  .desk-slot-card:active { cursor: grabbing; }
  .desk-slot-card strong { font-size: 11px; line-height: 1.15; }

  .desk-slot-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .desk-slot-actions button {
    min-height: 24px;
    padding: 2px 7px;
  }

  .desk-slot-actions span {
    margin-left: auto;
    color: #94a3b8;
    font-size: 9px;
    font-weight: 700;
  }

  .desk-slot-drop-target { position: absolute; inset: 0; pointer-events: none; }

  .desk-faixa.hidden-zone { opacity: .55; }
  .desk-zone .visibility.public { border-color: #15803d; color: #15803d; }

  .desk-faixa-slots {
    display: flex;
    gap: 7px;
    min-height: 90px;
    padding-bottom: 4px;
    overflow-x: auto;
  }

  .desk-faixa-slot {
    flex: 0 0 190px;
  }

  .desk-warning {
    padding: 10px;
    border: 1px solid #f1c76b;
    border-radius: 7px;
    background: #fff8e6;
    color: #684b0e;
  }

  .desk-warning strong { font-size: 12px; }
  .desk-warning p { margin: 4px 0 0; font-size: 11px; }

  .desk-pending-bar {
    position: fixed;
    z-index: 20;
    right: 22px;
    bottom: 16px;
    left: 22px;
    display: flex;
    gap: 8px;
    align-items: center;
    max-width: 1680px;
    margin: 0 auto;
    padding: 10px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    background: rgba(255,255,255,.97);
    box-shadow: 0 14px 34px rgba(15,23,42,.18);
    backdrop-filter: blur(10px);
  }

  .desk-pending-bar div {
    display: grid;
    gap: 2px;
    margin-right: auto;
  }

  .desk-pending-bar strong { font-size: 13px; }
  .desk-pending-bar span { color: #64748b; font-size: 10px; }
  .desk-pending-bar button:disabled { opacity: .45; cursor: default; }
  .desk-pending-bar button.apply { border-color: #1d4ed8; background: #1d4ed8; color: #ffffff; }

  @media (max-width: 1180px) {
    .desk-workspace { grid-template-columns: 1fr; }
    .desk-library, .desk-map { height: auto; max-height: none; min-height: 0; }
    .desk-zone-slots-5, .desk-zone-slots-6 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }

  @media (max-width: 720px) {
    .desk-shell { padding: 12px; }
    .desk-hero { display: grid; }
    .desk-hero nav { justify-content: flex-start; }
    .desk-map-summary { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .desk-zone-slots-3, .desk-zone-slots-4, .desk-zone-slots-5, .desk-zone-slots-6 { grid-template-columns: 1fr; }
    .desk-article-row { grid-template-columns: 20px 24px minmax(0,1fr); }
    .desk-article-row img, .desk-image-placeholder { display: none; }
    .desk-pending-bar { right: 8px; bottom: 8px; left: 8px; flex-wrap: wrap; }
    .desk-pending-bar div { flex: 1 1 100%; }
  }
`;

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
        <div>
          <p>Mesa de Edição · Beta</p>
          <h1>Organizar Jornada</h1>
          <small>Ensaio não destrutivo: organiza o estado final em bloco sem alterar ainda a página viva.</small>
        </div>
        <nav>
          <a href={`/admin/editorial/jornada/${snapshot.matchdayId}`}>Editorial atual</a>
          <a href="/admin">Backoffice</a>
        </nav>
      </section>
      <div className="desk-context">
        <strong>{snapshot.competitionName}</strong> · {snapshot.seasonLabel} · {snapshot.matchdayLabel} · {snapshot.articles.length} notícias publicadas
      </div>
      <MatchdayEditorialDeskClient snapshot={snapshot} />
    </main>
  );
}