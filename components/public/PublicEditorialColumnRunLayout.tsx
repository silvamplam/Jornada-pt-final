import PublicMatchdayEditorialSectionFrame from "./PublicMatchdayEditorialSectionFrame";
import { PublicFlexibleZoneContent, type PublicFlexibleZone } from "./PublicFlexibleZoneRenderers";

export const publicEditorialColumnRunStyles = `
  .public-editorial-column-run {
    display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 40px 36px; width: 100%; min-width: 0;
  }
  .public-five-news-column {
    min-width: 0; position: relative;
    box-sizing: border-box; font-family: Arial, Helvetica, sans-serif;
  }
  .public-five-news-column::before { content: ""; position: absolute; left: -18px; top: 0; bottom: 0; border-left: 1px solid #e1e5e9; }
  .public-five-news-column:nth-child(5n + 1)::before { display: none; }
  .public-five-news-column-heading {
    margin: 0 0 22px; color: #526174; font-size: 18px;
    font-weight: 800; line-height: 1.2; overflow-wrap: anywhere;
  }
  .public-five-news-column-stories { display: grid; gap: 12px; }
  .public-five-news-column-stories article + article { padding-top: 10px; border-top: 1px solid #edf0f2; }
  .public-five-news-column h3 {
    margin: 0; color: #10151b; font-size: 15px; line-height: 1.35;
    font-weight: 400; overflow-wrap: anywhere;
  }
  .public-five-news-column a { color: inherit; text-decoration: none; }
  .public-five-news-column h3 a:hover { text-decoration: underline; text-underline-offset: 3px; }
  .public-five-news-column a:focus-visible { outline: 2px solid #526174; outline-offset: 4px; }
  .public-five-news-column-image { display: block; aspect-ratio: 16 / 9; margin-bottom: 14px; }
  .public-five-news-column-image img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .public-five-news-column-image img[data-editorial-image-fallback="true"] { object-fit: contain; background: #f5f6f7; }

  /* Each responsive row shares its tallest column title, including titled groups. */
  @media (min-width: 681px) {
    .public-editorial-column-run { row-gap: 0; }
    .public-editorial-column-run > .public-five-news-column {
      display: grid; grid-template-rows: subgrid; grid-row: span 2; row-gap: 0;
    }
    .public-editorial-column-run > .public-five-news-column > h2 { grid-row: 1; align-self: start; }
    .public-editorial-column-run > .public-five-news-column > .public-five-news-column-stories { grid-row: 2; align-self: start; }
  }

  /* With no group title, only the first row shares the section boundary. */
  .public-editorial-column-run[data-public-editorial-flow] {
    grid-template-rows: max-content max-content auto;
    row-gap: 0;
  }
  .public-editorial-column-run[data-public-editorial-flow] .public-five-news-column-heading {
    align-self: start;
  }
  @media (min-width: 1101px) {
    .public-editorial-column-run > .public-five-news-column:nth-of-type(n + 6) { margin-top: 40px; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(-n + 5) {
      display: grid; grid-template-rows: subgrid; grid-row: 1 / 4; row-gap: 0;
    }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(1) { grid-column: 1; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(2) { grid-column: 2; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(3) { grid-column: 3; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(4) { grid-column: 4; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(5) { grid-column: 5; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(-n + 5) > h2 { grid-row: 1; margin-bottom: 0; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(-n + 5) > .public-five-news-column-stories { grid-row: 3; align-self: start; }
  }
  @media (min-width: 681px) and (max-width: 1100px) {
    .public-editorial-column-run > .public-five-news-column:nth-of-type(n + 4) { margin-top: 40px; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(-n + 3) {
      display: grid; grid-template-rows: subgrid; grid-row: 1 / 4; row-gap: 0;
    }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(1) { grid-column: 1; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(2) { grid-column: 2; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(3) { grid-column: 3; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(-n + 3) > h2 { grid-row: 1; margin-bottom: 0; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:nth-of-type(-n + 3) > .public-five-news-column-stories { grid-row: 3; align-self: start; }
  }
  @media (max-width: 1100px) {
    .public-editorial-column-run { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .public-five-news-column:nth-child(n)::before { display: block; }
    .public-five-news-column:nth-child(3n + 1)::before { display: none; }
  }
  @media (max-width: 680px) {
    .public-editorial-column-run { grid-template-columns: minmax(0, 1fr); gap: 36px; }
    .public-five-news-column:nth-child(n)::before { display: none; }
    .public-five-news-column + .public-five-news-column { padding-top: 28px; border-top: 1px solid #e1e5e9; }
    .public-five-news-column-heading { margin-bottom: 18px; }
    .public-editorial-column-run[data-public-editorial-flow] { row-gap: 0; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:first-of-type {
      display: grid; grid-template-rows: subgrid; grid-column: 1; grid-row: 1 / 4; row-gap: 0;
    }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:first-of-type > h2 { grid-row: 1; margin-bottom: 0; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column:first-of-type > .public-five-news-column-stories { grid-row: 3; align-self: start; }
    .public-editorial-column-run[data-public-editorial-flow] > .public-five-news-column + .public-five-news-column { margin-top: 36px; }
  }
`;

export default function PublicEditorialColumnRunLayout({ zones, matchdayNumber, publicTitle }: Readonly<{
  zones: readonly PublicFlexibleZone[];
  matchdayNumber: number;
  publicTitle?: string;
}>) {
  const visibleZones = zones.filter((zone) => zone.slots.some((slot) => slot.item));
  if (!visibleZones.length) return null;
  return <PublicMatchdayEditorialSectionFrame kind="zone">
    <div data-public-editorial-flow={publicTitle ? "single" : undefined}>
      <style>{publicEditorialColumnRunStyles}</style>
      {publicTitle ? <h2 className="public-column-group-heading" data-public-editorial-heading style={{ margin: 0, color: "#526174", font: "850 18px/1.25 'Segoe UI', Arial, sans-serif", textTransform: "uppercase", overflowWrap: "anywhere" }}>{publicTitle}</h2> : null}
      <div className="public-editorial-column-run" data-public-editorial-flow={publicTitle ? undefined : "shared"} data-public-column-run={visibleZones[0].key}>
        {visibleZones.map((zone) => <PublicFlexibleZoneContent key={zone.key} zone={zone} matchdayNumber={matchdayNumber} />)}
      </div>
    </div>
  </PublicMatchdayEditorialSectionFrame>;
}
