import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";
import { fetchSupabaseAdminTable, getSupabaseServiceConfig, writeSupabaseAdmin } from "@/lib/supabase";
import { createImageFreezeStorage } from "@/lib/editorial-image-freeze-storage.server";
import { safeEditorialSourceUrl } from "@/lib/editorial-image-download.server";
import { prepareProductionImage, type ProductionImageRow } from "@/lib/editorial-production-image-preparation.server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  if (!await verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return NextResponse.json({ ok: false }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ ok: false }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 12000) return NextResponse.json({ ok: false }, { status: 413 });
  const payload = await request.json().catch(() => null);
  const preparation = payload?.prepare === true;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!payload || (preparation
    ? !uuid.test(payload.dossierId ?? "") || !uuid.test(payload.dossierImageId ?? "")
      || payload.confirm !== false || (payload.revisionKey !== undefined && !uuid.test(payload.revisionKey))
    : typeof payload.decisionKey !== "string" || !/^[a-zA-Z0-9:_.-]{1,200}$/.test(payload.decisionKey))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const config = getSupabaseServiceConfig();
  if (!config) return NextResponse.json({ ok: false }, { status: 503 });
  try {
    if (preparation) {
      const image = await prepareProductionImage({ dossierId: payload.dossierId, imageId: payload.dossierImageId,
        revisionKey: payload.revisionKey }, {
        origin: config.url,
        async readImage(id) {
          return (await fetchSupabaseAdminTable<ProductionImageRow>(
            `newsroom_editorial_dossier_images?select=id,dossier_id,frozen_url,source_url&id=eq.${id}&limit=1`))[0] ?? null;
        },
        async latestDecision(prefix) {
          return (await fetchSupabaseAdminTable<{ decision_key: string }>(
            `editorial_image_decisions?select=decision_key&decision_key=like.${encodeURIComponent(prefix)}*&order=created_at.desc,decision_key.desc&limit=1`))[0]?.decision_key ?? null;
        },
        freeze: (key, source) => createImageFreezeStorage(config).freeze(key, source),
        registerLocal: (url) => createImageFreezeStorage(config).registerLocal(url),
      });
      return NextResponse.json({ ok: true, image }, { headers: { "Cache-Control": "private, no-store" } });
    }
    let sourceUrl = typeof payload.sourceUrl === "string" ? payload.sourceUrl : "";
    if (payload.dossierImageId) {
      if (!/^[a-f0-9-]{36}$/.test(payload.dossierImageId)) throw new Error("image-invalid-id");
      const [row] = await fetchSupabaseAdminTable<{ frozen_url: string; source_url: string | null }>(
        `newsroom_editorial_dossier_images?select=frozen_url,source_url&id=eq.${payload.dossierImageId}&limit=1`);
      if (!row) throw new Error("image-not-found");
      sourceUrl = row.source_url ?? row.frozen_url;
    }
    safeEditorialSourceUrl(sourceUrl);
    const image = await createImageFreezeStorage(config).freeze(payload.decisionKey, sourceUrl);
    if (payload.confirm === true && payload.dossierImageId) {
      await writeSupabaseAdmin("rpc/editorial_confirm_dossier_image_v1", { method: "POST", body: JSON.stringify({ p_image_id: payload.dossierImageId, p_decision_key: payload.decisionKey }) });
    }
    return NextResponse.json({ ok: true, image }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message.split(":")[0] : "image-freeze-failed";
    return NextResponse.json({ ok: false, error: detail }, { status: 422 });
  }
}
