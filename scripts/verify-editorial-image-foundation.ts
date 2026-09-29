// Invoked only by the disposable PostgreSQL rollout harness, between migrations.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { freezeEditorialImage, type ImageFreezeTransport, type ImageDecision } from "../lib/editorial-image-freeze.server";
import { createEditorialArticleService, type EditorialArticleInput, type EditorialArticleServiceTransport } from "../lib/editorial-article-service-internal";

async function main() {
  const connection = process.argv[2], url = new URL(connection);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/image_freeze_test") throw new Error("local-image_freeze_test-only");
  const quote = (value: unknown) => value === null ? "null" : `'${String(value).replace(/'/g, "''")}'`;
  function sql(command: string) {
    return execFileSync(process.env.PSQL_BIN || "psql", ["-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", connection], {
      input: `set role service_role;\n${command}`, encoding: "utf8", windowsHide: true,
    }).trim();
  }
  function rows<T>(command: string): T[] {
    return JSON.parse(sql(`with result as (${command}) select coalesce(json_agg(result),'[]'::json) from result;`));
  }
  const guardCount = () => sql("select count(*) from pg_trigger where tgrelid='public.editorial_articles'::regclass and tgname='editorial_require_local_image';");
  assert.equal(guardCount(), "0");
  const origin = "https://foundation.example", source = "https://source.example/a.jpg";
  process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
  const objects = new Map<string, Uint8Array>();
  let downloads = 0, reads = 0;
  let sourceBytes = await sharp({ create: { width: 1400, height: 900, channels: 3, background: "red" } }).jpeg().toBuffer();
  const transport: ImageFreezeTransport = {
    origin,
    async claim(key, sourceUrl) {
      type Row = { decision_key: string; source_url: string; state: ImageDecision["state"]; image: ImageDecision["image"] };
      const inserted = rows<Row>(`insert into editorial_image_decisions(decision_key,source_url) values(${quote(key)},${quote(sourceUrl)}) on conflict do nothing returning *`);
      const row = inserted[0] ?? rows<Row>(`select * from editorial_image_decisions where decision_key=${quote(key)}`)[0];
      return { owned: inserted.length === 1, decision: { key: row.decision_key, sourceUrl: row.source_url, state: row.state, image: row.image } };
    },
    async bind(key, image) { sql(`update editorial_image_decisions set state='candidate',image=${quote(JSON.stringify(image))}::jsonb where decision_key=${quote(key)};`); },
    async finish(key, image) {
      sql(`insert into editorial_image_assets(public_url,storage_path,sha256,byte_size,content_type) values(${quote(image.publicUrl)},${quote(image.path)},${quote(image.sha256)},${image.byteSize},${quote(image.contentType)}) on conflict do nothing;
        update editorial_image_decisions set state='ready' where decision_key=${quote(key)};`);
    },
    async download() { downloads++; return { bytes: sourceBytes, contentType: "image/jpeg" }; },
    async originalExists(path) { return objects.has(path); },
    async writeOriginal(image, bytes) {
      if (objects.has(image.path)) return "exists";
      objects.set(image.path, bytes);
      sql(`insert into storage.objects(bucket_id,name) values('editorial-images',${quote(image.path)});`);
      return "created";
    },
    previews: {
      async exists(path) { return objects.has(path); },
      async readOriginal(path) { reads++; return objects.get(path)!; },
      async writePreview(path, bytes) { if (objects.has(path)) return "exists"; objects.set(path, bytes); return "created"; },
      async list() { return []; },
    },
  };
  const A = await freezeEditorialImage("foundation:A", source, transport);
  sourceBytes = await sharp({ create: { width: 1400, height: 900, channels: 3, background: "blue" } }).jpeg().toBuffer();
  assert.deepEqual(await freezeEditorialImage("foundation:A", source, transport), A);
  assert.equal(downloads, 1); assert.equal(objects.size, 5); assert.equal(reads, 0);
  const B = await freezeEditorialImage("foundation:B", source, transport);
  assert.notEqual(A.sha256, B.sha256); assert.notEqual(A.path, B.path);
  const dossierImageId = randomUUID();
  sql(`insert into newsroom_editorial_dossier_images(id,frozen_url) values(${quote(dossierImageId)},${quote(source)});
    select editorial_confirm_dossier_image_v1(${quote(dossierImageId)},'foundation:A');
    select editorial_confirm_dossier_image_v1(${quote(dossierImageId)},'foundation:A');`);
  assert.deepEqual(rows(`select frozen_url,source_url from newsroom_editorial_dossier_images where id=${quote(dossierImageId)}`), [{ frozen_url: A.publicUrl, source_url: source }]);

  let writes = 0;
  const writer: EditorialArticleServiceTransport = {
    async findArticlesBySlug(slug) { return rows(`select id from editorial_articles where slug=${quote(slug)}`); },
    async readArticleStatus(id) { return rows<Awaited<ReturnType<EditorialArticleServiceTransport["readArticleStatus"]>>>(`select id,status,image_url,slug,matchday_id from editorial_articles where id=${quote(id)}`)[0] ?? null; },
    async readCompetition() { return null; }, async readSeason() { return null; }, async readMatchday() { return null; },
    async requireImage(imageUrl) {
      // Published legacy preserve is handled by the canonical service; this
      // fixture models local receipt lookup for newly selected references.
      if (imageUrl?.startsWith(origin)) assert.equal(rows(`select public_url from editorial_image_assets where public_url=${quote(imageUrl)}`).length, 1);
    },
    async insertArticle(payload) {
      writes++;
      return rows(`insert into editorial_articles(${Object.keys(payload).join(",")}) values(${Object.values(payload).map(quote).join(",")}) returning id,slug`);
    },
    async updateArticle(id, payload) {
      writes++;
      sql(`update editorial_articles set ${Object.entries(payload).map(([key, value]) => `${key}=${quote(value)}`).join(",")} where id=${quote(id)};`);
    },
    async placePublishedArticleInitially() {}, randomUuid: randomUUID, now: () => new Date().toISOString(),
  };
  const service = createEditorialArticleService(writer);
  const input: EditorialArticleInput = { label: "Label", title: "Foundation article", subtitle: "Subtitle", body: "Body", slug: "foundation-article", image_url: source,
    image_caption: null, author: "Editor", published_at: null, competition_id: null, season_id: null, matchday_id: null };
  const options = { action: "publish" as const, initialPlacement: "none" as const };
  await assert.rejects(service.createArticle(input, options), /image-materialization-required/);
  assert.equal(writes, 0);
  const article = await service.createArticle({ ...input, image_url: A.publicUrl }, options);
  await service.updateArticle(article.articleId, { ...input, image_url: B.publicUrl }, options);
  assert.equal(rows<{ image_url: string }>(`select image_url from editorial_articles where id=${quote(article.articleId)}`)[0].image_url, B.publicUrl);
  await assert.rejects(service.updateArticle(article.articleId, input, options), /image-materialization-required/);
  const legacyId = "11111111-1111-4111-8111-111111111111";
  await service.updateArticle(legacyId, { ...input, slug: "slug" }, options);
  const beforeRejected = writes;
  await assert.rejects(service.updateArticle(legacyId, { ...input, image_url: "https://other.example/b.jpg" }, options), /image-materialization-required/);
  assert.equal(writes, beforeRejected);

  // The promotion RPC and image-only side-effect guards are already complete
  // in FOUNDATION, before the SQL publication guard is installed.
  const promotionId = "66666666-6666-4666-8666-666666666666";
  const before = sql(`select to_jsonb(a)-'image_url' from editorial_articles a where id=${quote(promotionId)};`);
  sql("truncate side_effects;");
  assert.equal(sql(`select editorial_promote_image_v1(${quote(promotionId)},${quote(source)},${quote(A.publicUrl)},${quote(A.sha256)},'Local reviewer');`), "promoted");
  assert.equal(sql(`select to_jsonb(a)-'image_url' from editorial_articles a where id=${quote(promotionId)};`), before);
  assert.equal(sql("select count(*) from side_effects;"), "0");
  assert.equal(sql(`select editorial_promote_image_v1(${quote(promotionId)},${quote(source)},${quote(A.publicUrl)},${quote(A.sha256)},'Local reviewer');`), "reused");
  assert.equal(guardCount(), "0");
  console.log("PASS B: new application + FOUNDATION; real freeze/4 previews/A-B retry, service_role receipts/confirmation, canonical NEW/UPDATE writers, app external guards, preserve, image-only promotion; SQL guard absent");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
