begin;

-- Run only against a disposable PG17 database after all local migrations.
-- Every fixture is rolled back.

do $structure$
begin
  if pg_catalog.to_regprocedure(
    'public.newsroom_set_manual_article_classifications_v2(uuid[],text)'
  ) is null then
    raise exception 'manual_classification_batch_rpc_missing';
  end if;
end;
$structure$;

insert into public.newsroom_articles (
  id,
  source_code,
  original_url,
  normalized_url,
  title,
  detected_at,
  processing_status,
  first_detected_at,
  last_detected_at
)
select
  ('94000000-0000-4000-8000-' || pg_catalog.lpad(n::text, 12, '0'))::uuid,
  '__manual_classification_smoke__',
  'https://example.invalid/manual-classification/' || n::text,
  'https://example.invalid/manual-classification/' || n::text,
  'Fonte descartavel ' || n::text,
  case when n = 5
    then '2026-09-09T14:01:59Z'::timestamptz
    else '2026-09-09T14:02:01Z'::timestamptz
  end,
  'ready_for_review',
  case when n = 5
    then '2026-09-09T14:01:59Z'::timestamptz
    else '2026-09-09T14:02:01Z'::timestamptz
  end,
  case when n = 5
    then '2026-09-09T14:01:59Z'::timestamptz
    else '2026-09-09T14:02:01Z'::timestamptz
  end
from pg_catalog.generate_series(1, 8) as fixture_row(n);

insert into public.newsroom_editorial_themes (
  id,
  title,
  classification_key
) values
(
  '94000000-0000-4000-9000-000000000001'::uuid,
  'Tema Benfica descartavel',
  'benfica'
),
(
  '94000000-0000-4000-9000-000000000002'::uuid,
  'Tema Sporting descartavel',
  'sporting'
);

do $batch$
declare
  v_result record;
begin
  select * into strict v_result
  from public.newsroom_set_manual_article_classifications_v2(
    array[
      '94000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid,
      '94000000-0000-4000-8000-000000000003'::uuid
    ],
    'benfica'
  );

  if v_result.requested_count <> 3
    or v_result.changed_count <> 3
    or (
      select pg_catalog.count(*)
      from public.newsroom_editorial_article_classifications as row
      where row.newsroom_article_id = any(array[
        '94000000-0000-4000-8000-000000000001'::uuid,
        '94000000-0000-4000-8000-000000000002'::uuid,
        '94000000-0000-4000-8000-000000000003'::uuid
      ])
        and row.classification_key = 'benfica'
        and row.classification_source = 'manual'
    ) <> 3
  then
    raise exception 'manual_classification_batch_set_failed';
  end if;

  perform public.newsroom_set_manual_article_classification_v1(
    '94000000-0000-4000-8000-000000000002'::uuid,
    'fc_porto'
  );
  perform public.newsroom_set_manual_article_classifications_v2(
    array[
      '94000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid,
      '94000000-0000-4000-8000-000000000003'::uuid
    ],
    'sporting'
  );

  if (
    select pg_catalog.count(*)
    from public.newsroom_editorial_article_classifications as row
    where row.newsroom_article_id = any(array[
      '94000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid,
      '94000000-0000-4000-8000-000000000003'::uuid
    ])
      and row.classification_key = 'sporting'
      and row.classification_source = 'manual'
  ) <> 3 then
    raise exception 'manual_classification_batch_replace_failed';
  end if;

  perform public.newsroom_set_manual_article_classifications_v2(
    array[
      '94000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid,
      '94000000-0000-4000-8000-000000000003'::uuid
    ],
    null
  );

  if exists (
    select 1
    from public.newsroom_editorial_article_classifications as row
    where row.newsroom_article_id = any(array[
      '94000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid,
      '94000000-0000-4000-8000-000000000003'::uuid
    ])
  ) then
    raise exception 'manual_classification_batch_clear_failed';
  end if;
end;
$batch$;

