-- Source Package manifest v5 for Mesa workspace contract v2.
-- Forward-only: preserves the historical v2/v4 predicate verbatim and adds
-- a closed validator for the v5 structure emitted by the real package writer.
begin;

do $preflight$
begin
  if to_regclass('public.newsroom_editorial_source_packages') is null then
    raise exception 'source-package-manifest-v5-table-missing';
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.newsroom_editorial_source_packages'::regclass
      and conname = 'newsroom_editorial_source_packages_manifest_check'
      and contype = 'c'
  ) then
    raise exception 'source-package-manifest-v5-previous-check-missing';
  end if;
end;
$preflight$;

create function public.newsroom_editorial_source_package_manifest_v5_valid(
  p_id uuid,
  p_package_year text,
  p_package_month text,
  p_manifest jsonb
)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $function$
declare
  v_entries jsonb;
  v_outputs jsonb;
  v_entry jsonb;
  v_output jsonb;
  v_plan jsonb;
  v_item jsonb;
  v_ordinality bigint;
  v_selected_count integer;
  v_article_count integer;
  v_prepared_count integer;
  v_failed_count integer;
  v_image_count integer;
  v_actual_prepared integer := 0;
  v_actual_failed integer := 0;
  v_position integer;
  v_article_position integer;
  v_output_id text;
  v_dossier_id text;
  v_first_dossier_id text;
  v_provenance_source_id text;
  v_newsroom_snapshot_id text;
  v_published_context_id text;
  v_output_ids text[] := '{}'::text[];
  v_provenance_source_ids text[] := '{}'::text[];
  v_snapshot_ids text[] := '{}'::text[];
  v_published_context_ids text[] := '{}'::text[];
  v_uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if pg_catalog.jsonb_typeof(p_manifest) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_manifest -> 'version') is distinct from 'number'
    or p_manifest ->> 'version' is distinct from '5'
    or pg_catalog.jsonb_typeof(p_manifest -> 'provenanceContract') is distinct from 'string'
    or p_manifest ->> 'provenanceContract' is distinct from 'mesa-v2'
    or pg_catalog.jsonb_typeof(p_manifest -> 'packageId') is distinct from 'string'
    or p_manifest ->> 'packageId' is distinct from p_id::text
    or pg_catalog.jsonb_typeof(p_manifest -> 'year') is distinct from 'string'
    or p_manifest ->> 'year' is distinct from p_package_year
    or pg_catalog.jsonb_typeof(p_manifest -> 'month') is distinct from 'string'
    or p_manifest ->> 'month' is distinct from p_package_month
    or pg_catalog.jsonb_typeof(p_manifest -> 'createdAt') is distinct from 'string'
    or nullif(pg_catalog.btrim(p_manifest ->> 'createdAt'), '') is null
    or pg_catalog.jsonb_typeof(p_manifest -> 'markdownFileName') is distinct from 'string'
    or nullif(pg_catalog.btrim(p_manifest ->> 'markdownFileName'), '') is null
    or pg_catalog.length(p_manifest ->> 'markdownFileName') > 240
    or p_manifest ->> 'markdownFileName' !~ '\.md$'
    or pg_catalog.jsonb_typeof(p_manifest -> 'genre') is distinct from 'string'
    or p_manifest ->> 'genre' not in ('news', 'brief', 'analysis', 'editorial')
    or pg_catalog.jsonb_typeof(p_manifest -> 'genreLabel') is distinct from 'string'
    or nullif(pg_catalog.btrim(p_manifest ->> 'genreLabel'), '') is null
    or pg_catalog.length(p_manifest ->> 'genreLabel') > 80
    or not (p_manifest ? 'suggestedTitle')
    or not coalesce(
      pg_catalog.jsonb_typeof(p_manifest -> 'suggestedTitle') in ('string', 'null'),
      false
    )
    or (
      pg_catalog.jsonb_typeof(p_manifest -> 'suggestedTitle') = 'string'
      and (
        nullif(pg_catalog.btrim(p_manifest ->> 'suggestedTitle'), '') is null
        or pg_catalog.length(p_manifest ->> 'suggestedTitle') > 240
      )
    )
    or not (p_manifest ? 'additionalInstructions')
    or not coalesce(
      pg_catalog.jsonb_typeof(p_manifest -> 'additionalInstructions') in ('string', 'null'),
      false
    )
    or (
      pg_catalog.jsonb_typeof(p_manifest -> 'additionalInstructions') = 'string'
      and (
        nullif(pg_catalog.btrim(p_manifest ->> 'additionalInstructions'), '') is null
        or pg_catalog.length(p_manifest ->> 'additionalInstructions') > 4000
      )
    )
    or pg_catalog.jsonb_typeof(p_manifest -> 'selectedCount') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_manifest -> 'articleCount') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_manifest -> 'preparedCount') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_manifest -> 'failedCount') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_manifest -> 'imageCount') is distinct from 'number'
    or not (p_manifest ? 'localDirectory')
    or not coalesce(
      pg_catalog.jsonb_typeof(p_manifest -> 'localDirectory') in ('string', 'null'),
      false
    )
    or (
      pg_catalog.jsonb_typeof(p_manifest -> 'localDirectory') = 'string'
      and nullif(pg_catalog.btrim(p_manifest ->> 'localDirectory'), '') is null
    )
    or pg_catalog.jsonb_typeof(p_manifest -> 'entries') is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_manifest -> 'outputs') is distinct from 'array'
  then
    return false;
  end if;

  perform (p_manifest ->> 'createdAt')::timestamptz;
  v_selected_count := (p_manifest ->> 'selectedCount')::integer;
  v_article_count := (p_manifest ->> 'articleCount')::integer;
  v_prepared_count := (p_manifest ->> 'preparedCount')::integer;
  v_failed_count := (p_manifest ->> 'failedCount')::integer;
  v_image_count := (p_manifest ->> 'imageCount')::integer;
  v_entries := p_manifest -> 'entries';
  v_outputs := p_manifest -> 'outputs';

  if pg_catalog.jsonb_array_length(v_entries) not between 1 and 20
    or pg_catalog.jsonb_array_length(v_outputs) not between 1 and 30
    or v_selected_count is distinct from pg_catalog.jsonb_array_length(v_entries)
    or v_article_count is distinct from pg_catalog.jsonb_array_length(v_outputs)
    or v_prepared_count < 0
    or v_failed_count < 0
    or v_image_count < 0
    or v_prepared_count + v_failed_count <> v_selected_count
  then
    return false;
  end if;

  for v_entry, v_ordinality in
    select item.value, item.ordinality
    from pg_catalog.jsonb_array_elements(v_entries)
      with ordinality as item(value, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_entry) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_entry -> 'position') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_entry -> 'articlePosition') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_entry -> 'newsroomArticleId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_entry -> 'newsroomSnapshotId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_entry -> 'provenanceSourceId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_entry -> 'status') is distinct from 'string'
      or v_entry ->> 'status' not in ('prepared', 'failed')
      or not (v_entry ? 'sourceCode')
      or not coalesce(
        pg_catalog.jsonb_typeof(v_entry -> 'sourceCode') in ('string', 'null'),
        false
      )
      or not (v_entry ? 'sourceName')
      or not coalesce(
        pg_catalog.jsonb_typeof(v_entry -> 'sourceName') in ('string', 'null'),
        false
      )
      or not (v_entry ? 'title')
      or not coalesce(
        pg_catalog.jsonb_typeof(v_entry -> 'title') in ('string', 'null'),
        false
      )
      or not (v_entry ? 'errorCode')
      or not coalesce(
        pg_catalog.jsonb_typeof(v_entry -> 'errorCode') in ('string', 'null'),
        false
      )
      or not (v_entry ? 'imageUrl')
      or not coalesce(
        pg_catalog.jsonb_typeof(v_entry -> 'imageUrl') in ('string', 'null'),
        false
      )
      or not (v_entry ? 'publishedAt')
      or not coalesce(
        pg_catalog.jsonb_typeof(v_entry -> 'publishedAt') in ('string', 'null'),
        false
      )
      or not (v_entry ? 'publishedAtPrecision')
      or not coalesce(
        pg_catalog.jsonb_typeof(v_entry -> 'publishedAtPrecision') in ('string', 'null'),
        false
      )
      or (
        v_entry ? 'imagePreferred'
        and pg_catalog.jsonb_typeof(v_entry -> 'imagePreferred') is distinct from 'boolean'
      )
    then
      return false;
    end if;

    v_position := (v_entry ->> 'position')::integer;
    v_article_position := (v_entry ->> 'articlePosition')::integer;
    v_provenance_source_id := pg_catalog.lower(v_entry ->> 'provenanceSourceId');
    v_newsroom_snapshot_id := pg_catalog.lower(v_entry ->> 'newsroomSnapshotId');
    if v_position is distinct from v_ordinality::integer
      or v_article_position is distinct from 1
      or pg_catalog.lower(v_entry ->> 'newsroomArticleId') !~ v_uuid_pattern
      or v_newsroom_snapshot_id !~ v_uuid_pattern
      or v_provenance_source_id !~ v_uuid_pattern
      or v_provenance_source_id = any(v_provenance_source_ids)
      or v_newsroom_snapshot_id = any(v_snapshot_ids)
    then
      return false;
    end if;
    v_provenance_source_ids := v_provenance_source_ids || v_provenance_source_id;
    v_snapshot_ids := v_snapshot_ids || v_newsroom_snapshot_id;

    if v_entry ->> 'status' = 'prepared' then
      v_actual_prepared := v_actual_prepared + 1;
      if pg_catalog.jsonb_typeof(v_entry -> 'sourceCode') is distinct from 'string'
        or nullif(pg_catalog.btrim(v_entry ->> 'sourceCode'), '') is null
        or pg_catalog.jsonb_typeof(v_entry -> 'sourceName') is distinct from 'string'
        or nullif(pg_catalog.btrim(v_entry ->> 'sourceName'), '') is null
        or pg_catalog.jsonb_typeof(v_entry -> 'title') is distinct from 'string'
        or nullif(pg_catalog.btrim(v_entry ->> 'title'), '') is null
        or pg_catalog.jsonb_typeof(v_entry -> 'errorCode') is distinct from 'null'
        or not coalesce(
          pg_catalog.jsonb_typeof(v_entry -> 'publishedAtPrecision') in ('null', 'string'),
          false
        )
        or (
          pg_catalog.jsonb_typeof(v_entry -> 'publishedAtPrecision') = 'string'
          and v_entry ->> 'publishedAtPrecision' not in ('date', 'instant')
        )
      then
        return false;
      end if;
    else
      v_actual_failed := v_actual_failed + 1;
      if pg_catalog.jsonb_typeof(v_entry -> 'errorCode') is distinct from 'string'
        or v_entry ->> 'errorCode' not in (
          'source_not_found',
          'snapshot_not_found',
          'snapshot_mismatch',
          'source_body_unavailable'
        )
      then
        return false;
      end if;
    end if;
  end loop;

  if v_actual_prepared is distinct from v_prepared_count
    or v_actual_failed is distinct from v_failed_count
  then
    return false;
  end if;

  for v_output, v_ordinality in
    select item.value, item.ordinality
    from pg_catalog.jsonb_array_elements(v_outputs)
      with ordinality as item(value, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_output) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_output -> 'position') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_output -> 'outputId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_output -> 'sourceArticlePosition') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_output -> 'focus') is distinct from 'string'
      or nullif(pg_catalog.btrim(v_output ->> 'focus'), '') is null
      or pg_catalog.length(v_output ->> 'focus') > 240
      or not (v_output ? 'imageNewsroomArticleId')
      or not coalesce(
        pg_catalog.jsonb_typeof(v_output -> 'imageNewsroomArticleId') in ('string', 'null'),
        false
      )
      or pg_catalog.jsonb_typeof(v_output -> 'articlePlan') is distinct from 'object'
    then
      return false;
    end if;

    v_position := (v_output ->> 'position')::integer;
    v_article_position := (v_output ->> 'sourceArticlePosition')::integer;
    v_output_id := pg_catalog.lower(v_output ->> 'outputId');
    v_plan := v_output -> 'articlePlan';
    v_dossier_id := pg_catalog.lower(v_plan ->> 'dossierId');

    if v_position is distinct from v_ordinality::integer
      or v_output_id !~ v_uuid_pattern
      or v_output_id = any(v_output_ids)
      or v_article_position is distinct from 1
      or not exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_entries) as entry_item(value)
        where (entry_item.value ->> 'articlePosition')::integer = v_article_position
      )
      or pg_catalog.jsonb_typeof(v_plan -> 'dossierId') is distinct from 'string'
      or v_dossier_id !~ v_uuid_pattern
      or pg_catalog.jsonb_typeof(v_plan -> 'articlePlanId') is distinct from 'string'
      or pg_catalog.lower(v_plan ->> 'articlePlanId') is distinct from v_output_id
      or pg_catalog.jsonb_typeof(v_plan -> 'workingTitle') is distinct from 'string'
      or nullif(pg_catalog.btrim(v_plan ->> 'workingTitle'), '') is null
      or pg_catalog.length(v_plan ->> 'workingTitle') > 180
      or pg_catalog.jsonb_typeof(v_plan -> 'articleKind') is distinct from 'string'
      or v_plan ->> 'articleKind' not in ('news', 'analysis', 'preview', 'summary')
      or pg_catalog.jsonb_typeof(v_plan -> 'articleKindLabel') is distinct from 'string'
      or nullif(pg_catalog.btrim(v_plan ->> 'articleKindLabel'), '') is null
      or pg_catalog.length(v_plan ->> 'articleKindLabel') > 80
      or pg_catalog.jsonb_typeof(v_plan -> 'lengthMode') is distinct from 'string'
      or v_plan ->> 'lengthMode' not in ('brief', 'standard', 'developed')
      or pg_catalog.jsonb_typeof(v_plan -> 'lengthModeLabel') is distinct from 'string'
      or nullif(pg_catalog.btrim(v_plan ->> 'lengthModeLabel'), '') is null
      or pg_catalog.length(v_plan ->> 'lengthModeLabel') > 80
      or pg_catalog.jsonb_typeof(v_plan -> 'editorialInstructions') is distinct from 'string'
      or pg_catalog.length(v_plan ->> 'editorialInstructions') > 12000
      or pg_catalog.jsonb_typeof(v_plan -> 'destination') is distinct from 'string'
      or v_plan ->> 'destination' not in ('new', 'update')
      or pg_catalog.jsonb_typeof(v_plan -> 'workspaceContractVersion') is distinct from 'number'
      or (v_plan ->> 'workspaceContractVersion')::integer is distinct from 2
      or pg_catalog.jsonb_typeof(v_plan -> 'sourceScope') is distinct from 'string'
      or v_plan ->> 'sourceScope' is distinct from 'workspace'
      or v_plan ? 'origin'
    then
      return false;
    end if;

    if v_first_dossier_id is null then
      v_first_dossier_id := v_dossier_id;
    elsif v_dossier_id is distinct from v_first_dossier_id then
      return false;
    end if;
    v_output_ids := v_output_ids || v_output_id;

    if pg_catalog.jsonb_typeof(v_output -> 'imageNewsroomArticleId') = 'string' then
      if pg_catalog.lower(v_output ->> 'imageNewsroomArticleId') !~ v_uuid_pattern
        or not exists (
          select 1
          from pg_catalog.jsonb_array_elements(v_entries) as entry_item(value)
          where (entry_item.value ->> 'articlePosition')::integer = v_article_position
            and entry_item.value ->> 'status' = 'prepared'
            and pg_catalog.lower(entry_item.value ->> 'newsroomArticleId') =
              pg_catalog.lower(v_output ->> 'imageNewsroomArticleId')
            and pg_catalog.jsonb_typeof(entry_item.value -> 'imageUrl') = 'string'
            and nullif(pg_catalog.btrim(entry_item.value ->> 'imageUrl'), '') is not null
        )
      then
        return false;
      end if;
    end if;

    if v_output ? 'externalImage' then
      if pg_catalog.jsonb_typeof(v_output -> 'externalImage') is distinct from 'object'
        or pg_catalog.jsonb_typeof(v_output -> 'externalImage' -> 'url') is distinct from 'string'
        or (v_output -> 'externalImage' ->> 'url') !~ '^https?://'
        or pg_catalog.jsonb_typeof(v_output -> 'externalImage' -> 'fileName') is distinct from 'string'
        or nullif(pg_catalog.btrim(v_output -> 'externalImage' ->> 'fileName'), '') is null
        or pg_catalog.length(v_output -> 'externalImage' ->> 'fileName') > 240
        or pg_catalog.jsonb_typeof(v_output -> 'imageNewsroomArticleId') is distinct from 'null'
      then
        return false;
      end if;
    end if;

    if (v_output ? 'publishedArticleId') or (v_output ? 'publishedSlug') then
      if pg_catalog.jsonb_typeof(v_output -> 'publishedArticleId') is distinct from 'string'
        or pg_catalog.lower(v_output ->> 'publishedArticleId') !~ v_uuid_pattern
        or pg_catalog.jsonb_typeof(v_output -> 'publishedSlug') is distinct from 'string'
        or nullif(pg_catalog.btrim(v_output ->> 'publishedSlug'), '') is null
      then
        return false;
      end if;
    end if;

    if v_output ? 'usedAt' then
      if pg_catalog.jsonb_typeof(v_output -> 'usedAt') is distinct from 'string'
        or nullif(pg_catalog.btrim(v_output ->> 'usedAt'), '') is null
      then
        return false;
      end if;
      perform (v_output ->> 'usedAt')::timestamptz;
    end if;
  end loop;

  if p_manifest ? 'publishedContextArticleIds' then
    if pg_catalog.jsonb_typeof(p_manifest -> 'publishedContextArticleIds') is distinct from 'array'
      or pg_catalog.jsonb_array_length(p_manifest -> 'publishedContextArticleIds') > 20
    then
      return false;
    end if;
    for v_item in
      select item.value
      from pg_catalog.jsonb_array_elements(p_manifest -> 'publishedContextArticleIds') as item(value)
    loop
      if pg_catalog.jsonb_typeof(v_item) is distinct from 'string' then
        return false;
      end if;
      v_published_context_id := pg_catalog.lower(v_item #>> '{}');
      if v_published_context_id !~ v_uuid_pattern
        or v_published_context_id = any(v_published_context_ids)
      then
        return false;
      end if;
      v_published_context_ids := v_published_context_ids || v_published_context_id;
    end loop;
  end if;

  return true;
exception
  when others then
    return false;
end;
$function$;

revoke all on function public.newsroom_editorial_source_package_manifest_v5_valid(
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_editorial_source_package_manifest_v5_valid(
  uuid,
  text,
  text,
  jsonb
) to service_role;

alter table public.newsroom_editorial_source_packages
  drop constraint newsroom_editorial_source_packages_manifest_check;

alter table public.newsroom_editorial_source_packages
  add constraint newsroom_editorial_source_packages_manifest_check
  check (
    case
      when manifest ->> 'version' = '5' then
        public.newsroom_editorial_source_package_manifest_v5_valid(
          id,
          package_year,
          package_month,
          manifest
        )
      when manifest ->> 'version' in ('2', '4') then
        -- Historical predicate preserved verbatim for manifests v2 and v4.
        jsonb_typeof(manifest) = 'object'
        and manifest ->> 'version' in ('2', '4')
        and manifest ->> 'packageId' = id::text
        and manifest ->> 'year' = package_year
        and manifest ->> 'month' = package_month
        and jsonb_typeof(manifest -> 'entries') = 'array'
        and (
          manifest ->> 'version' = '2'
          or (
            manifest ->> 'version' = '4'
            and jsonb_typeof(manifest -> 'outputs') = 'array'
            and jsonb_array_length(manifest -> 'outputs')
              between 1 and 30
          )
        )
      else false
    end
  );

comment on function public.newsroom_editorial_source_package_manifest_v5_valid(
  uuid,
  text,
  text,
  jsonb
) is
  'Closed structural validator for Mesa v2 Source Package manifests. Historical v2/v4 validation remains in the table constraint.';

notify pgrst, 'reload schema';
commit;
