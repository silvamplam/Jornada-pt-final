"""Synthetic auxiliary tables plus verbatim Latest/bank SQL dependencies.

Called only after run.py has verified an empty, local, disposable database.
No fixtures are loaded from production. The unrelated full layout projector
continues to fail loudly if reached; do not replace it with a success stub.
"""
import hashlib
import re


def install(execute, root):
    definitions = []
    def function(path, name):
        source = (root / path).read_text(encoding="utf-8-sig")
        pattern = r"create(?: or replace)? function\s+" + re.escape(name) + r"\s*\([\s\S]*?as (\$[a-z_]*\$)[\s\S]*?\1;"
        matches = list(re.finditer(pattern, source, re.I))
        assert len(matches) == 1, (path, name)
        definition = matches[0].group(0)
        execute(definition)
        definitions.append(dict(path=path, name=name, sha256=hashlib.sha256(definition.encode()).hexdigest()))
    execute(r"""
alter table public.matchday_latest_news add column article_id uuid, add column sort_order integer not null default 1,
 add column status text not null default 'draft' check(status in('draft','published')), add column created_at timestamptz default now(),
 add column time_label_color text, add constraint latest_test_positive_order check(sort_order>=1);
 alter table public.matchday_editorials add column latest_zone_mode text, add column latest_zone_title text, add column latest_zone_title_color text;
 alter table jornada_private.matchday_live_layout_physical_cutovers add column profile_key text;
 alter table public.matchday_editorial_profile_assignments add column profile_key text;
 create table public.matchday_live_layout_workspace_settings(matchday_id uuid primary key references public.matchdays(id),
 latest_zone_mode text not null,latest_zone_title text,latest_zone_title_color text,latest_zone_placement text,updated_at timestamptz);
 create table jornada_private.matchday_live_layout_downstream_context(backend_pid integer,transaction_id xid8,matchday_id uuid,nesting_depth integer,
 primary key(backend_pid,transaction_id,matchday_id),check(nesting_depth>0));
 create table jornada_private.matchday_live_layout_physical_carryover_context(backend_pid integer,transaction_id xid8,target_matchday_id uuid);
 alter table public.matchday_editorial_bank_items add column created_at timestamptz default now(),add column status text default 'active',
 add column origin_slot_type text,add column sort_order integer,add column automatic_eligible boolean default true,
 add column continuity_source_matchday_id uuid,add column continuity_source_composition_id uuid;
 create table public.editorial_contents(like public.editorial_articles including defaults);
 alter table public.editorial_contents add column content_type text,add column summary text,add column thumbnail_url text;
 grant select,insert,update on public.matchday_latest_news to service_role;
 alter table public.matchday_latest_news enable row level security;
 alter table public.matchday_latest_news force row level security;
 drop function jornada_private.begin_matchday_live_layout_downstream_v14(uuid);
 drop function jornada_private.end_matchday_live_layout_downstream_v14(uuid);
""")
    v14 = 'supabase/migrations/20260904140000_matchday_live_layout_physical_apply_facade.sql'
    v15 = 'supabase/migrations/20260905110018_matchday_publication_physical_placement_boundary_v15.sql'
    v18 = 'supabase/migrations/20260905135209_matchday_live_layout_physical_carryover_v18.sql'
    for name in ('begin_matchday_live_layout_downstream_v14', 'end_matchday_live_layout_downstream_v14', 'is_matchday_live_layout_downstream_v14'):
        function(v14, 'jornada_private.' + name)
    function(v15, 'public.set_matchday_latest_news_settings_v15')
    function('supabase/migrations/20260823215153_batch_publication_latest_order_set_based.sql', 'public.normalize_matchday_latest_news_order')
    function('supabase/migrations/20260826134553_matchday_editorial_bank_automatic_eligibility.sql', 'public.upsert_matchday_editorial_bank_publication')
    function('supabase/migrations/20260824130519_hotfix_matchday_zone_publication_min_uuid.sql', 'public.sync_matchday_zone_publication_to_bank')
    function(v18, 'jornada_private.is_matchday_live_layout_carryover_v18')
    function(v18, 'public.sync_matchday_zone_row_to_bank')
    execute("""create trigger latest_test_real_bank_sync after insert or update on public.matchday_latest_news
      for each row execute function public.sync_matchday_zone_row_to_bank();""")
    return definitions