do $batch_atomicity$
begin
  perform public.newsroom_set_manual_article_classifications_v2(
    array[
      '94000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid
    ],
    'benfica'
  );

  begin
    perform public.newsroom_set_manual_article_classifications_v2(
      array[
        '94000000-0000-4000-8000-000000000001'::uuid,
        '94000000-0000-4000-8000-000000000099'::uuid
      ],
      'sporting'
    );
    raise exception 'missing_source_was_accepted';
  exception
    when no_data_found then null;
  end;

  begin
    perform public.newsroom_set_manual_article_classifications_v2(
      array[
        '94000000-0000-4000-8000-000000000001'::uuid,
        '94000000-0000-4000-8000-000000000005'::uuid
      ],
      'sporting'
    );
    raise exception 'outside_cycle_source_was_accepted';
  exception
    when check_violation then null;
  end;

  if exists (
    select 1
    from public.newsroom_editorial_article_classifications as row
    where row.newsroom_article_id = any(array[
      '94000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid
    ])
      and row.classification_key <> 'benfica'
  ) then
    raise exception 'manual_classification_batch_partially_applied';
  end if;
end;
$batch_atomicity$;

do $theme_authority$
declare
  v_key text;
  v_source text;
begin
  perform public.newsroom_clear_article_classification_v1(
    '94000000-0000-4000-8000-000000000001'::uuid
  );
  perform public.newsroom_set_editorial_theme_source_membership_v1(
    '94000000-0000-4000-9000-000000000001'::uuid,
    '94000000-0000-4000-8000-000000000001'::uuid,
    true
  );
  select row.classification_key, row.classification_source
  into strict v_key, v_source
  from public.newsroom_editorial_article_classifications as row
  where row.newsroom_article_id =
    '94000000-0000-4000-8000-000000000001'::uuid;
  if v_key <> 'benfica' or v_source <> 'manual' then
    raise exception 'theme_did_not_classify_unclassified_source';
  end if;

  perform public.newsroom_set_editorial_theme_source_membership_v1(
    '94000000-0000-4000-9000-000000000001'::uuid,
    '94000000-0000-4000-8000-000000000001'::uuid,
    false
  );
  if not exists (
    select 1
    from public.newsroom_editorial_article_classifications as row
    where row.newsroom_article_id =
      '94000000-0000-4000-8000-000000000001'::uuid
      and row.classification_key = 'benfica'
      and row.classification_source = 'manual'
  ) then
    raise exception 'leaving_theme_restored_old_classification';
  end if;

  perform public.newsroom_set_manual_article_classification_v1(
    '94000000-0000-4000-8000-000000000002'::uuid,
    'sporting'
  );
  perform public.newsroom_set_editorial_theme_source_membership_v1(
    '94000000-0000-4000-9000-000000000001'::uuid,
    '94000000-0000-4000-8000-000000000002'::uuid,
    true
  );
  perform public.newsroom_set_editorial_theme_source_membership_v1(
    '94000000-0000-4000-9000-000000000001'::uuid,
    '94000000-0000-4000-8000-000000000001'::uuid,
    true
  );

  perform public.newsroom_update_editorial_theme_v1(
    '94000000-0000-4000-9000-000000000001'::uuid,
    'Tema agora Sporting',
    'sporting',
    null,
    null,
    null,
    null,
    null
  );
  if (
    select pg_catalog.count(*)
    from public.newsroom_editorial_article_classifications as row
    where row.newsroom_article_id = any(array[
      '94000000-0000-4000-8000-000000000001'::uuid,
      '94000000-0000-4000-8000-000000000002'::uuid
    ])
      and row.classification_key = 'sporting'
      and row.classification_source = 'manual'
  ) <> 2 then
    raise exception 'theme_update_did_not_reclassify_members';
  end if;

  begin
    perform public.newsroom_set_editorial_theme_source_membership_v1(
      '94000000-0000-4000-9000-000000000002'::uuid,
      '94000000-0000-4000-8000-000000000001'::uuid,
      true
    );
    raise exception 'conflicting_theme_membership_was_accepted';
  exception
    when check_violation then null;
  end;

  if exists (
    select 1
    from public.newsroom_editorial_theme_sources as row
    where row.theme_id = '94000000-0000-4000-9000-000000000002'::uuid
      and row.newsroom_article_id =
        '94000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'conflicting_theme_membership_partially_applied';
  end if;
end;
$theme_authority$;

-- Fixture do reset: automatic dentro do ciclo desaparece, manual fica,
-- automatic fora do ciclo fica e membro de Tema termina manual/coletivo.
insert into public.newsroom_editorial_article_classifications (
  newsroom_article_id,
  classification_key,
  classification_source
) values
(
  '94000000-0000-4000-8000-000000000003'::uuid,
  'outside_liga_other',
  'automatic'
),
(
  '94000000-0000-4000-8000-000000000004'::uuid,
  'fc_porto',
  'manual'
),
(
  '94000000-0000-4000-8000-000000000005'::uuid,
  'outside_liga_other',
  'automatic'
),
(
  '94000000-0000-4000-8000-000000000006'::uuid,
  'outside_liga_other',
  'automatic'
)
on conflict (newsroom_article_id) do update
set
  classification_key = excluded.classification_key,
  classification_source = excluded.classification_source;

insert into public.newsroom_editorial_theme_sources (
  theme_id,
  newsroom_article_id
) values (
  '94000000-0000-4000-9000-000000000002'::uuid,
  '94000000-0000-4000-8000-000000000006'::uuid
);

insert into public.newsroom_editorial_theme_sources (
  theme_id,
  newsroom_article_id
) values
(
  '94000000-0000-4000-9000-000000000001'::uuid,
  '94000000-0000-4000-8000-000000000007'::uuid
),
(
  '94000000-0000-4000-9000-000000000002'::uuid,
  '94000000-0000-4000-8000-000000000007'::uuid
);

do $conflict_preflight$
begin
  if not exists (
    select 1
    from public.newsroom_editorial_theme_sources as membership_row
    join public.newsroom_editorial_themes as theme_row
      on theme_row.id = membership_row.theme_id
    group by membership_row.newsroom_article_id
    having pg_catalog.count(distinct theme_row.classification_key) > 1
  ) then
    raise exception 'conflicting_theme_preflight_fixture_not_detected';
  end if;
end;
$conflict_preflight$;

delete from public.newsroom_editorial_theme_sources
where newsroom_article_id =
  '94000000-0000-4000-8000-000000000007'::uuid;

delete from public.newsroom_editorial_article_classifications
  as classification_row
using public.newsroom_articles as article_row
where article_row.id = classification_row.newsroom_article_id
  and article_row.first_detected_at
    >= '2026-09-09T14:02:00Z'::timestamptz
  and classification_row.classification_source = 'automatic';

insert into public.newsroom_editorial_article_classifications (
  newsroom_article_id,
  classification_key,
  classification_source,
  classified_at
)
select
  membership_row.newsroom_article_id,
  pg_catalog.min(theme_row.classification_key),
  'manual',
  pg_catalog.statement_timestamp()
from public.newsroom_editorial_theme_sources as membership_row
join public.newsroom_editorial_themes as theme_row
  on theme_row.id = membership_row.theme_id
join public.newsroom_articles as article_row
  on article_row.id = membership_row.newsroom_article_id
where article_row.first_detected_at
  >= '2026-09-09T14:02:00Z'::timestamptz
group by membership_row.newsroom_article_id
on conflict on constraint
  newsroom_editorial_article_classifications_pkey
do update
set
  classification_key = excluded.classification_key,
  classification_source = excluded.classification_source,
  classified_at = excluded.classified_at
where (
  newsroom_editorial_article_classifications.classification_key,
  newsroom_editorial_article_classifications.classification_source
) is distinct from (
  excluded.classification_key,
  excluded.classification_source
);

do $reset_assertions$
begin
  if exists (
    select 1
    from public.newsroom_editorial_article_classifications
    where newsroom_article_id =
      '94000000-0000-4000-8000-000000000003'::uuid
  ) then
    raise exception 'automatic_current_cycle_was_not_removed';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_article_classifications
    where newsroom_article_id =
      '94000000-0000-4000-8000-000000000004'::uuid
      and classification_key = 'fc_porto'
      and classification_source = 'manual'
  ) then
    raise exception 'manual_current_cycle_was_not_preserved';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_article_classifications
    where newsroom_article_id =
      '94000000-0000-4000-8000-000000000005'::uuid
      and classification_key = 'outside_liga_other'
      and classification_source = 'automatic'
  ) then
    raise exception 'automatic_outside_cycle_was_not_preserved';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_article_classifications
    where newsroom_article_id =
      '94000000-0000-4000-8000-000000000006'::uuid
      and classification_key = 'benfica'
      and classification_source = 'manual'
  ) then
    raise exception 'theme_member_was_not_promoted_to_manual';
  end if;
end;
$reset_assertions$;

rollback;
