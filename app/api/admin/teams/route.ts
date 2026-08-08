import { adminRelativeRedirect } from "@/lib/admin-relative-redirect";
import { fetchSupabaseAdminTable, getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function redirectTo(_request: Request, path: string) {
  return adminRelativeRedirect(path);
}

type TeamAssetRow = {
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

type ExistingTeam = {
  id: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
};

function isValidLogoUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function cleanAssetCell(value: string | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/^\|+|\|+$/g, "")
    .trim()
    .replace(/^`+|`+$/g, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .trim();

  return cleaned ? cleaned : null;
}

function firstTextValue(formData: FormData, names: string[]) {
  for (const name of names) {
    const value = cleanText(formData.get(name));

    if (value) {
      return value;
    }
  }

  return null;
}

function isTruthyFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
}

function shouldReplaceExistingLogos(formData: FormData) {
  return (
    isTruthyFormValue(formData.get("replace_existing_logos")) ||
    isTruthyFormValue(formData.get("replaceExistingLogos")) ||
    isTruthyFormValue(formData.get("overwrite_logos"))
  );
}

function parseTeamAssetRows(raw: string | null) {
  const rows: TeamAssetRow[] = [];
  const seenSlugs = new Set<string>();
  let invalid = 0;

  for (const line of (raw ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const parts = trimmed.includes(";")
      ? trimmed.split(";")
      : trimmed.includes("|")
        ? trimmed.split("|").map((part) => part.trim()).filter(Boolean)
        : trimmed.split(/\t|,/);
    const slug = slugify(cleanAssetCell(parts[0]) ?? "");
    const logoUrl = cleanAssetCell(parts[1]) || null;
    const primaryColor = cleanAssetCell(parts[2]) || null;

    if (
      !slug ||
      slug === "slug" ||
      (!logoUrl && !primaryColor) ||
      (logoUrl && !isValidLogoUrl(logoUrl)) ||
      seenSlugs.has(slug)
    ) {
      invalid += 1;
      continue;
    }

    seenSlugs.add(slug);
    rows.push({ slug, logoUrl, primaryColor });
  }

  return { rows, invalid };
}

async function updateTeamAssets(request: Request, formData: FormData) {
  const rawPayload = firstTextValue(formData, ["team_assets", "teams_payload", "logos_payload", "club_logos"]);
  const { rows, invalid } = parseTeamAssetRows(rawPayload);
  const replaceExistingLogos = shouldReplaceExistingLogos(formData);
  const replaceFlag = replaceExistingLogos ? "1" : "0";

  if (rows.length === 0) {
    return redirectTo(
      request,
      `/admin/clubes?assets_updated=0&assets_existing=0&assets_replaced=0&assets_missing=0&assets_invalid=${invalid}&assets_found=0&assets_errors=0&assets_replace=${replaceFlag}`
    );
  }

  const slugFilter = rows.map((row) => encodeURIComponent(row.slug)).join(",");
  const existingTeams = await fetchSupabaseAdminTable<ExistingTeam>(
    `teams?select=id,slug,logo_url,primary_color&slug=in.(${slugFilter})&limit=1000`
  );
  const teamsBySlug = new Map(existingTeams.map((team) => [team.slug, team]));
  let updated = 0;
  let alreadyHadLogo = 0;
  let replacedLogos = 0;
  let notFound = 0;
  let found = 0;
  let errors = 0;

  for (const row of rows) {
    const team = teamsBySlug.get(row.slug);

    if (!team) {
      notFound += 1;
      continue;
    }

    found += 1;
    const hasValidExistingLogo = isValidLogoUrl(team.logo_url);

    if (hasValidExistingLogo && !replaceExistingLogos) {
      alreadyHadLogo += 1;
      continue;
    }

    const payload: Record<string, string> = {};

    if (isValidLogoUrl(row.logoUrl) && (replaceExistingLogos || row.logoUrl !== team.logo_url)) {
      payload.logo_url = row.logoUrl;
    }

    if (row.primaryColor && row.primaryColor !== team.primary_color) {
      payload.primary_color = row.primaryColor;
    }

    if (Object.keys(payload).length === 0) {
      continue;
    }

    try {
      await writeSupabaseAdmin(`teams?slug=eq.${encodeURIComponent(team.slug)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      if (hasValidExistingLogo && replaceExistingLogos && payload.logo_url) {
        replacedLogos += 1;
      } else {
        updated += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return redirectTo(
    request,
    `/admin/clubes?assets_updated=${updated}&assets_existing=${alreadyHadLogo}&assets_replaced=${replacedLogos}&assets_missing=${notFound}&assets_invalid=${invalid}&assets_found=${found}&assets_errors=${errors}&assets_replace=${replaceFlag}`
  );
}

export async function POST(request: Request) {
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/clubes?error=missing-service");
  }

  const formData = await request.formData();
  const actionType = cleanText(formData.get("action_type"));

  if (actionType === "bulk_assets") {
    try {
      return await updateTeamAssets(request, formData);
    } catch {
      return redirectTo(request, "/admin/clubes?error=save");
    }
  }

  const name = cleanText(formData.get("name"));
  const shortName = cleanText(formData.get("short_name"))?.toUpperCase();
  const slug = cleanText(formData.get("slug")) ?? (name ? slugify(name) : null);

  if (!name || !shortName || !slug) {
    return redirectTo(request, "/admin/clubes?error=missing-fields");
  }

  try {
    await writeSupabaseAdmin("teams", {
      method: "POST",
      body: JSON.stringify({
        name,
        short_name: shortName,
        slug,
        country: cleanText(formData.get("country")),
        logo_url: cleanText(formData.get("logo_url")),
        primary_color: cleanText(formData.get("primary_color"))
      })
    });
  } catch {
    return redirectTo(request, "/admin/clubes?error=save");
  }

  return redirectTo(request, "/admin/clubes?created=1");
}
