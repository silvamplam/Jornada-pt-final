import Link from "next/link";
import PublicCompetitionNavigation from "@/components/public/PublicCompetitionNavigation";
import { publicEditorialStyles } from "@/components/public/publicEditorialStyles";
import { readPublicCompetitionMenu } from "@/lib/public-competition-menu";
import {
  LIGA_PORTUGAL_PUBLIC_ENTRY_SLUG,
  selectPublicCompetitionEntryMatchday
} from "@/lib/public-competition-matchday-entry";
import { fetchSupabaseAdminTable } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SeasonLandingPageProps = {
  params: Promise<{
    competitionSlug: string;
    seasonLabel: string;
  }>;
};

type CompetitionRow = {
  id: string;
  name: string | null;
  slug: string | null;
  logo_url: string | null;
};

type SeasonRow = {
  id: string;
  label: string | null;
  competition_id: string | null;
};

type MatchdayRow = {
  id: string;
  number: number | null;
  season_id: string | null;
};

type MatchRow = {
  id: string;
  matchday_id: string | null;
  status: string | null;
  kickoff_at: string | null;
  rollover_excluded?: boolean | null;
};

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function seasonLabelToUrlSegment(label: string | null | undefined) {
  return encodeURIComponent((cleanText(label) || "epoca").replace(/\//g, "-"));
}

async function readSeasonContext(competitionSlug: string, seasonLabel: string) {
  const competitionRows = await fetchSupabaseAdminTable<CompetitionRow>(
    `competitions?select=id,name,slug,logo_url&slug=eq.${encodeURIComponent(competitionSlug)}&limit=1`
  ).catch(() => []);
  const competition = competitionRows[0] ?? null;

  if (!competition?.id) {
    return null;
  }

  const seasons = await fetchSupabaseAdminTable<SeasonRow>(
    `seasons?select=id,label,competition_id&competition_id=eq.${encodeURIComponent(competition.id)}&order=label.desc&limit=100`
  ).catch(() => []);
  const season = seasons.find((item) => seasonLabelToUrlSegment(item.label) === seasonLabel) ?? null;

  if (!season?.id) {
    return null;
  }

  const matchdays = await fetchSupabaseAdminTable<MatchdayRow>(
    `matchdays?select=id,number,season_id&season_id=eq.${encodeURIComponent(season.id)}&order=number.asc&limit=200`
  ).catch(() => []);

  let matchday: MatchdayRow | null = matchdays[0] ?? null;

  if (competition.slug === LIGA_PORTUGAL_PUBLIC_ENTRY_SLUG && matchdays.length > 0) {
    const matches = await fetchSupabaseAdminTable<MatchRow>(
      `matches?select=id,matchday_id,status,kickoff_at,rollover_excluded&season_id=eq.${encodeURIComponent(season.id)}&limit=1000`
    ).catch(async () => {
      const fallbackRows = await fetchSupabaseAdminTable<Omit<MatchRow, "rollover_excluded">>(
        `matches?select=id,matchday_id,status,kickoff_at&season_id=eq.${encodeURIComponent(season.id)}&limit=1000`
      ).catch(() => []);

      return fallbackRows.map((row) => ({ ...row, rollover_excluded: false }));
    });

    matchday = selectPublicCompetitionEntryMatchday(matchdays, matches);
  }

  return {
    competition,
    season,
    matchday
  };
}

export default async function PublicSeasonLandingPage({ params }: SeasonLandingPageProps) {
  const { competitionSlug, seasonLabel } = await params;
  const [context, competitionMenu] = await Promise.all([
    readSeasonContext(competitionSlug, seasonLabel),
    readPublicCompetitionMenu()
  ]);

  if (context?.matchday?.number) {
    redirect(`/competicoes/${competitionSlug}/${seasonLabel}/jornadas/${context.matchday.number}`);
  }

  const competitionName = cleanText(context?.competition.name) || competitionSlug;
  const activeCompetition = {
    label: competitionName,
    slug: competitionSlug,
    href: `/competicoes/${competitionSlug}/${seasonLabel}`,
    logoUrl: context?.competition.logo_url ?? null
  };
  const publicCompetitionMenu = competitionMenu.some((item) => item.slug === competitionSlug)
    ? competitionMenu.map((item) => (item.slug === competitionSlug ? activeCompetition : item))
    : [activeCompetition, ...competitionMenu];

  return (
    <main className="public-matchday-shell">
      <style>{`${publicEditorialStyles}
        .public-season-empty {
          max-width: 980px;
          margin: 0 auto;
          padding: 54px 24px 72px;
        }

        .public-season-empty p {
          margin: 0 0 10px;
          color: #6a7686;
          font-size: 13px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .public-season-empty h1 {
          margin: 0;
          color: #10151b;
          font-size: 34px;
          line-height: 1.05;
        }

        .public-season-empty strong {
          display: block;
          margin-top: 18px;
          color: #3b4654;
          font-size: 16px;
          line-height: 1.45;
        }
      `}</style>
      <div className="public-top-stack">
        <header className="public-site-topbar" aria-label="Topo do Jornada.pt">
          <Link className="public-site-brand" href="/">
            Jornada<span>.pt</span>
          </Link>
          <PublicCompetitionNavigation
            competitions={publicCompetitionMenu}
            activeCompetitionSlug={competitionSlug}
          />
          <div className="public-site-actions" aria-label="Acoes">
            <span className="public-site-search" aria-label="Pesquisar">Pesquisar</span>
            <Link href="/admin/gestor">Entrar</Link>
          </div>
        </header>
      </div>
      <section className="public-season-empty" aria-label="Epoca sem jornadas">
        <p>{competitionName} / {cleanText(context?.season.label) || seasonLabel.replace(/-/g, "/")}</p>
        <h1>Sem jornadas disponiveis</h1>
        <strong>Esta epoca ja existe no Jornada.pt, mas ainda nao tem jornadas publicas para abrir.</strong>
      </section>
    </main>
  );
}
