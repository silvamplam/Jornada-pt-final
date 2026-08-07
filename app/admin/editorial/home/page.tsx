import EditorialHorizontalNewsEditor from "@/components/admin/EditorialHorizontalNewsEditor";
import { buildEditorialHorizontalNewsEditorOrders } from "@/lib/editorial-horizontal-news";
import {
  getEditorialPublishedSources,
  type EditorialPublishedSource
} from "@/lib/editorial-published-sources";
import { fetchSupabaseAdminTable } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SiteEditorial = {
  id: string;
  slug: string | null;
  status: string | null;
  headline_title: string | null;
  headline_subtitle: string | null;
  headline_image_url: string | null;
  headline_link_url: string | null;
  headline_title_color: string | null;
  side_block_type: string | null;
  side_block_label: string | null;
  side_block_label_color: string | null;
  side_block_title: string | null;
  side_block_text: string | null;
  side_block_author: string | null;
  side_block_image_url: string | null;
  side_block_link_url: string | null;
  side_block_status: string | null;
  side_block_title_color: string | null;
  complementary_mode: string | null;
  complementary_label: string | null;
  complementary_title: string | null;
  complementary_text: string | null;
  complementary_image_url: string | null;
  complementary_link_url: string | null;
  complementary_status: string | null;
  complementary_roundup_item_id: string | null;
  below_headline_mode: string | null;
  below_headline_heading: string | null;
  below_headline_heading_color: string | null;
  roundup_video_heading: string | null;
  roundup_video_heading_color: string | null;
  final_zone_title: string | null;
  final_zone_title_color: string | null;
  final_zone_mode: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
};

type SiteEditorialHighlight = {
  id: string;
  site_editorial_id: string | null;
  sort_order: number | null;
  label: string | null;
  label_color: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SiteEditorialLatestNews = {
  id: string;
  site_editorial_id: string | null;
  sort_order: number | null;
  time_label: string | null;
  time_label_color: string | null;
  title: string | null;
  subtitle?: string | null;
  image_url: string | null;
  link_url: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SiteEditorialHorizontalNews = {
  id: string;
  site_editorial_id: string | null;
  sort_order: number | null;
  label: string | null;
  label_color: string | null;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SiteEditorialRoundupItem = {
  id: string;
  site_editorial_id: string | null;
  sort_order: number | null;
  type: string | null;
  label: string | null;
  title: string | null;
  subtitle: string | null;
  duration: string | null;
  image_url: string | null;
  video_url: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SiteFeaturedMatch = {
  id?: string | null;
  match_id: string | null;
  sort_order: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type HomeEditorialArticleOption = {
  id: string;
  slug: string | null;
  title: string | null;
  subtitle?: string | null;
  summary?: string | null;
  excerpt?: string | null;
  label?: string | null;
  image_url?: string | null;
  author?: string | null;
  status?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  competition_id?: string | null;
  season_id?: string | null;
  matchday_id?: string | null;
};

type HomeCompetition = {
  id: string;
  name: string;
  slug: string | null;
  country: string | null;
  logo_url: string | null;
  is_active: boolean | null;
};

type HomeSeason = {
  id: string;
  competition_id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  is_current: boolean | null;
};

type HomeMatchday = {
  id: string;
  season_id: string;
  number: number;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string | null;
};

type HomeTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type HomeBroadcastChannel = {
  id: string;
  name: string;
  logo_url: string | null;
};

type HomeMatch = {
  id: string;
  competition_id: string;
  season_id: string;
  matchday_id: string | null;
  home_team_id: string;
  away_team_id: string;
  status: string | null;
  minute: number | null;
  scheduled_date: string | null;
  kickoff_at: string | null;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  broadcast_channel_id: string | null;
};

type HomeGameSelectionData = {
  competitions: HomeCompetition[];
  seasons: HomeSeason[];
  matchdays: HomeMatchday[];
  matches: HomeMatch[];
  teams: HomeTeam[];
  broadcastChannels: HomeBroadcastChannel[];
  error: string | null;
};

type HomeEditorialData = {
  editorial: SiteEditorial | null;
  highlights: SiteEditorialHighlight[];
  latestNews: SiteEditorialLatestNews[];
  horizontalNews: SiteEditorialHorizontalNews[];
  roundupItems: SiteEditorialRoundupItem[];
  featuredMatches: SiteFeaturedMatch[];
  error: string | null;
};

type PageProps = {
  searchParams?: Promise<{
    saved?: string;
    featured_saved?: string;
    failed?: string;
    error?: string;
    detail?: string;
    home_competition_id?: string;
    home_season_id?: string;
    home_matchday_id?: string;
    item?: string;
  }>;
};

type FeedbackScope = "games" | "headline" | "side" | "composition" | "complement" | "highlights" | "roundup" | "horizontal-news" | "final-zone";

const homeEditorialStyles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .home-admin-shell {
    min-height: 100vh;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .home-admin-container {
    max-width: 1440px;
    margin: 0 auto;
  }

  .home-admin-hero,
  .home-admin-panel {
    border-radius: 8px;
    box-shadow: 0 18px 40px rgba(8, 15, 24, 0.12);
  }

  .home-admin-hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    padding: 28px;
    background: #10151b;
    color: #fff;
  }

  .home-admin-hero p,
  .home-admin-hero h1,
  .home-admin-panel h2,
  .home-admin-panel h3,
  .home-admin-panel p {
    margin: 0;
  }

  .home-admin-eyebrow,
  .home-admin-source,
  .home-admin-meta {
    color: #e5252a;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .home-admin-hero h1 {
    margin-top: 8px;
    font-size: 40px;
    line-height: 1;
  }

  .home-admin-hero span {
    display: block;
    margin-top: 10px;
    max-width: 820px;
    color: #cbd5e1;
    font-size: 15px;
    line-height: 1.45;
  }

  .home-admin-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
  }

  .home-admin-actions a,
  .home-admin-link {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 6px;
    padding: 0 14px;
    background: transparent;
    color: #fff;
    font-size: 12px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .home-admin-link {
    border-color: #10151b;
    background: #10151b;
  }

  .home-admin-block-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
    border: 1px solid #f2c7ca;
    border-radius: 8px;
    background: #ffffff;
    padding: 10px;
    box-shadow: 0 10px 24px rgba(8, 15, 24, 0.08);
  }

  .home-admin-block-nav a {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: #e5252a;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.03em;
    padding: 0 10px;
    text-decoration: none;
    text-transform: uppercase;
  }

  .home-admin-block-nav a:hover {
    background: #b91c1c;
  }

  .home-admin-error {
    margin-top: 18px;
    border-radius: 8px;
    padding: 14px 16px;
    line-height: 1.45;
  }

  .home-admin-error {
    border: 1px solid #fecaca;
    background: #fff1f2;
    color: #991b1b;
  }

  .home-admin-success {
    margin-top: 18px;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    background: #f0fdf4;
    color: #166534;
    padding: 14px 16px;
    font-weight: 800;
    line-height: 1.45;
  }

  .home-admin-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(420px, 0.82fr);
    gap: 14px;
    margin-top: 14px;
  }

  .home-admin-stack {
    display: grid;
    gap: 14px;
    align-content: start;
    min-width: 0;
  }

  .home-admin-panel {
    overflow: hidden;
    border: 1px solid #dce3eb;
    background: #fff;
    min-width: 0;
  }

  .home-admin-panel > header {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #e6ebf1;
    background: linear-gradient(180deg, #ffffff, #f8fafc);
  }

  .home-admin-panel h2 {
    font-size: 19px;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .home-admin-panel header p {
    margin-top: 5px;
    color: #687380;
    font-size: 13px;
    line-height: 1.4;
  }

  .home-admin-edit-form {
    display: grid;
    gap: 12px;
    padding: 14px;
  }

  .home-admin-form-section {
    display: grid;
    gap: 10px;
    border: 1px solid #e6ebf1;
    border-radius: 8px;
    padding: 12px;
    background: #fbfcfe;
  }

  .home-admin-form-section h3 {
    font-size: 17px;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .home-admin-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .home-admin-field {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .home-admin-field.is-wide {
    grid-column: 1 / -1;
  }

  .home-admin-field span {
    color: #475569;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .home-admin-field input,
  .home-admin-field select,
  .home-admin-field textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cfd8e3;
    border-radius: 7px;
    background: #fff;
    color: #10151b;
    font: inherit;
    padding: 10px 11px;
  }

  .home-admin-field textarea {
    min-height: 72px;
    resize: vertical;
  }

  .home-admin-save-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding-top: 2px;
  }

  .home-admin-save-row p {
    max-width: 760px;
    color: #687380;
    font-size: 13px;
    line-height: 1.45;
  }

  .home-admin-save-row button {
    min-height: 38px;
    border: 0;
    border-radius: 7px;
    background: #10151b;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
    font-weight: 900;
    padding: 0 18px;
    text-transform: uppercase;
  }

  .home-admin-feature {
    display: grid;
    grid-template-columns: minmax(180px, 0.36fr) minmax(0, 0.64fr);
    gap: 16px;
    padding: 20px;
    min-width: 0;
  }

  .home-admin-media {
    min-height: 180px;
    max-height: 260px;
    overflow: hidden;
    border-radius: 8px;
    background: #dce3eb;
  }

  .home-admin-media img,
  .home-admin-card img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .home-admin-placeholder {
    display: grid;
    min-height: 120px;
    place-items: center;
    padding: 18px;
    color: #7b8591;
    font-size: 13px;
    font-weight: 800;
    text-align: center;
    text-transform: uppercase;
  }

  .home-admin-feature h3 {
    margin-top: 8px;
    font-size: 30px;
    line-height: 1.05;
  }

  .home-admin-side-feature {
    grid-template-columns: minmax(118px, 0.32fr) minmax(0, 0.68fr);
    gap: 14px;
  }

  .home-admin-side-feature .home-admin-media {
    min-height: 112px;
    max-height: 148px;
  }

  .home-admin-side-feature h3 {
    font-size: 20px;
    line-height: 1.12;
  }

  .home-admin-side-feature p {
    font-size: 14px;
    line-height: 1.4;
  }

  .home-admin-feature p,
  .home-admin-card p {
    color: #4d5763;
    line-height: 1.45;
  }

  .home-admin-status-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .home-admin-pill {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    border-radius: 999px;
    padding: 0 9px;
    background: #eef2f6;
    color: #475569;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .home-admin-pill.is-published {
    background: #e8f5ed;
    color: #17633b;
  }

  .home-admin-pill.is-draft {
    background: #fff4d6;
    color: #7a5200;
  }

  .home-admin-card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    padding: 20px;
  }

  .home-admin-card-grid.is-compact {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    padding: 0;
  }

  .home-admin-card {
    overflow: hidden;
    border: 1px solid #e6ebf1;
    border-radius: 8px;
    background: #fff;
  }

  .home-admin-card-media {
    aspect-ratio: 16 / 9;
    max-height: 150px;
    overflow: hidden;
    background: #dce3eb;
  }

  .home-admin-card-body {
    display: grid;
    gap: 8px;
    padding: 14px;
  }

  .home-admin-card h3 {
    font-size: 17px;
    line-height: 1.16;
  }

  .home-admin-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .home-admin-list li {
    display: grid;
    gap: 7px;
    padding: 14px 20px;
    border-bottom: 1px solid #eef2f6;
    min-width: 0;
  }

  .home-admin-list li:last-child {
    border-bottom: 0;
  }

  .home-admin-list strong {
    font-size: 15px;
    line-height: 1.25;
  }

  .home-admin-list.is-compact li {
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 10px 12px;
    align-items: start;
  }

  .home-admin-list.is-compact .home-admin-row-media {
    grid-row: span 3;
  }

  .home-admin-row-media {
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border-radius: 6px;
    background: #e5ebf2;
  }

  .home-admin-row-media img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .home-admin-row-media .home-admin-placeholder {
    min-height: 100%;
    padding: 8px;
    font-size: 10px;
  }

  .home-admin-muted-card {
    border-left: 3px solid #d7dee8;
    background: #f8fafc;
  }

  .home-admin-muted-card strong {
    color: #64748b;
  }

  .home-admin-empty-group {
    display: grid;
    gap: 6px;
    border-left: 3px solid #d7dee8;
    background: #f8fafc;
    color: #475569;
  }

  .home-admin-empty-group strong {
    color: #334155;
  }

  .home-admin-empty-group small {
    min-width: 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.35;
  }

  .home-admin-empty {
    padding: 18px 20px;
    color: #687380;
    font-size: 14px;
    line-height: 1.45;
  }

  .home-admin-link-out {
    display: inline-block;
    max-width: min(100%, 44ch);
    color: #10151b;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
    white-space: nowrap;
    text-decoration: none;
  }

  .home-admin-link-out:hover {
    text-decoration: underline;
  }

  .home-admin-code {
    display: inline-block;
    max-width: min(100%, 32ch);
    border-radius: 4px;
    background: #f1f5f9;
    color: #334155;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 11px;
    overflow: hidden;
    padding: 2px 5px;
    text-overflow: ellipsis;
    vertical-align: bottom;
    white-space: nowrap;
  }

  .home-admin-compact-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }

  .home-admin-featured-match-list li {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 8px 12px;
    align-items: center;
    padding: 10px 16px;
  }

  .home-admin-featured-match-list strong {
    font-size: 13px;
  }

  .home-admin-featured-match-list .home-admin-code {
    max-width: 24ch;
  }

  .home-admin-featured-games {
    margin-top: 18px;
  }

  .home-admin-featured-games-form {
    display: grid;
    gap: 12px;
    padding: 16px;
  }

  .home-admin-game-row small {
    color: #64748b;
    font-size: 12px;
    line-height: 1.35;
  }

  .home-admin-game-filter-form {
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #fbfcfe;
    padding: 14px;
  }

  .home-admin-game-selection-form {
    display: grid;
    gap: 10px;
  }

  .home-admin-game-filter-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    gap: 12px;
    align-items: end;
  }

  .home-admin-game-filter-grid label {
    display: grid;
    gap: 6px;
    color: #334155;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .home-admin-game-filter-grid select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #e6ebf1;
    background: #fff;
    border-radius: 7px;
    color: #10151b;
    font-size: 14px;
    padding: 10px 11px;
  }

  .home-admin-game-filter-grid button {
    min-height: 41px;
    border: 0;
    border-radius: 7px;
    background: #10151b;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
    padding: 0 16px;
    text-transform: uppercase;
  }

  .home-admin-game-context {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #fff;
    padding: 12px 14px;
  }

  .home-admin-game-context strong {
    margin-right: 4px;
  }

  .home-admin-game-context span {
    border-radius: 999px;
    background: #eef2f6;
    color: #334155;
    font-size: 12px;
    font-weight: 800;
    padding: 5px 9px;
  }

  .home-admin-game-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .home-admin-game-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 8px 10px;
    align-items: center;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #fff;
    padding: 9px 10px;
  }

  .home-admin-game-row.is-selected {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .home-admin-game-check {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    color: #10151b;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    grid-column: 1;
  }

  .home-admin-game-check input {
    width: 16px;
    height: 16px;
    accent-color: #e5252a;
  }

  .home-admin-game-main {
    display: grid;
    gap: 2px;
    grid-column: 2;
    min-width: 0;
  }

  .home-admin-game-main strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home-admin-game-score {
    grid-column: 3;
    grid-row: auto;
    justify-self: end;
    min-width: 42px;
    border-radius: 6px;
    padding: 5px 7px;
    background: #eef2f6;
    color: #10151b;
    font-size: 12px;
    font-weight: 900;
    text-align: center;
  }

  .home-admin-game-order {
    display: grid;
    gap: 3px;
    grid-column: 4;
    justify-self: end;
    min-width: 58px;
  }

  .home-admin-game-order span {
    color: #64748b;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .home-admin-game-order input {
    width: 58px;
    box-sizing: border-box;
    border: 1px solid #cfd8e3;
    border-radius: 6px;
    padding: 5px 6px;
  }

  .home-admin-zone-form {
    display: contents;
  }

  .home-admin-mode-section[hidden] {
    display: none;
  }

  .home-admin-selected-summary {
    display: grid;
    gap: 10px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #fbfcfe;
    padding: 14px;
  }

  .home-admin-selected-summary strong {
    font-size: 15px;
  }

  .home-admin-selected-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .home-admin-selected-chip {
    display: inline-flex;
    max-width: 260px;
    min-height: 28px;
    align-items: center;
    border-radius: 999px;
    background: #eef2f6;
    color: #334155;
    font-size: 12px;
    font-weight: 800;
    overflow: hidden;
    padding: 0 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home-admin-section-stack {
    display: grid;
    gap: 12px;
    margin-top: 14px;
  }

  .home-admin-zone-panels,
  .home-admin-editorial-flow {
    display: grid;
    gap: 10px;
  }

  .home-admin-zone-panel {
    display: block;
  }

  .home-admin-editorial-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .home-admin-composition {
    margin-top: 0;
  }

  .home-admin-composition-body {
    padding: 12px;
  }

  .home-admin-composition-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }

  .home-admin-composition-card {
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #f8fafc;
    padding: 12px;
  }

  .home-admin-composition-card h3,
  .home-admin-composition-card h4,
  .home-admin-composition-card p {
    margin: 0;
  }

  .home-admin-composition-card h3 {
    font-size: 17px;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .home-admin-composition-card h4 {
    font-size: 15px;
    line-height: 1.18;
    text-transform: uppercase;
  }

  .home-admin-composition-card > p {
    color: #687380;
    font-size: 13px;
    line-height: 1.45;
  }

  .home-admin-composition-main-stack,
  .home-admin-composition-side-stack {
    display: grid;
    gap: 12px;
    align-content: start;
    min-width: 0;
  }

  .home-admin-zone-kicker,
  .home-admin-subzone-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }

  .home-admin-zone-kicker {
    margin-bottom: 2px;
  }

  .home-admin-zone-kicker small,
  .home-admin-subzone-heading small,
  .home-admin-final-zone-header small {
    border-radius: 999px;
    background: #eef2f6;
    color: #334155;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.05em;
    line-height: 1;
    padding: 6px 8px;
    text-transform: uppercase;
  }

  .home-admin-subzone-heading h4 {
    margin: 0;
  }

  .home-admin-final-zone .home-admin-list li {
    padding-left: 0;
    padding-right: 0;
  }

  .home-admin-final-zone-header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }

  .home-admin-final-zone-list {
    gap: 10px;
  }

  .home-admin-list.home-admin-final-zone-list .home-admin-final-item {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 10px 12px;
    align-items: start;
    border: 1px solid #e6ebf1;
    border-radius: 8px;
    background: #fff;
    padding: 10px;
  }

  .home-admin-list.home-admin-final-zone-list .home-admin-final-item.is-primary {
    grid-template-columns: minmax(128px, 0.42fr) minmax(0, 0.58fr);
    border-color: #d7dee8;
    background: #ffffff;
  }

  .home-admin-list.home-admin-final-zone-list .home-admin-row-media {
    grid-row: auto;
  }

  .home-admin-list.home-admin-final-zone-list .home-admin-final-item.is-primary .home-admin-row-media {
    aspect-ratio: 16 / 11;
  }

  .home-admin-final-content {
    display: grid;
    gap: 7px;
    min-width: 0;
  }

  .home-admin-final-zone-list strong {
    font-size: 16px;
    line-height: 1.2;
  }

  .home-admin-list.home-admin-final-zone-list .home-admin-final-item.is-primary strong {
    font-size: 19px;
    line-height: 1.12;
  }

  .home-admin-final-zone-list p {
    color: #4d5763;
    font-size: 13px;
    line-height: 1.35;
  }

  .home-admin-final-link-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .home-admin-hidden-form {
    display: none;
  }

  .home-admin-final-zone-form {
    display: grid;
    gap: 12px;
  }

  .home-admin-final-zone-form .home-admin-final-zone-list {
    display: grid;
    gap: 12px;
  }

  .home-admin-highlights-form,
  .home-admin-highlight-editor-list {
    display: grid;
    gap: 12px;
  }

  .home-admin-final-editor-card,
  .home-admin-highlight-editor-card {
    display: grid;
    gap: 12px;
    min-width: 0;
    border: 1px solid #e1e7ef;
    border-radius: 10px;
    background: #ffffff;
    padding: 12px;
  }

  .home-admin-collapsible-editor {
    padding: 0;
    overflow: hidden;
  }

  .home-admin-collapsible-editor summary {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    list-style: none;
    padding: 12px;
  }

  .home-admin-collapsible-editor summary::-webkit-details-marker {
    display: none;
  }

  .home-admin-collapsible-editor summary::after {
    content: "+";
    color: #6b7480;
    font-size: 18px;
    font-weight: 800;
    line-height: 1;
  }

  .home-admin-collapsible-editor[open] summary {
    border-bottom: 1px solid #e5ebf2;
  }

  .home-admin-collapsible-editor[open] summary::after {
    content: "-";
  }

  .home-admin-collapsible-title {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .home-admin-collapsible-title strong {
    overflow: hidden;
    color: #111827;
    font-size: 14px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home-admin-collapsible-title small {
    overflow: hidden;
    color: #6b7480;
    font-size: 12px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home-admin-item-editor-fields {
    display: grid;
    gap: 12px;
    margin: 0;
    border: 0;
    padding: 12px;
    min-inline-size: 0;
  }

  .home-admin-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .home-admin-final-editor-card.is-primary,
  .home-admin-highlight-editor-card.is-primary {
    border-color: #d2dae5;
    background: #fbfcfe;
  }

  .home-admin-final-editor-card.is-muted,
  .home-admin-highlight-editor-card.is-muted {
    background: #f7f9fc;
  }

  .home-admin-final-editor-card legend,
  .home-admin-highlight-editor-card legend {
    color: #6a7280;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0 4px;
  }

  .home-admin-final-editor-preview,
  .home-admin-highlight-editor-preview {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 10px 12px;
    align-items: start;
  }

  .home-admin-final-editor-card.is-primary .home-admin-final-editor-preview,
  .home-admin-highlight-editor-card.is-primary .home-admin-highlight-editor-preview {
    grid-template-columns: minmax(128px, 0.42fr) minmax(0, 0.58fr);
  }

  @media (max-width: 1100px) {
    .home-admin-grid,
    .home-admin-feature,
    .home-admin-card-grid,
    .home-admin-form-grid,
    .home-admin-game-filter-grid,
    .home-admin-game-list,
    .home-admin-zone-panels,
    .home-admin-editorial-grid,
    .home-admin-composition-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .home-admin-shell {
      padding: 16px;
    }

    .home-admin-hero,
    .home-admin-panel > header,
    .home-admin-list.is-compact li,
    .home-admin-list.home-admin-final-zone-list .home-admin-final-item,
    .home-admin-list.home-admin-final-zone-list .home-admin-final-item.is-primary,
    .home-admin-final-editor-preview,
    .home-admin-final-editor-card.is-primary .home-admin-final-editor-preview,
    .home-admin-highlight-editor-preview,
    .home-admin-highlight-editor-card.is-primary .home-admin-highlight-editor-preview,
    .home-admin-game-row {
      display: grid;
      grid-template-columns: 1fr;
    }

    .home-admin-actions {
      justify-content: flex-start;
    }
  }
`;

function textValue(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const cleanValue = value?.trim();
    if (cleanValue) {
      return cleanValue;
    }
  }

  return "";
}

function articlePublicHref(article: HomeEditorialArticleOption) {
  const slug = textValue(article.slug);
  return slug ? `/noticias/${encodeURIComponent(slug)}` : "";
}

function articleSnapshotSubtitle(article: HomeEditorialArticleOption) {
  return textValue(article.subtitle, article.summary, article.excerpt);
}

function publishedSourceHighlightLabel(source: EditorialPublishedSource) {
  if (source.source_type === "article") {
    return textValue(source.label, "Artigo");
  }

  return textValue(source.label, source.content_type);
}

function publishedSourceHighlightSubtitle(source: EditorialPublishedSource) {
  return textValue(source.subtitle, source.summary);
}

function publishedSourceHighlightImageUrl(source: EditorialPublishedSource) {
  return textValue(source.thumbnail_url, source.image_url);
}

function statusText(value: string | null | undefined) {
  return textValue(value, "sem estado");
}

function statusClass(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "published") return " is-published";
  if (normalized === "draft") return " is-draft";
  return "";
}

function MediaPreview({ src, label }: { src: string | null | undefined; label: string }) {
  const cleanSrc = src?.trim();

  if (!cleanSrc) {
    return <div className="home-admin-placeholder">Sem imagem</div>;
  }

  return <img alt={label} src={cleanSrc} />;
}

function StatusPill({ status }: { status: string | null | undefined }) {
  return <span className={`home-admin-pill${statusClass(status)}`}>{statusText(status)}</span>;
}

function formatCivilDate(value: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function formatDateTime(scheduledDate: string | null, value: string | null | undefined) {
  if (!value) {
    const dateLabel = formatCivilDate(scheduledDate);
    return dateLabel ? `${dateLabel} · Hora por definir` : "Hora por definir";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const dateLabel = formatCivilDate(scheduledDate);
    return dateLabel ? `${dateLabel} · Hora por definir` : "Hora por definir";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

const scheduleMonthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function formatMatchSchedule(scheduledDate: string | null, kickoffAt: string | null | undefined) {
  const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledDate ?? "");
  const month = civil ? Number(civil[2]) : 0;
  const dateLabel = civil && month >= 1 && month <= 12 ? `${civil[3]} ${scheduleMonthNames[month - 1]}` : null;
  if (kickoffAt) {
    const kickoff = new Date(kickoffAt);
    if (!Number.isNaN(kickoff.getTime())) {
      const time = new Intl.DateTimeFormat("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Lisbon"
      }).format(kickoff);
      return dateLabel ? `${dateLabel} · ${time}` : time;
    }
  }
  return dateLabel ? `${dateLabel} · HORA POR DEFINIR` : "DATA E HORA POR DEFINIR";
}

function matchStatusLabel(match: HomeMatch) {
  if (match.status === "live") {
    return match.minute ? `Ao vivo ${match.minute}'` : "Ao vivo";
  }

  if (match.status === "halftime") return "Intervalo";
  if (match.status === "finished") return "Finalizado";
  if (match.status === "postponed") return "Adiado";
  if (match.status === "cancelled") return "Cancelado";

  return "Agendado";
}

function matchScoreLabel(match: HomeMatch) {
  if (typeof match.home_score === "number" && typeof match.away_score === "number") {
    return `${match.home_score}-${match.away_score}`;
  }

  return "vs";
}

function teamLabel(team: HomeTeam | undefined, fallback: string) {
  return textValue(team?.short_name, team?.name, fallback);
}

function matchTitle(match: HomeMatch, teamsById: Map<string, HomeTeam>) {
  return `${teamLabel(teamsById.get(match.home_team_id), "Casa")} vs ${teamLabel(teamsById.get(match.away_team_id), "Fora")}`;
}

function selectedSortOrder(featuredMatches: SiteFeaturedMatch[]) {
  return new Map(
    featuredMatches
      .filter((item): item is SiteFeaturedMatch & { match_id: string } => Boolean(item.match_id))
      .map((item) => [item.match_id, item.sort_order])
  );
}

function selectedMatchSet(featuredMatches: SiteFeaturedMatch[]) {
  return new Set(featuredMatches.map((item) => item.match_id).filter((value): value is string => Boolean(value)));
}

function hasContent(...values: Array<string | number | null | undefined>) {
  return values.some((value) => {
    if (typeof value === "number") {
      return true;
    }

    return Boolean(value?.trim());
  });
}

function compactStateLabel(status: string | null | undefined, hasItemContent: boolean) {
  if (hasItemContent) {
    return null;
  }

  return status?.trim().toLowerCase() === "draft" ? "Rascunho vazio" : "Item sem conteudo";
}

function emptyGroupLabel(count: number) {
  return count === 1 ? "1 rascunho vazio" : `${count} rascunhos vazios`;
}

function sortOrderList(items: Array<{ sort_order: number | null }>) {
  const values = items.map((item) => item.sort_order).filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return "sem posicao definida";
  }

  return `posicoes ${values.join(", ")}`;
}

function itemNumber(value: number | null | undefined, fallback: number) {
  return String(value ?? fallback).padStart(2, "0");
}

function itemAnchor(prefix: "home-highlight-item" | "home-roundup-item" | "home-horizontal-news-item" | "home-final-item", number: string) {
  return `${prefix}-${number}`;
}

function roundupHasReadableContent(item: SiteEditorialRoundupItem) {
  return hasContent(item.title, item.subtitle, item.label, item.image_url, item.video_url, item.duration);
}

function highlightHasReadableContent(item: SiteEditorialHighlight) {
  return hasContent(item.title, item.subtitle, item.label, item.image_url, item.link_url);
}

function latestNewsHasReadableContent(item: SiteEditorialLatestNews) {
  return hasContent(item.title, item.subtitle, item.image_url, item.link_url, item.time_label);
}

function horizontalNewsHasReadableContent(item: SiteEditorialHorizontalNews) {
  return hasContent(item.label, item.title, item.subtitle, item.image_url, item.link_url);
}

function inputValue(value: string | null | undefined) {
  return value ?? "";
}

function TextField({
  label,
  name,
  value,
  placeholder,
  wide = false
}: {
  label: string;
  name: string;
  value: string | null | undefined;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={`home-admin-field${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      <input name={name} defaultValue={inputValue(value)} placeholder={placeholder} />
    </label>
  );
}

function TextAreaField({
  label,
  name,
  value,
  placeholder
}: {
  label: string;
  name: string;
  value: string | null | undefined;
  placeholder?: string;
}) {
  return (
    <label className="home-admin-field is-wide">
      <span>{label}</span>
      <textarea name={name} defaultValue={inputValue(value)} placeholder={placeholder} />
    </label>
  );
}

function StatusField({ label, name, value }: { label: string; name: string; value: string | null | undefined }) {
  return (
    <label className="home-admin-field">
      <span>{label}</span>
      <select name={name} defaultValue={value === "published" ? "published" : "draft"}>
        <option value="draft">draft</option>
        <option value="published">published</option>
      </select>
    </label>
  );
}

function errorMessage(error: string | undefined, detail?: string) {
  const messages: Record<string, string> = {
    "invalid-action": "A acao pedida nao existe.",
    "missing-home-editorial": "Nao foi encontrado o registo site_editorials com slug home.",
    "invalid-status": "Estado invalido. Use draft ou published.",
    "invalid-color": "Cor invalida. Use formato hex, por exemplo #10151b.",
    "invalid-final-zone-mode": "Modo da Zona Editorial Final invalido.",
    "missing-selection-set": "Nao foi possivel guardar: a lista de jogos disponiveis nao chegou ao servidor.",
    "invalid-featured-match": "A selecao contem um jogo invalido ou que ja nao existe.",
    "invalid-highlight-item": "Os Destaques contem um item que nao pertence a esta Home.",
    "empty-highlight-item": "Preenche pelo menos titulo, subtitulo, etiqueta, imagem ou link antes de criar este destaque.",
    "invalid-roundup-item": "O Roundup contem um item que nao pertence a esta Home.",
    "invalid-roundup-type": "Tipo de Roundup invalido. Use video, resumo, golos ou noticia.",
    "invalid-final-zone-item": "A Zona Editorial Final contem um item que nao pertence a esta Home.",
    "invalid-horizontal-news-item": "A faixa horizontal contem um item que nao pertence a esta Home.",
    "horizontal-news-title-required": "Para publicar uma noticia na faixa horizontal, indica o titulo.",
    "empty-featured-selection": "Por seguranca, esta fase nao guarda uma selecao vazia. Mantem pelo menos um jogo selecionado.",
    "required-field": "O Supabase recusou a gravacao por campo obrigatorio em falta.",
    constraint: "O Supabase recusou a gravacao por constraint da tabela.",
    permission: "O Supabase recusou a gravacao por permissoes.",
    "save-failed": "Nao foi possivel guardar os dados principais da Home."
  };

  const base = messages[error ?? ""] ?? "Nao foi possivel guardar os dados principais da Home.";
  return detail ? `${base} Detalhe: ${detail}` : base;
}

function pageMessage(params: Awaited<NonNullable<PageProps["searchParams"]>>) {
  if (params.error && !params.failed) {
    return { type: "error" as const, text: errorMessage(params.error, params.detail) };
  }

  return null;
}

function scopedMessage(params: Awaited<NonNullable<PageProps["searchParams"]>>, scope: FeedbackScope) {
  if ((scope === "highlights" || scope === "roundup" || scope === "horizontal-news" || scope === "final-zone") && params.item) {
    return null;
  }

  if (params.failed === scope && params.error) {
    return { type: "error" as const, text: errorMessage(params.error, params.detail) };
  }

  if (scope === "games" && (params.saved === "games" || params.featured_saved)) {
    return { type: "success" as const, text: "Jogos da barra guardados com sucesso." };
  }

  if (params.saved !== scope) {
    return null;
  }

  const successMessages: Record<FeedbackScope, string> = {
    games: "Jogos da barra guardados com sucesso.",
    headline: "Manchete guardada com sucesso.",
    side: "Bloco lateral guardado com sucesso.",
    composition: "Composicao abaixo da manchete guardada com sucesso.",
    complement: "Complemento guardado com sucesso.",
    highlights: "Destaques abaixo da manchete guardados com sucesso.",
    roundup: "Videos / Resumo / Roundup guardados com sucesso.",
    "horizontal-news": "Faixa horizontal de noticias guardada com sucesso.",
    "final-zone": "Zona Editorial Final guardada com sucesso."
  };

  return { type: "success" as const, text: successMessages[scope] };
}

function itemMessage(
  params: Awaited<NonNullable<PageProps["searchParams"]>>,
  scope: Extract<FeedbackScope, "highlights" | "roundup" | "horizontal-news" | "final-zone">,
  anchor: string,
  label: string
) {
  if (params.item !== anchor) {
    return null;
  }

  if (params.failed === scope && params.error) {
    return { type: "error" as const, text: errorMessage(params.error, params.detail) };
  }

  if (params.saved === scope) {
    return { type: "success" as const, text: `${label} guardado com sucesso.` };
  }

  return null;
}

function FeedbackMessage({
  message
}: {
  message: ReturnType<typeof scopedMessage> | ReturnType<typeof pageMessage> | ReturnType<typeof itemMessage>;
}) {
  if (!message) {
    return null;
  }

  return <div className={message.type === "success" ? "home-admin-success" : "home-admin-error"}>{message.text}</div>;
}

async function readHomeEditorialData(): Promise<HomeEditorialData> {
  try {
    const editorials = await fetchSupabaseAdminTable<SiteEditorial>(
      "site_editorials?select=*&slug=eq.home&limit=1"
    );
    const editorial = editorials[0] ?? null;

    if (!editorial?.id) {
      return {
        editorial: null,
        highlights: [],
        latestNews: [],
        horizontalNews: [],
        roundupItems: [],
        featuredMatches: [],
        error: null
      };
    }

    const encodedId = encodeURIComponent(editorial.id);
    const [highlights, latestNews, horizontalNews, roundupItems, featuredMatches] = await Promise.all([
      fetchSupabaseAdminTable<SiteEditorialHighlight>(
        `site_editorial_highlights?select=*&site_editorial_id=eq.${encodedId}&order=sort_order.asc`
      ),
      fetchSupabaseAdminTable<SiteEditorialLatestNews>(
        `site_editorial_latest_news?select=*&site_editorial_id=eq.${encodedId}&order=sort_order.asc`
      ),
      fetchSupabaseAdminTable<SiteEditorialHorizontalNews>(
        `site_editorial_horizontal_news?select=*&site_editorial_id=eq.${encodedId}&order=sort_order.asc`
      ).catch(() => []),
      fetchSupabaseAdminTable<SiteEditorialRoundupItem>(
        `site_editorial_roundup_items?select=*&site_editorial_id=eq.${encodedId}&order=sort_order.asc`
      ),
      fetchSupabaseAdminTable<SiteFeaturedMatch>("site_featured_matches?select=*&order=sort_order.asc")
    ]);

    return {
      editorial,
      highlights,
      latestNews,
      horizontalNews,
      roundupItems,
      featuredMatches,
      error: null
    };
  } catch (error) {
    return {
      editorial: null,
      highlights: [],
      latestNews: [],
      horizontalNews: [],
      roundupItems: [],
      featuredMatches: [],
      error: error instanceof Error ? error.message : "Nao foi possivel ler as tabelas site_*."
    };
  }
}

async function readHomeGameSelectionData(): Promise<HomeGameSelectionData> {
  try {
    const [competitions, seasons, matchdays, matches, teams, broadcastChannels] = await Promise.all([
      fetchSupabaseAdminTable<HomeCompetition>(
        "competitions?select=id,name,slug,country,logo_url,is_active&order=name.asc"
      ),
      fetchSupabaseAdminTable<HomeSeason>(
        "seasons?select=id,competition_id,label,starts_on,ends_on,is_current&order=label.desc"
      ),
      fetchSupabaseAdminTable<HomeMatchday>(
        "matchdays?select=id,season_id,number,label,starts_on,ends_on,status&order=number.asc"
      ),
      fetchSupabaseAdminTable<HomeMatch>(
        "matches?select=id,competition_id,season_id,matchday_id,home_team_id,away_team_id,status,minute,scheduled_date,kickoff_at,home_score,away_score,venue,broadcast_channel_id&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,id.asc&limit=1000"
      ),
      fetchSupabaseAdminTable<HomeTeam>("teams?select=id,name,short_name,logo_url&order=name.asc"),
      fetchSupabaseAdminTable<HomeBroadcastChannel>("broadcast_channels?select=id,name,logo_url&order=name.asc")
    ]);

    return {
      competitions,
      seasons,
      matchdays,
      matches,
      teams,
      broadcastChannels,
      error: null
    };
  } catch (error) {
    return {
      competitions: [],
      seasons: [],
      matchdays: [],
      matches: [],
      teams: [],
      broadcastChannels: [],
      error: error instanceof Error ? error.message : "Nao foi possivel ler os jogos reais para selecao da Home."
    };
  }
}

async function readPublishedHomeEditorialArticles(): Promise<HomeEditorialArticleOption[]> {
  return fetchSupabaseAdminTable<HomeEditorialArticleOption>(
    "editorial_articles?select=*&status=eq.published&order=published_at.desc.nullslast,created_at.desc.nullslast&limit=80"
  ).catch(() => []);
}

export default async function AdminEditorialHomePage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const [
    { editorial, highlights, latestNews, horizontalNews, roundupItems, featuredMatches, error },
    gameSelection,
    publishedArticles,
    publishedSources
  ] = await Promise.all([
    readHomeEditorialData(),
    readHomeGameSelectionData(),
    readPublishedHomeEditorialArticles(),
    getEditorialPublishedSources().catch(() => [])
  ]);
  const visibleRoundupItems = roundupItems.filter(roundupHasReadableContent);
  const horizontalNewsEditorItems = horizontalNews.map((item) => ({
    id: item.id,
    sortOrder: item.sort_order ?? 0,
    label: item.label,
    labelColor: item.label_color,
    title: item.title,
    subtitle: item.subtitle,
    imageUrl: item.image_url,
    linkUrl: item.link_url,
    status: item.status
  }));
  const horizontalNewsEditorOrders = buildEditorialHorizontalNewsEditorOrders(horizontalNewsEditorItems);
  const horizontalNewsSources = publishedSources.map((source) => ({
    key: `${source.source_type}:${source.source_id}`,
    optionLabel: `${textValue(source.title, source.source_slug, source.source_id)} - ${source.origin_label}`,
    label: publishedSourceHighlightLabel(source),
    title: textValue(source.title),
    subtitle: publishedSourceHighlightSubtitle(source),
    imageUrl: publishedSourceHighlightImageUrl(source),
    linkUrl: textValue(source.link_url)
  }));
  const horizontalNewsOpenOrder = horizontalNewsEditorOrders.find(
    (order) => params.item === itemAnchor("home-horizontal-news-item", String(order).padStart(2, "0"))
  ) ?? null;
  const roundupEditorRows = [...roundupItems].sort((first, second) => (first.sort_order ?? 9999) - (second.sort_order ?? 9999));
  const fixedHighlightSlots = [1, 2, 3];
  const usedHighlightIds = new Set<string>();
  const highlightEditorRows = [
    ...fixedHighlightSlots.map((order) => {
      const item = highlights.find((candidate) => candidate.sort_order === order && !usedHighlightIds.has(candidate.id)) ?? null;
      if (item) {
        usedHighlightIds.add(item.id);
      }

      return {
        key: item?.id ?? `slot-${order}`,
        order,
        item
      };
    }),
    ...highlights
      .filter((item) => !usedHighlightIds.has(item.id))
      .map((item, index) => ({
        key: item.id,
        order: item.sort_order ?? fixedHighlightSlots.length + index + 1,
        item
      }))
  ];
  const emptyHighlights = highlights.filter((item) => !highlightHasReadableContent(item));
  const fixedFinalZoneSlots = [1, 2, 3, 4];
  const usedFinalZoneIds = new Set<string>();
  const finalZoneEditorRows = [
    ...fixedFinalZoneSlots.map((order) => {
      const item = latestNews.find((candidate) => candidate.sort_order === order && !usedFinalZoneIds.has(candidate.id)) ?? null;
      if (item) {
        usedFinalZoneIds.add(item.id);
      }

      return {
        key: item?.id ?? `slot-${order}`,
        order,
        item
      };
    }),
    ...latestNews
      .filter((item) => !usedFinalZoneIds.has(item.id))
      .map((item, index) => ({
        key: item.id,
        order: item.sort_order ?? fixedFinalZoneSlots.length + index + 1,
        item
      }))
  ];
  const emptyLatestNews = latestNews.filter((item) => !latestNewsHasReadableContent(item));
  const teamsById = new Map(gameSelection.teams.map((team) => [team.id, team]));
  const matchesById = new Map(gameSelection.matches.map((match) => [match.id, match]));
  const selectedIds = selectedMatchSet(featuredMatches);
  const selectedOrderByMatchId = selectedSortOrder(featuredMatches);
  const selectedFeaturedMatches = [...featuredMatches]
    .filter((item): item is SiteFeaturedMatch & { match_id: string } => Boolean(item.match_id))
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
  const matchdaysBySeason = new Map<string, HomeMatchday[]>();
  const matchesByMatchday = new Map<string, HomeMatch[]>();

  for (const matchday of gameSelection.matchdays) {
    const list = matchdaysBySeason.get(matchday.season_id) ?? [];
    list.push(matchday);
    matchdaysBySeason.set(matchday.season_id, list);
  }

  for (const match of gameSelection.matches) {
    if (!match.matchday_id) {
      continue;
    }

    const list = matchesByMatchday.get(match.matchday_id) ?? [];
    list.push(match);
    matchesByMatchday.set(match.matchday_id, list);
  }

  const selectedMatchForDefault = selectedFeaturedMatches
    .map((item) => matchesById.get(item.match_id))
    .find((match): match is HomeMatch => Boolean(match));
  const competitionIdsWithMatches = new Set(gameSelection.matches.map((match) => match.competition_id));
  const competitionsForFilter = gameSelection.competitions.filter((competition) => competitionIdsWithMatches.has(competition.id));
  const requestedCompetitionId = params.home_competition_id ?? "";
  const selectedCompetitionId = competitionsForFilter.some((competition) => competition.id === requestedCompetitionId)
    ? requestedCompetitionId
    : selectedMatchForDefault && competitionIdsWithMatches.has(selectedMatchForDefault.competition_id)
      ? selectedMatchForDefault.competition_id
      : competitionsForFilter[0]?.id ?? "";
  const seasonIdsWithMatches = new Set(
    gameSelection.matches
      .filter((match) => match.competition_id === selectedCompetitionId)
      .map((match) => match.season_id)
  );
  const seasonsForSelectedCompetition = gameSelection.seasons.filter(
    (season) => season.competition_id === selectedCompetitionId && seasonIdsWithMatches.has(season.id)
  );
  const requestedSeasonId = params.home_season_id ?? "";
  const selectedSeasonId = seasonsForSelectedCompetition.some((season) => season.id === requestedSeasonId)
    ? requestedSeasonId
    : selectedMatchForDefault &&
        selectedMatchForDefault.competition_id === selectedCompetitionId &&
        seasonsForSelectedCompetition.some((season) => season.id === selectedMatchForDefault.season_id)
      ? selectedMatchForDefault.season_id
      : seasonsForSelectedCompetition.find((season) => season.is_current)?.id ?? seasonsForSelectedCompetition[0]?.id ?? "";
  const matchdaysForSelectedSeason = (matchdaysBySeason.get(selectedSeasonId) ?? []).filter(
    (matchday) => (matchesByMatchday.get(matchday.id)?.length ?? 0) > 0
  );
  const requestedMatchdayId = params.home_matchday_id ?? "";
  const selectedMatchdayId = matchdaysForSelectedSeason.some((matchday) => matchday.id === requestedMatchdayId)
    ? requestedMatchdayId
    : selectedMatchForDefault &&
        selectedMatchForDefault.season_id === selectedSeasonId &&
        selectedMatchForDefault.matchday_id &&
        matchdaysForSelectedSeason.some((matchday) => matchday.id === selectedMatchForDefault.matchday_id)
      ? selectedMatchForDefault.matchday_id
      : matchdaysForSelectedSeason[0]?.id ?? "";
  const selectedCompetition = gameSelection.competitions.find((competition) => competition.id === selectedCompetitionId);
  const selectedSeason = gameSelection.seasons.find((season) => season.id === selectedSeasonId);
  const selectedMatchday = gameSelection.matchdays.find((matchday) => matchday.id === selectedMatchdayId);
  const filteredGames = selectedMatchdayId ? matchesByMatchday.get(selectedMatchdayId) ?? [] : [];
  const filteredGameIds = new Set(filteredGames.map((match) => match.id));
  const selectedFeaturedMatchesOutsideFilter = selectedFeaturedMatches.filter(
    (item) => matchesById.has(item.match_id) && !filteredGameIds.has(item.match_id)
  );
  const belowHeadlineMode = editorial?.below_headline_mode === "roundup" ? "roundup" : "highlights";
  const complementaryMode =
    editorial?.complementary_mode === "roundup_video" ? "roundup_video" : "complementary_story";
  const globalMessage = pageMessage(params);

  return (
    <main className="home-admin-shell">
      <style>{homeEditorialStyles}</style>
      <div className="home-admin-container">
        <section className="home-admin-hero">
          <div>
            <p className="home-admin-eyebrow">Jornada.pt</p>
            <h1>Home Editorial</h1>
            <span>
              Edicao controlada da Home Editorial nas tabelas site_*. No laboratorio da Home, estes dados ja alimentam
              a Home publica em Preview; a promocao para producao depende de validacao final e merge controlado para main.
            </span>
          </div>
          <nav className="home-admin-actions" aria-label="Navegacao editorial">
            <a href="/admin/editorial/artigos">Artigos / Noticias</a>
            <a href="/admin/editorial/conteudos">VÍDEO</a>
            <a href="/admin/editorial/composicao">Composicao Editorial</a>
            <a href="/admin/editorial/jornada">Editorial da Jornada</a>
            <a href="/admin/gestor">Centro de Gestao</a>
            <a href="/admin">Backoffice</a>
          </nav>
        </section>

        <nav className="home-admin-block-nav" aria-label="Navegacao interna da Home Editorial">
          <a href="#home-headline">Manchete</a>
          <a href="#home-side-block">Bloco lateral</a>
          <a href="#home-composition">Composicao</a>
          <a href="#home-horizontal-news">Faixa horizontal</a>
          <a href="#home-final-zone">Zona Final</a>
        </nav>

        {error ? <div className="home-admin-error">Erro ao ler site_*: {error}</div> : null}
        {!error && !editorial ? (
          <div className="home-admin-error">Nao foi encontrado registo em site_editorials com slug=&quot;home&quot;.</div>
        ) : null}
        <FeedbackMessage message={globalMessage} />

        <section className="home-admin-section-stack">
          <div className="home-admin-zone-panels">
              <section className="home-admin-zone-panel home-admin-panel home-admin-featured-games" data-zone="games" id="home-games">
                <header>
                  <div>
                    <h2>Jogos da barra da Home</h2>
                    <p>
                      Primeira zona operacional da Home Editorial. Grava a selecao em site_featured_matches e alimenta a
                      barra de jogos da Home no laboratorio validado.
                    </p>
                  </div>
                  <span className="home-admin-source">site_featured_matches</span>
                </header>
                <FeedbackMessage message={scopedMessage(params, "games")} />
                {gameSelection.error ? (
                  <div className="home-admin-error">Erro ao ler jogos reais: {gameSelection.error}</div>
                ) : gameSelection.matches.length > 0 ? (
                  <div className="home-admin-featured-games-form">
                    <div className="home-admin-selected-summary">
                      <strong>{selectedFeaturedMatches.length} jogos selecionados para a barra da Home</strong>
                      {selectedFeaturedMatches.length > 0 ? (
                        <div className="home-admin-selected-chips" aria-label="Jogos selecionados">
                          {selectedFeaturedMatches.map((item) => {
                            const match = matchesById.get(item.match_id);

                            return (
                              <span className="home-admin-selected-chip" key={item.id ?? item.match_id}>
                                {item.sort_order ?? "-"} - {match ? matchTitle(match, teamsById) : item.match_id}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="home-admin-empty" style={{ padding: 0 }}>
                          Ainda nao ha jogos selecionados.
                        </p>
                      )}
                    </div>

                    <form className="home-admin-game-filter-form" action="/admin/editorial/home#home-games" method="get">
                      <div className="home-admin-game-filter-grid">
                        <label>
                          Competicao
                          <select name="home_competition_id" defaultValue={selectedCompetitionId}>
                            {competitionsForFilter.length > 0 ? null : <option value="">Sem competicoes com jogos</option>}
                            {competitionsForFilter.map((competition) => (
                              <option key={competition.id} value={competition.id}>
                                {competition.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Epoca
                          <select name="home_season_id" defaultValue={selectedSeasonId}>
                            {seasonsForSelectedCompetition.length > 0 ? null : <option value="">Sem epocas com jogos</option>}
                            {seasonsForSelectedCompetition.map((season) => (
                              <option key={season.id} value={season.id}>
                                {season.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Jornada
                          <select name="home_matchday_id" defaultValue={selectedMatchdayId}>
                            {matchdaysForSelectedSeason.length > 0 ? null : <option value="">Sem jornadas com jogos</option>}
                            {matchdaysForSelectedSeason.map((matchday) => (
                              <option key={matchday.id} value={matchday.id}>
                                J{matchday.number} - {matchday.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit">Ver jogos</button>
                      </div>
                    </form>

                    <form className="home-admin-game-selection-form" action="/api/admin/editorial/home" method="post">
                      <input type="hidden" name="action_type" value="update_featured_matches" />
                      <input type="hidden" name="save_context" value="games" />
                      <input type="hidden" name="home_competition_id" value={selectedCompetitionId} />
                      <input type="hidden" name="home_season_id" value={selectedSeasonId} />
                      <input type="hidden" name="home_matchday_id" value={selectedMatchdayId} />
                      <div className="home-admin-game-context">
                        <strong>Contexto visivel</strong>
                        <span>{selectedCompetition?.name ?? "Sem competicao"}</span>
                        <span>{selectedSeason?.label ?? "Sem epoca"}</span>
                        <span>
                          {selectedMatchday ? `J${selectedMatchday.number} - ${selectedMatchday.label}` : "Sem jornada"}
                        </span>
                        <span>{filteredGames.length} jogos</span>
                      </div>

                      {gameSelection.matches.map((match) => (
                        <input key={match.id} type="hidden" name="available_match_id" value={match.id} />
                      ))}
                      {selectedFeaturedMatchesOutsideFilter.map((item) => (
                        <input key={`selected-${item.match_id}`} type="hidden" name="featured_match_id" value={item.match_id} />
                      ))}
                      {selectedFeaturedMatchesOutsideFilter.map((item) => (
                        <input
                          key={`order-${item.match_id}`}
                          type="hidden"
                          name={`featured_order_${item.match_id}`}
                          value={typeof item.sort_order === "number" ? item.sort_order : ""}
                        />
                      ))}

                      {filteredGames.length > 0 ? (
                        <div className="home-admin-game-list">
                          {filteredGames.map((match) => {
                            const selected = selectedIds.has(match.id);
                            const orderValue = selectedOrderByMatchId.get(match.id);

                            return (
                              <article className={`home-admin-game-row${selected ? " is-selected" : ""}`} key={match.id}>
                                <label className="home-admin-game-check">
                                  <input
                                    defaultChecked={selected}
                                    name="featured_match_id"
                                    type="checkbox"
                                    value={match.id}
                                  />
                                  <span>Selecionar</span>
                                </label>
                                <div className="home-admin-game-main">
                                  <strong>{matchTitle(match, teamsById)}</strong>
                                  <small>
                                    {formatMatchSchedule(match.scheduled_date, match.kickoff_at)} | {matchStatusLabel(match)}
                                  </small>
                                </div>
                                <span className="home-admin-game-score">{matchScoreLabel(match)}</span>
                                <label className="home-admin-game-order">
                                  <span>Ordem</span>
                                  <input
                                    min={1}
                                    name={`featured_order_${match.id}`}
                                    placeholder="auto"
                                    type="number"
                                    defaultValue={typeof orderValue === "number" ? orderValue : ""}
                                  />
                                </label>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="home-admin-empty">
                          Escolhe uma competicao, epoca e jornada com jogos para editar a selecao visivel.
                        </p>
                      )}

                      <div className="home-admin-save-row">
                        <p>
                          Esta acao grava apenas site_featured_matches. Alimenta a barra de jogos da Home no laboratorio
                          validado; nao altera jogos, competicoes, epocas, jornadas ou classificacao.
                        </p>
                        <button type="submit">Guardar jogos da barra da Home</button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <p className="home-admin-empty">Nao ha jogos reais disponiveis para selecao.</p>
                )}
              </section>

              {editorial ? (
                <>
                {highlightEditorRows.map((row) => {
                  return (
                    <form
                      action="/api/admin/editorial/home"
                      className="home-admin-hidden-form"
                      id={`home-highlight-form-${row.key}`}
                      key={`highlight-form-${row.key}`}
                      method="post"
                    />
                  );
                })}
                {roundupEditorRows.map((item) => {
                  return (
                    <form
                      action="/api/admin/editorial/home"
                      className="home-admin-hidden-form"
                      id={`home-roundup-form-${item.id}`}
                      key={`roundup-form-${item.id}`}
                      method="post"
                    />
                  );
                })}
                {horizontalNewsEditorOrders.map((order) => (
                  <form
                    action="/api/admin/editorial/home"
                    className="home-admin-hidden-form"
                    id={`home-horizontal-news-form-${order}`}
                    key={`horizontal-news-form-${order}`}
                    method="post"
                  />
                ))}
                {finalZoneEditorRows.map((row) => {
                  return (
                    <form
                      action="/api/admin/editorial/home"
                      className="home-admin-hidden-form"
                      id={`home-final-zone-form-${row.key}`}
                      key={`final-zone-form-${row.key}`}
                      method="post"
                    />
                  );
                })}
                <form className="home-admin-editorial-flow" action="/api/admin/editorial/home" method="post">
                  <input type="hidden" name="action_type" value="update_site_editorial_home" />
                  <input type="hidden" name="site_editorial_id" value={editorial.id} />

                  <div className="home-admin-editorial-grid">
                    <section className="home-admin-zone-panel home-admin-panel" data-zone="headline" id="home-headline">
                      <header>
                        <div>
                          <h2>Manchete principal</h2>
                          <p>Atualiza apenas os campos principais da manchete em site_editorials.slug=home.</p>
                        </div>
                        <span className="home-admin-source">site_editorials</span>
                      </header>
                      <FeedbackMessage message={scopedMessage(params, "headline")} />
                      <div className="home-admin-edit-form">
                        <section className="home-admin-form-section">
                          <div className="home-admin-zone-kicker">
                            <h3>Conteudo da manchete</h3>
                            <small>site_editorials.headline_*</small>
                          </div>
                          <div className="home-admin-muted-card home-admin-empty">
                            <label className="home-admin-field is-wide">
                              <span>Preencher manchete com fonte publicada</span>
                              <select data-home-headline-article-select defaultValue="">
                                <option value="">Escolher fonte publicada</option>
                                {publishedSources.map((source) => (
                                  <option
                                    key={`${source.source_type}-${source.source_id}`}
                                    value={`${source.source_type}:${source.source_id}`}
                                    data-home-headline-title={textValue(source.title)}
                                    data-home-headline-subtitle={textValue(source.subtitle, source.summary)}
                                    data-home-headline-image-url={textValue(source.thumbnail_url, source.image_url)}
                                    data-home-headline-link-url={textValue(source.link_url)}
                                  >
                                    {textValue(source.title, source.source_slug, source.source_id)} - {source.origin_label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p>
                              Ao escolher uma fonte, a manchete recebe um snapshot editavel com titulo,
                              subtitulo, imagem e link publico.
                            </p>
                          </div>
                          <div className="home-admin-form-grid">
                            <TextField label="Titulo" name="headline_title" value={editorial.headline_title} wide />
                            <TextAreaField label="Subtitulo" name="headline_subtitle" value={editorial.headline_subtitle} />
                            <TextField label="Imagem" name="headline_image_url" value={editorial.headline_image_url} wide />
                            <TextField label="Link" name="headline_link_url" value={editorial.headline_link_url} wide />
                            <TextField label="Cor do titulo" name="headline_title_color" value={editorial.headline_title_color} placeholder="#10151b" />
                            <StatusField label="Estado geral" name="status" value={editorial.status} />
                          </div>
                        </section>
                        <div className="home-admin-save-row">
                          <p>Guarda a tabela-mae site_editorials. No laboratorio validado, estes campos alimentam a manchete da Home.</p>
                          <button name="save_context" type="submit" value="headline">Guardar manchete</button>
                        </div>
                      </div>
                    </section>

                    <section className="home-admin-zone-panel home-admin-panel" data-zone="side" id="home-side-block">
                      <header>
                        <div>
                          <h2>Bloco lateral</h2>
                          <p>Edita o snapshot editorial lateral guardado em site_editorials.</p>
                        </div>
                        <span className="home-admin-source">site_editorials</span>
                      </header>
                      <FeedbackMessage message={scopedMessage(params, "side")} />
                      <div className="home-admin-edit-form">
                        <section className="home-admin-form-section">
                          <div className="home-admin-zone-kicker">
                            <h3>Conteudo do bloco lateral</h3>
                            <small>site_editorials.side_block_*</small>
                          </div>
                          <div className="home-admin-muted-card home-admin-empty">
                            <label className="home-admin-field is-wide">
                              <span>Preencher bloco lateral com fonte publicada</span>
                              <select data-home-side-article-select defaultValue="">
                                <option value="">Escolher fonte publicada</option>
                                {publishedSources.map((source) => (
                                  <option
                                    key={`${source.source_type}-${source.source_id}`}
                                    value={`${source.source_type}:${source.source_id}`}
                                    data-home-side-label={publishedSourceHighlightLabel(source)}
                                    data-home-side-title={textValue(source.title)}
                                    data-home-side-text={textValue(source.subtitle, source.summary)}
                                    data-home-side-image-url={textValue(source.thumbnail_url, source.image_url)}
                                    data-home-side-link-url={textValue(source.link_url)}
                                    data-home-side-author={textValue(source.author)}
                                  >
                                    {textValue(source.title, source.source_slug, source.source_id)} - {source.origin_label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p>
                              Ao escolher uma fonte, o bloco lateral recebe um snapshot editavel com etiqueta,
                              titulo, texto, imagem e link publico.
                            </p>
                          </div>
                          <div className="home-admin-form-grid">
                            <TextField label="Tipo" name="side_block_type" value={editorial.side_block_type} />
                            <TextField label="Antetitulo" name="side_block_label" value={editorial.side_block_label} />
                            <TextField label="Cor do antetitulo" name="side_block_label_color" value={editorial.side_block_label_color} placeholder="#c40000" />
                            <TextField label="Titulo" name="side_block_title" value={editorial.side_block_title} wide />
                            <TextAreaField label="Texto" name="side_block_text" value={editorial.side_block_text} />
                            <TextField label="Autor" name="side_block_author" value={editorial.side_block_author} />
                            <StatusField label="Estado" name="side_block_status" value={editorial.side_block_status} />
                            <TextField label="Imagem" name="side_block_image_url" value={editorial.side_block_image_url} wide />
                            <TextField label="Link" name="side_block_link_url" value={editorial.side_block_link_url} wide />
                            <TextField label="Cor do titulo" name="side_block_title_color" value={editorial.side_block_title_color} placeholder="#10151b" />
                          </div>
                        </section>
                        <div className="home-admin-save-row">
                          <p>Guarda a tabela-mae site_editorials. Nao edita tabelas filhas.</p>
                          <button name="save_context" type="submit" value="side">Guardar bloco lateral</button>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section className="home-admin-zone-panel home-admin-panel home-admin-composition" id="home-composition">
                    <header>
                      <div>
                        <h2>Zonas editoriais da Home</h2>
                        <p>Destaques da manchete, resumo de video e complemento funcionam como zonas publicas independentes.</p>
                      </div>
                      <span className="home-admin-source">site_editorials + leitura site_*</span>
                    </header>
                    <FeedbackMessage message={scopedMessage(params, "composition")} />
                    <div className="home-admin-composition-body" data-home-composition-form>
                      <div className="home-admin-composition-grid">
                        <div className="home-admin-composition-main-stack">
                          <section className="home-admin-composition-card" id="home-highlights">
                            <div className="home-admin-zone-kicker">
                              <h3>Destaques da manchete</h3>
                              <small>site_editorials.below_headline_* + site_editorial_highlights</small>
                            </div>
                            <p>Controla apenas os tres destaques apresentados imediatamente abaixo da manchete.</p>
                            <FeedbackMessage message={scopedMessage(params, "highlights")} />
                            <section className="home-admin-form-section">
                              <div className="home-admin-subzone-heading">
                                <h4>Publicacao e cabecalho</h4>
                                <small>zona independente</small>
                              </div>
                              <div className="home-admin-form-grid">
                                <label className="home-admin-field">
                                  <span>Estado dos destaques</span>
                                  <select data-home-below-select name="below_headline_mode" defaultValue={belowHeadlineMode}>
                                    <option value="highlights">Ativos</option>
                                    <option value="roundup">Inativos</option>
                                  </select>
                                </label>
                                <TextField label="Titulo da zona" name="below_headline_heading" value={editorial.below_headline_heading} />
                                <TextField
                                  label="Cor do titulo da zona"
                                  name="below_headline_heading_color"
                                  value={editorial.below_headline_heading_color}
                                  placeholder="#10151b"
                                />
                              </div>
                            </section>
                            <div className="home-admin-highlights-form" role="group" aria-label="Editar Destaques abaixo da manchete">
                              {highlights.length === 0 ? (
                                <p className="home-admin-muted-card home-admin-empty">
                                  Ainda nao existem destaques guardados. Preenche uma das linhas abaixo para criar um destaque seguro em
                                  site_editorial_highlights.
                                </p>
                              ) : null}
                              <div className="home-admin-highlight-editor-list">
                                {highlightEditorRows.map((row, index) => {
                                  const item = row.item;
                                  const itemHasContent = item ? highlightHasReadableContent(item) : false;
                                  const emptyLabel = item ? compactStateLabel(item.status, itemHasContent) : null;
                                  const cleanLink = item?.link_url?.trim();
                                  const number = itemNumber(item?.sort_order, row.order);
                                  const anchor = itemAnchor("home-highlight-item", number);
                                  const formId = `home-highlight-form-${row.key}`;
                                  const summaryTitle = textValue(item?.title, "Novo destaque editorial");
                                  const summaryMeta = textValue(item?.label, "sem etiqueta");
                                  const cardClass = [
                                    "home-admin-highlight-editor-card",
                                    "home-admin-collapsible-editor",
                                    index === 0 ? "is-primary" : "",
                                    item && !itemHasContent ? "is-muted" : "",
                                    item ? "" : "is-new"
                                  ].filter(Boolean).join(" ");

                                  return (
                                    <details className={cardClass} data-home-highlight-card="true" id={anchor} key={row.key} open={params.item === anchor}>
                                      <summary>
                                        <span className="home-admin-collapsible-title">
                                          <strong>#{number} - {emptyLabel ?? summaryTitle}</strong>
                                          <small>{summaryMeta}</small>
                                        </span>
                                        <StatusPill status={item?.status} />
                                      </summary>
                                      <fieldset className="home-admin-item-editor-fields">
                                      <legend className="home-admin-sr-only">Editar destaque #{number}</legend>
                                      <input form={formId} type="hidden" name="action_type" value="update_highlight_item" />
                                      <input form={formId} type="hidden" name="site_editorial_id" value={editorial.id} />
                                      <input form={formId} type="hidden" name="return_anchor" value={anchor} />
                                      <input form={formId} type="hidden" name="highlight_row" value={row.key} />
                                      <input
                                        form={formId}
                                        type="hidden"
                                        name={`highlight_${row.key}_id`}
                                        defaultValue={item?.id ?? ""}
                                      />
                                      <div className="home-admin-highlight-editor-preview">
                                        <div className="home-admin-row-media">
                                          <MediaPreview label={textValue(item?.title, "Destaque")} src={item?.image_url} />
                                        </div>
                                        <div className="home-admin-final-content">
                                          <div className="home-admin-compact-meta">
                                            <span className="home-admin-meta">
                                              {item?.sort_order ?? row.order} | {textValue(item?.label, "sem etiqueta")}
                                            </span>
                                            <StatusPill status={item?.status} />
                                          </div>
                                          <strong>{emptyLabel ?? textValue(item?.title, "Novo destaque editorial")}</strong>
                                          {item?.subtitle?.trim() ? <p>{item.subtitle}</p> : null}
                                          <div className="home-admin-final-link-row">
                                            {cleanLink ? (
                                              <a className="home-admin-link-out" href={cleanLink} title={cleanLink}>
                                                Abrir link
                                              </a>
                                            ) : (
                                              <span className="home-admin-meta">Sem link</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="home-admin-muted-card home-admin-empty">
                                        <label className="home-admin-field is-wide">
                                          <span>Preencher com fonte publicada</span>
                                          <select data-home-highlight-article-select defaultValue="">
                                            <option value="">Escolher fonte publicada</option>
                                            {publishedSources.map((source) => (
                                              <option
                                                key={`${source.source_type}-${source.source_id}`}
                                                value={`${source.source_type}:${source.source_id}`}
                                                data-home-highlight-label={publishedSourceHighlightLabel(source)}
                                                data-home-highlight-title={textValue(source.title)}
                                                data-home-highlight-subtitle={publishedSourceHighlightSubtitle(source)}
                                                data-home-highlight-image-url={publishedSourceHighlightImageUrl(source)}
                                                data-home-highlight-link-url={textValue(source.link_url)}
                                              >
                                                {textValue(source.title, source.source_slug, source.source_id)} - {source.origin_label}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <p>
                                          Ao escolher uma fonte, este destaque recebe um snapshot editavel com etiqueta, titulo,
                                          subtitulo, imagem e link publico.
                                        </p>
                                      </div>
                                      <div className="home-admin-form-grid">
                                        <label className="home-admin-field">
                                          <span>Ordem</span>
                                          <input
                                            form={formId}
                                            min={1}
                                            name={`highlight_${row.key}_sort_order`}
                                            data-home-highlight-field="sort_order"
                                            type="number"
                                            defaultValue={item?.sort_order ?? row.order}
                                          />
                                        </label>
                                        <label className="home-admin-field">
                                          <span>Etiqueta</span>
                                          <input
                                            form={formId}
                                            name={`highlight_${row.key}_label`}
                                            data-home-highlight-field="label"
                                            type="text"
                                            defaultValue={item?.label ?? ""}
                                          />
                                        </label>
                                        <label className="home-admin-field">
                                          <span>Cor do antetitulo</span>
                                          <input
                                            form={formId}
                                            name={`highlight_${row.key}_label_color`}
                                            type="text"
                                            defaultValue={item?.label_color ?? ""}
                                            placeholder="#c40000"
                                            pattern="^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$"
                                          />
                                        </label>
                                        <label className="home-admin-field">
                                          <span>Estado</span>
                                          <select
                                            form={formId}
                                            name={`highlight_${row.key}_status`}
                                            defaultValue={item?.status === "published" ? "published" : "draft"}
                                          >
                                            <option value="draft">Rascunho</option>
                                            <option value="published">Publicado</option>
                                          </select>
                                        </label>
                                        <label className="home-admin-field is-wide">
                                          <span>Titulo</span>
                                          <input
                                            form={formId}
                                            name={`highlight_${row.key}_title`}
                                            data-home-highlight-field="title"
                                            type="text"
                                            defaultValue={item?.title ?? ""}
                                          />
                                        </label>
                                        <label className="home-admin-field is-wide">
                                          <span>Subtitulo</span>
                                          <textarea
                                            form={formId}
                                            name={`highlight_${row.key}_subtitle`}
                                            data-home-highlight-field="subtitle"
                                            rows={3}
                                            defaultValue={item?.subtitle ?? ""}
                                          />
                                        </label>
                                        <label className="home-admin-field is-wide">
                                          <span>Imagem</span>
                                          <input
                                            form={formId}
                                            name={`highlight_${row.key}_image_url`}
                                            data-home-highlight-field="image_url"
                                            type="url"
                                            defaultValue={item?.image_url ?? ""}
                                          />
                                        </label>
                                        <label className="home-admin-field is-wide">
                                          <span>Link</span>
                                          <input
                                            form={formId}
                                            name={`highlight_${row.key}_link_url`}
                                            data-home-highlight-field="link_url"
                                            type="text"
                                            defaultValue={item?.link_url ?? ""}
                                          />
                                        </label>
                                      </div>
                                      <FeedbackMessage message={itemMessage(params, "highlights", anchor, `Destaque #${number}`)} />
                                      <div className="home-admin-save-row">
                                        <button form={formId} type="submit">Guardar destaque #{number}</button>
                                      </div>
                                      </fieldset>
                                    </details>
                                  );
                                })}
                              </div>
                              {emptyHighlights.length > 0 ? (
                                <p className="home-admin-muted-card home-admin-empty">
                                  {emptyGroupLabel(emptyHighlights.length)} nos destaques, nas posicoes {sortOrderList(emptyHighlights)}.
                                  Estes itens continuam editaveis acima.
                                </p>
                              ) : null}
                            </div>
                            <div className="home-admin-save-row">
                              <p>Guarda apenas o estado e o cabecalho da zona. Cada destaque continua a ter o seu proprio botao.</p>
                              <button name="save_context" type="submit" value="highlights">Guardar zona de destaques</button>
                            </div>
                          </section>

                          <section className="home-admin-composition-card" id="home-roundup">
                            <div className="home-admin-zone-kicker">
                              <h3>Resumo de video</h3>
                              <small>site_editorials.roundup_* + site_editorial_roundup_items</small>
                            </div>
                            <p>Controla de forma independente a lista de resumos, o video selecionado e o respetivo cabecalho.</p>
                            <FeedbackMessage message={scopedMessage(params, "roundup")} />
                            <section className="home-admin-form-section">
                              <div className="home-admin-subzone-heading">
                                <h4>Publicacao, cabecalho e selecao inicial</h4>
                                <small>zona independente</small>
                              </div>
                              <div className="home-admin-form-grid">
                                <label className="home-admin-field">
                                  <span>Estado do resumo de video</span>
                                  <select data-home-roundup-select name="complementary_mode" defaultValue={complementaryMode}>
                                    <option value="roundup_video">Ativo</option>
                                    <option value="complementary_story">Inativo</option>
                                  </select>
                                </label>
                                <TextField label="Titulo da zona" name="roundup_video_heading" value={editorial.roundup_video_heading} />
                                <TextField
                                  label="Cor do titulo da zona"
                                  name="roundup_video_heading_color"
                                  value={editorial.roundup_video_heading_color}
                                  placeholder="#10151b"
                                />
                                <label className="home-admin-field is-wide">
                                  <span>Item de resumo inicial</span>
                                  <select name="complementary_roundup_item_id" defaultValue={editorial.complementary_roundup_item_id ?? ""}>
                                    <option value="">Usar primeiro item publicado</option>
                                    {roundupItems.map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {item.sort_order ?? "-"} - {textValue(item.title, item.label, "Item sem titulo")}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <ul className="home-admin-list is-compact">
                                {visibleRoundupItems.slice(0, 3).map((item) => (
                                  <li key={item.id}>
                                    <div className="home-admin-row-media">
                                      <MediaPreview label={textValue(item.title, "Roundup")} src={item.image_url} />
                                    </div>
                                    <div className="home-admin-compact-meta">
                                      <span className="home-admin-meta">{item.sort_order ?? "-"} | {textValue(item.type, "sem tipo")}</span>
                                      <StatusPill status={item.status} />
                                    </div>
                                    <strong>{textValue(item.title, "Item sem conteudo")}</strong>
                                  </li>
                                ))}
                                {visibleRoundupItems.length === 0 ? (
                                  <li className="home-admin-empty-group">
                                    <strong>Sem itens de resumo com conteudo visivel.</strong>
                                    <small>Publica pelo menos um item para preencher esta zona na Home.</small>
                                  </li>
                                ) : null}
                              </ul>
                            </section>
                            <div className="home-admin-highlights-form" role="group" aria-label="Editar Videos / Resumo / Roundup">
                              {roundupEditorRows.length === 0 ? (
                                <p className="home-admin-muted-card home-admin-empty">
                                  Ainda nao existem itens guardados em site_editorial_roundup_items.
                                </p>
                              ) : null}
                              <div className="home-admin-highlight-editor-list">
                                {roundupEditorRows.map((item, index) => {
                                  const itemHasContent = roundupHasReadableContent(item);
                                  const emptyLabel = compactStateLabel(item.status, itemHasContent);
                                  const number = itemNumber(item.sort_order, index + 1);
                                  const anchor = itemAnchor("home-roundup-item", number);
                                  const formId = `home-roundup-form-${item.id}`;
                                  const summaryTitle = textValue(item.title, "Item sem titulo");
                                  const summaryMeta = `${textValue(item.type, "sem tipo")} | ${textValue(item.duration, "sem duracao")}`;
                                  const cardClass = [
                                    "home-admin-highlight-editor-card",
                                    "home-admin-collapsible-editor",
                                    index === 0 ? "is-primary" : "",
                                    !itemHasContent ? "is-muted" : ""
                                  ].filter(Boolean).join(" ");

                                  return (
                                    <details className={cardClass} id={anchor} key={item.id} open={params.item === anchor}>
                                      <summary>
                                        <span className="home-admin-collapsible-title">
                                          <strong>#{number} - {emptyLabel ?? summaryTitle}</strong>
                                          <small>{summaryMeta}</small>
                                        </span>
                                        <StatusPill status={item.status} />
                                      </summary>
                                      <fieldset className="home-admin-item-editor-fields">
                                        <legend className="home-admin-sr-only">Editar item Roundup #{number}</legend>
                                        <input form={formId} type="hidden" name="action_type" value="update_roundup_items" />
                                        <input form={formId} type="hidden" name="site_editorial_id" value={editorial.id} />
                                        <input form={formId} type="hidden" name="return_anchor" value={anchor} />
                                        <input form={formId} type="hidden" name="roundup_row" value={item.id} />
                                        <input form={formId} type="hidden" name={`roundup_${item.id}_id`} value={item.id} />
                                        <div className="home-admin-highlight-editor-preview">
                                          <div className="home-admin-row-media">
                                            <MediaPreview label={textValue(item.title, "Roundup")} src={item.image_url} />
                                          </div>
                                          <div className="home-admin-final-content">
                                            <div className="home-admin-compact-meta">
                                              <span className="home-admin-meta">
                                                {item.sort_order ?? "-"} | {summaryMeta}
                                              </span>
                                              <StatusPill status={item.status} />
                                            </div>
                                            <strong>{emptyLabel ?? textValue(item.title, "Item sem conteudo")}</strong>
                                            {item.subtitle?.trim() ? <p>{item.subtitle}</p> : null}
                                            <div className="home-admin-final-link-row">
                                              {item.video_url?.trim() ? (
                                                <a className="home-admin-link-out" href={item.video_url} title={item.video_url}>
                                                  Abrir video
                                                </a>
                                              ) : (
                                                <span className="home-admin-meta">Sem video</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="home-admin-form-grid">
                                          <label className="home-admin-field">
                                            <span>Ordem</span>
                                            <input
                                              form={formId}
                                              min={1}
                                              name={`roundup_${item.id}_sort_order`}
                                              type="number"
                                              defaultValue={item.sort_order ?? index + 1}
                                            />
                                          </label>
                                          <label className="home-admin-field">
                                            <span>Etiqueta</span>
                                            <input form={formId} name={`roundup_${item.id}_label`} type="text" defaultValue={item.label ?? ""} />
                                          </label>
                                          <label className="home-admin-field">
                                            <span>Tipo</span>
                                            <select form={formId} name={`roundup_${item.id}_type`} defaultValue={item.type ?? ""}>
                                              <option value="">Sem tipo</option>
                                              <option value="video">Video</option>
                                              <option value="resumo">Resumo</option>
                                              <option value="golos">Golos</option>
                                              <option value="noticia">Noticia</option>
                                            </select>
                                          </label>
                                          <label className="home-admin-field">
                                            <span>Estado</span>
                                            <select form={formId} name={`roundup_${item.id}_status`} defaultValue={item.status === "published" ? "published" : "draft"}>
                                              <option value="draft">Rascunho</option>
                                              <option value="published">Publicado</option>
                                            </select>
                                          </label>
                                          <label className="home-admin-field is-wide">
                                            <span>Titulo</span>
                                            <input form={formId} name={`roundup_${item.id}_title`} type="text" defaultValue={item.title ?? ""} />
                                          </label>
                                          <label className="home-admin-field is-wide">
                                            <span>Subtitulo / resumo</span>
                                            <textarea form={formId} name={`roundup_${item.id}_subtitle`} rows={3} defaultValue={item.subtitle ?? ""} />
                                          </label>
                                          <label className="home-admin-field is-wide">
                                            <span>Imagem</span>
                                            <input form={formId} name={`roundup_${item.id}_image_url`} type="url" defaultValue={item.image_url ?? ""} />
                                          </label>
                                          <label className="home-admin-field is-wide">
                                            <span>URL do video</span>
                                            <input form={formId} name={`roundup_${item.id}_video_url`} type="text" defaultValue={item.video_url ?? ""} />
                                          </label>
                                          <label className="home-admin-field">
                                            <span>Duracao</span>
                                            <input form={formId} name={`roundup_${item.id}_duration`} type="text" defaultValue={item.duration ?? ""} />
                                          </label>
                                        </div>
                                        <FeedbackMessage message={itemMessage(params, "roundup", anchor, `Item #${number}`)} />
                                        <div className="home-admin-save-row">
                                          <button form={formId} type="submit">Guardar item #{number}</button>
                                        </div>
                                      </fieldset>
                                    </details>
                                  );
                                })}
                              </div>
                              {visibleRoundupItems.length === 0 ? (
                                <p className="home-admin-muted-card home-admin-empty">
                                  Sem videos/resumos com conteudo visivel. Os itens existentes continuam editaveis acima.
                                </p>
                              ) : null}
                            </div>
                            <div className="home-admin-save-row">
                              <p>Guarda apenas o estado, o cabecalho e a selecao inicial. Cada item continua a ter o seu proprio botao.</p>
                              <button name="save_context" type="submit" value="roundup">Guardar zona de resumo</button>
                            </div>
                          </section>
                          <EditorialHorizontalNewsEditor
                            id="home-horizontal-news"
                            description="Publica noticias numa faixa horizontal no fundo da Home. A zona cresce conforme o numero de noticias e apresenta cinco por linha no desktop."
                            tableName="site_editorial_horizontal_news"
                            items={horizontalNewsEditorItems}
                            orders={horizontalNewsEditorOrders}
                            sources={horizontalNewsSources}
                            formIdForOrder={(order) => `home-horizontal-news-form-${order}`}
                            hiddenFieldsForOrder={(order) => {
                              const anchor = itemAnchor("home-horizontal-news-item", String(order).padStart(2, "0"));
                              return [
                                { name: "action_type", value: "update_horizontal_news_item" },
                                { name: "site_editorial_id", value: editorial.id },
                                { name: "return_anchor", value: anchor }
                              ];
                            }}
                            messageForOrder={(order) => {
                              const anchor = itemAnchor("home-horizontal-news-item", String(order).padStart(2, "0"));
                              return <FeedbackMessage message={itemMessage(params, "horizontal-news", anchor, `Item #${String(order).padStart(2, "0")}`)} />;
                            }}
                            openOrder={horizontalNewsOpenOrder}
                          />
                        </div>

                        <div className="home-admin-composition-side-stack">
                          <section className="home-admin-composition-card" id="home-complement">
                            <h3>Complemento</h3>
                            <p>Controla apenas o conteudo editorial apresentado ao lado do resumo de video.</p>
                            <FeedbackMessage message={scopedMessage(params, "complement")} />
                            <section className="home-admin-form-section home-admin-mode-section">
                              <div className="home-admin-subzone-heading">
                                <h4>Publicacao e conteudo</h4>
                                <small>site_editorials.complementary_*</small>
                              </div>
                              <div className="home-admin-muted-card home-admin-empty">
                                <label className="home-admin-field is-wide">
                                  <span>Preencher complemento com fonte publicada</span>
                                  <select data-home-complement-article-select defaultValue="">
                                    <option value="">Escolher fonte publicada</option>
                                    {publishedSources.map((source) => (
                                      <option
                                        key={`${source.source_type}-${source.source_id}`}
                                        value={`${source.source_type}:${source.source_id}`}
                                        data-home-complement-label={publishedSourceHighlightLabel(source)}
                                        data-home-complement-title={textValue(source.title)}
                                        data-home-complement-text={textValue(source.subtitle, source.summary)}
                                        data-home-complement-image-url={textValue(source.thumbnail_url, source.image_url)}
                                        data-home-complement-link-url={textValue(source.link_url)}
                                      >
                                        {textValue(source.title, source.source_slug, source.source_id)} - {source.origin_label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <p>
                                  Ao escolher uma fonte, o complemento recebe um snapshot editavel com etiqueta,
                                  titulo, texto, imagem e link publico.
                                </p>
                              </div>
                              <div className="home-admin-form-grid">
                                <label className="home-admin-field">
                                  <span>Estado do complemento</span>
                                  <select name="complementary_status" defaultValue={editorial.complementary_status === "published" ? "published" : "draft"}>
                                    <option value="published">Ativo</option>
                                    <option value="draft">Inativo</option>
                                  </select>
                                </label>
                                <TextField label="Titulo da zona" name="complementary_label" value={editorial.complementary_label} />
                                <TextField label="Titulo do conteudo" name="complementary_title" value={editorial.complementary_title} wide />
                                <TextAreaField label="Texto" name="complementary_text" value={editorial.complementary_text} />
                                <TextField label="Imagem" name="complementary_image_url" value={editorial.complementary_image_url} wide />
                                <TextField label="Link" name="complementary_link_url" value={editorial.complementary_link_url} wide />
                              </div>
                            </section>
                            <div className="home-admin-save-row">
                              <p>Guarda apenas o estado e o conteudo desta zona independente.</p>
                              <button name="save_context" type="submit" value="complement">Guardar zona de complemento</button>
                            </div>
                          </section>

                          <section className="home-admin-composition-card home-admin-final-zone" id="home-final-zone">
                            <div className="home-admin-final-zone-header">
                              <div>
                                <h3>Zona editorial final</h3>
                                <p>Edita os cartoes editoriais que fecham a composicao da Home.</p>
                              </div>
                              <small>site_editorial_latest_news</small>
                            </div>
                            <FeedbackMessage message={scopedMessage(params, "final-zone")} />
                            <section className="home-admin-form-section">
                              <div className="home-admin-subzone-heading">
                                <h4>Configuracao publica da zona</h4>
                                <small>site_editorials.final_zone_*</small>
                              </div>
                              <div className="home-admin-form-grid">
                                <label className="home-admin-field">
                                  <span>Modo da zona</span>
                                  <select name="final_zone_mode" defaultValue={editorial.final_zone_mode ?? ""}>
                                    <option value="">Sem modo fixo</option>
                                    <option value="latest_news">Ultimas noticias</option>
                                    <option value="editorial_line">Linha editorial</option>
                                  </select>
                                </label>
                                <TextField
                                  label="Titulo publico da zona"
                                  name="final_zone_title"
                                  value={editorial.final_zone_title}
                                  placeholder="Pode ficar vazio"
                                  wide
                                />
                                <TextField
                                  label="Cor do titulo da zona"
                                  name="final_zone_title_color"
                                  value={editorial.final_zone_title_color}
                                  placeholder="#10151b"
                                />
                              </div>
                              <div className="home-admin-save-row">
                                <p>
                                  Guarda apenas a configuracao da zona em site_editorials. No laboratorio validado, controla a
                                  Zona Editorial Final; se o titulo ficar vazio, a Home pode omitir o titulo desta zona.
                                </p>
                                <button name="save_context" type="submit" value="final-zone">Guardar configuracao da zona</button>
                              </div>
                            </section>
                            <div className="home-admin-final-zone-form" role="group" aria-label="Editar Zona Editorial Final">
                              {latestNews.length === 0 ? (
                                <p className="home-admin-muted-card home-admin-empty">
                                  Ainda nao existem itens guardados. Preenche uma das linhas abaixo para criar um item seguro em
                                  site_editorial_latest_news.
                                </p>
                              ) : null}
                              <div className="home-admin-final-zone-list">
                                {finalZoneEditorRows.map((row, index) => {
                                  const item = row.item;
                                  const itemHasContent = item ? latestNewsHasReadableContent(item) : false;
                                  const emptyLabel = item ? compactStateLabel(item.status, itemHasContent) : null;
                                  const cleanLink = item?.link_url?.trim();
                                  const cleanSubtitle = item?.subtitle?.trim();
                                  const number = itemNumber(item?.sort_order, row.order);
                                  const anchor = itemAnchor("home-final-item", number);
                                  const formId = `home-final-zone-form-${row.key}`;
                                  const summaryTitle = textValue(item?.title, "Sem titulo");
                                  const summaryMeta = textValue(item?.time_label, "sem hora");
                                  const cardClass = [
                                    "home-admin-final-editor-card",
                                    "home-admin-collapsible-editor",
                                    index === 0 ? "is-primary" : "",
                                    item && !itemHasContent ? "is-muted" : "",
                                    item ? "" : "is-new"
                                  ].filter(Boolean).join(" ");

                                  return (
                                    <details className={cardClass} data-home-final-card id={anchor} key={row.key} open={params.item === anchor}>
                                      <summary>
                                        <span className="home-admin-collapsible-title">
                                          <strong>#{number} - {emptyLabel ?? summaryTitle}</strong>
                                          <small>{summaryMeta}</small>
                                        </span>
                                        <StatusPill status={item?.status} />
                                      </summary>
                                      <fieldset className="home-admin-item-editor-fields">
                                        <legend className="home-admin-sr-only">Editar item da Zona Editorial Final #{number}</legend>
                                        <input form={formId} type="hidden" name="action_type" value="update_final_zone" />
                                        <input form={formId} type="hidden" name="site_editorial_id" value={editorial.id} />
                                        <input form={formId} type="hidden" name="return_anchor" value={anchor} />
                                        <input form={formId} type="hidden" name="final_news_row" value={row.key} />
                                        <input form={formId} type="hidden" name={`final_news_${row.key}_id`} defaultValue={item?.id ?? ""} />
                                        <div className="home-admin-final-editor-preview">
                                          <div className="home-admin-row-media">
                                            <MediaPreview label={textValue(item?.title, "Ultima noticia")} src={item?.image_url} />
                                          </div>
                                          <div className="home-admin-final-content">
                                            <div className="home-admin-compact-meta">
                                              <span className="home-admin-meta">
                                                {item?.sort_order ?? row.order} | {summaryMeta}
                                              </span>
                                              <StatusPill status={item?.status} />
                                            </div>
                                            <strong>{emptyLabel ?? textValue(item?.title, "Novo item editorial")}</strong>
                                            {cleanSubtitle ? <p>{cleanSubtitle}</p> : null}
                                            <div className="home-admin-final-link-row">
                                              {cleanLink ? (
                                                <a className="home-admin-link-out" href={cleanLink} title={cleanLink}>
                                                  Abrir link
                                                </a>
                                              ) : (
                                                <span className="home-admin-meta">Sem link</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="home-admin-muted-card home-admin-empty">
                                          <label className="home-admin-field is-wide">
                                            <span>Preencher com fonte publicada</span>
                                            <select data-home-final-article-select defaultValue="">
                                              <option value="">Escolher fonte publicada</option>
                                              {publishedSources.map((source) => (
                                                <option
                                                  key={`${source.source_type}-${source.source_id}`}
                                                  value={`${source.source_type}:${source.source_id}`}
                                                  data-home-final-title={textValue(source.title)}
                                                  data-home-final-subtitle={textValue(source.subtitle, source.summary)}
                                                  data-home-final-image-url={textValue(source.thumbnail_url, source.image_url)}
                                                  data-home-final-link-url={textValue(source.link_url)}
                                                >
                                                  {textValue(source.title, source.source_slug, source.source_id)} - {source.origin_label}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                          <p>
                                            Ao escolher uma fonte, este item recebe um snapshot editavel com titulo,
                                            subtitulo, imagem e link publico.
                                          </p>
                                        </div>
                                        <div className="home-admin-form-grid">
                                          <label className="home-admin-field">
                                            <span>Ordem</span>
                                            <input form={formId} min={1} name={`final_news_${row.key}_sort_order`} type="number" defaultValue={item?.sort_order ?? row.order} />
                                          </label>
                                          <label className="home-admin-field">
                                            <span>Antetitulo</span>
                                            <input data-home-final-field="time_label" form={formId} name={`final_news_${row.key}_time_label`} type="text" defaultValue={item?.time_label ?? ""} />
                                          </label>
                                          <label className="home-admin-field">
                                            <span>Cor do antetitulo</span>
                                            <input form={formId} name={`final_news_${row.key}_time_label_color`} type="text" defaultValue={item?.time_label_color ?? ""} placeholder="#c40000" pattern="^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$" />
                                          </label>
                                          <label className="home-admin-field">
                                            <span>Estado</span>
                                            <select form={formId} name={`final_news_${row.key}_status`} defaultValue={item?.status === "published" ? "published" : "draft"}>
                                              <option value="draft">Rascunho</option>
                                              <option value="published">Publicado</option>
                                            </select>
                                          </label>
                                          <label className="home-admin-field is-wide">
                                            <span>Titulo</span>
                                            <input data-home-final-field="title" form={formId} name={`final_news_${row.key}_title`} type="text" defaultValue={item?.title ?? ""} />
                                          </label>
                                          <label className="home-admin-field is-wide">
                                            <span>Subtitulo / resumo</span>
                                            <textarea data-home-final-field="subtitle" form={formId} name={`final_news_${row.key}_subtitle`} rows={3} defaultValue={item?.subtitle ?? ""} />
                                          </label>
                                          <label className="home-admin-field is-wide">
                                            <span>Imagem</span>
                                            <input data-home-final-field="image_url" form={formId} name={`final_news_${row.key}_image_url`} type="url" defaultValue={item?.image_url ?? ""} />
                                          </label>
                                          <label className="home-admin-field is-wide">
                                            <span>Link</span>
                                            <input data-home-final-field="link_url" form={formId} name={`final_news_${row.key}_link_url`} type="text" defaultValue={item?.link_url ?? ""} />
                                          </label>
                                        </div>
                                        <FeedbackMessage message={itemMessage(params, "final-zone", anchor, `Item #${number}`)} />
                                        <div className="home-admin-save-row">
                                          <button form={formId} type="submit">Guardar item #{number}</button>
                                        </div>
                                      </fieldset>
                                    </details>
                                  );
                                })}
                              </div>
                              {emptyLatestNews.length > 0 ? (
                                <p className="home-admin-muted-card home-admin-empty">
                                  {emptyGroupLabel(emptyLatestNews.length)} em rascunho, nas posicoes {sortOrderList(emptyLatestNews)}.
                                  Estes itens continuam editaveis acima sem criar campos novos.
                                </p>
                              ) : null}
                            </div>
                          </section>
                        </div>
                      </div>
                    </div>
                  </section>
                </form>
                </>
              ) : null}

              <script
                dangerouslySetInnerHTML={{
                  __html: `
                    (function () {
                      var headlineArticleSelect = document.querySelector('[data-home-headline-article-select]');
                      var sideArticleSelect = document.querySelector('[data-home-side-article-select]');
                      var complementArticleSelect = document.querySelector('[data-home-complement-article-select]');
                      var highlightArticleSelects = Array.prototype.slice.call(document.querySelectorAll('[data-home-highlight-article-select]'));
                      var finalArticleSelects = Array.prototype.slice.call(document.querySelectorAll('[data-home-final-article-select]'));
                      function setFieldValue(field, value) {
                        if (!field) return;
                        field.value = value || '';
                        field.dispatchEvent(new Event('input', { bubbles: true }));
                        field.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                      function setHomeEditorialField(name, value, allowEmpty) {
                        if (!allowEmpty && !value) return;
                        var field = document.querySelector('[name="' + name + '"]');
                        setFieldValue(field, value);
                      }
                      function resetSourceSelect(select) {
                        if (select) select.value = '';
                      }
                      function markSourceApplied(select) {
                        if (!select || !select.parentElement) return;
                        var message = select.parentElement.querySelector('[data-home-source-applied-message]');
                        if (!message) {
                          message = document.createElement('span');
                          message.setAttribute('data-home-source-applied-message', 'true');
                          message.style.display = 'block';
                          message.style.marginTop = '6px';
                          message.style.color = '#475569';
                          message.style.fontSize = '12px';
                          message.style.fontWeight = '700';
                          select.insertAdjacentElement('afterend', message);
                        }
                        message.textContent = 'Fonte aplicada. Reve e guarda a zona.';
                        window.clearTimeout(select._homeSourceAppliedTimer);
                        select._homeSourceAppliedTimer = window.setTimeout(function () {
                          message.textContent = '';
                        }, 3500);
                      }
                      function finishPublishedSource(select) {
                        markSourceApplied(select);
                        resetSourceSelect(select);
                      }
                      function applyHomeHeadlineArticle() {
                        if (!headlineArticleSelect) return;
                        var option = headlineArticleSelect.options[headlineArticleSelect.selectedIndex];
                        if (!option || !option.value) return;
                        setHomeEditorialField('headline_title', option.dataset.homeHeadlineTitle, true);
                        setHomeEditorialField('headline_subtitle', option.dataset.homeHeadlineSubtitle, true);
                        setHomeEditorialField('headline_image_url', option.dataset.homeHeadlineImageUrl, true);
                        setHomeEditorialField('headline_link_url', option.dataset.homeHeadlineLinkUrl, true);
                        finishPublishedSource(headlineArticleSelect);
                      }
                      function applyHomeSideArticle() {
                        if (!sideArticleSelect) return;
                        var option = sideArticleSelect.options[sideArticleSelect.selectedIndex];
                        if (!option || !option.value) return;
                        setHomeEditorialField('side_block_label', option.dataset.homeSideLabel, true);
                        setHomeEditorialField('side_block_title', option.dataset.homeSideTitle, true);
                        setHomeEditorialField('side_block_text', option.dataset.homeSideText, true);
                        setHomeEditorialField('side_block_image_url', option.dataset.homeSideImageUrl, true);
                        setHomeEditorialField('side_block_link_url', option.dataset.homeSideLinkUrl, true);
                        setHomeEditorialField('side_block_author', option.dataset.homeSideAuthor, true);
                        finishPublishedSource(sideArticleSelect);
                      }
                      function applyHomeComplementArticle() {
                        if (!complementArticleSelect) return;
                        var option = complementArticleSelect.options[complementArticleSelect.selectedIndex];
                        if (!option || !option.value) return;
                        setHomeEditorialField('complementary_label', option.dataset.homeComplementLabel, true);
                        setHomeEditorialField('complementary_title', option.dataset.homeComplementTitle, true);
                        setHomeEditorialField('complementary_text', option.dataset.homeComplementText, true);
                        setHomeEditorialField('complementary_image_url', option.dataset.homeComplementImageUrl, true);
                        setHomeEditorialField('complementary_link_url', option.dataset.homeComplementLinkUrl, true);
                        finishPublishedSource(complementArticleSelect);
                      }
                      function setHomeHighlightField(card, name, value) {
                        var field = card.querySelector('[data-home-highlight-field="' + name + '"]');
                        setFieldValue(field, value);
                      }
                      function applyHomeHighlightArticle(select) {
                        var card = select.closest('[data-home-highlight-card]');
                        var option = select.options[select.selectedIndex];
                        if (!card || !option || !option.value) return;
                        setHomeHighlightField(card, 'label', option.dataset.homeHighlightLabel);
                        setHomeHighlightField(card, 'title', option.dataset.homeHighlightTitle);
                        setHomeHighlightField(card, 'subtitle', option.dataset.homeHighlightSubtitle);
                        setHomeHighlightField(card, 'image_url', option.dataset.homeHighlightImageUrl);
                        setHomeHighlightField(card, 'link_url', option.dataset.homeHighlightLinkUrl);
                        finishPublishedSource(select);
                      }
                      function setHomeFinalField(card, name, value) {
                        var field = card.querySelector('[data-home-final-field="' + name + '"]');
                        setFieldValue(field, value);
                      }
                      function applyHomeFinalArticle(select) {
                        var card = select.closest('[data-home-final-card]');
                        var option = select.options[select.selectedIndex];
                        if (!card || !option || !option.value) return;
                        setHomeFinalField(card, 'title', option.dataset.homeFinalTitle);
                        setHomeFinalField(card, 'subtitle', option.dataset.homeFinalSubtitle);
                        setHomeFinalField(card, 'image_url', option.dataset.homeFinalImageUrl);
                        setHomeFinalField(card, 'link_url', option.dataset.homeFinalLinkUrl);
                        finishPublishedSource(select);
                      }
                      if (headlineArticleSelect) headlineArticleSelect.addEventListener('change', applyHomeHeadlineArticle);
                      if (sideArticleSelect) sideArticleSelect.addEventListener('change', applyHomeSideArticle);
                      if (complementArticleSelect) complementArticleSelect.addEventListener('change', applyHomeComplementArticle);
                      highlightArticleSelects.forEach(function (select) {
                        select.addEventListener('change', function () {
                          applyHomeHighlightArticle(select);
                        });
                      });
                      finalArticleSelects.forEach(function (select) {
                        select.addEventListener('change', function () {
                          applyHomeFinalArticle(select);
                        });
                      });
                    })();
                  `
                }}
              />
            </div>
        </section>
      </div>
    </main>
  );
}
