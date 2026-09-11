-- Additional integration assertions; run only in the isolated test database.
BEGIN;
DO $guard$
BEGIN
 IF current_database() <> 'mesa_organization_test' OR inet_server_addr() IS NOT NULL
 THEN RAISE EXCEPTION 'isolated test database required'; END IF;
END;
$guard$;
DO $privileges$
DECLARE f text; r text; t text;
BEGIN
 FOREACH f IN ARRAY ARRAY[
 'newsroom_organize_theme_sources_v1(uuid,uuid,text,text,uuid[])',
 'newsroom_attach_dossier_to_theme_v1(uuid,uuid)',
 'newsroom_prepare_theme_dossier_v1(uuid,uuid,text,uuid[],uuid[],uuid[])',
 'newsroom_remove_theme_source_v1(uuid,uuid)',
 'newsroom_acknowledge_theme_source_v1(uuid,uuid,uuid)'
 ] LOOP
  IF NOT has_function_privilege('service_role','public.'||f,'EXECUTE') THEN
   RAISE EXCEPTION 'service role cannot execute %', f;
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_function_privilege(r,'public.'||f,'EXECUTE') THEN
    RAISE EXCEPTION 'public caller % can execute %',r,f;
   END IF;
  END LOOP;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['newsroom_editorial_theme_dossiers','newsroom_mesa_organization_requests'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity AND c.relforcerowsecurity)
  THEN RAISE EXCEPTION 'RLS not forced on %',t; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'direct mutation allowed for % on %',r,t;
   END IF;
  END LOOP;
 END LOOP;
 IF has_table_privilege('service_role','public.newsroom_mesa_organization_requests','SELECT')
 THEN RAISE EXCEPTION 'private request journal exposed'; END IF;
END;
$privileges$;
-- Force a failure after the first member was successfully inserted.
CREATE FUNCTION public.mesa_ci_fail_second_member() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
 IF current_setting('mesa.ci_fail',true)='yes' AND NEW.newsroom_article_id='95000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'intentional-ci-mid-operation-failure'; END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER z_mesa_ci_mid_operation BEFORE INSERT ON public.newsroom_editorial_theme_sources
FOR EACH ROW EXECUTE FUNCTION public.mesa_ci_fail_second_member();
DO $atomic$
DECLARE nt bigint; ns bigint; nr bigint; failed boolean:=false;
BEGIN
 SELECT count(*) INTO nt FROM public.newsroom_editorial_themes;
 SELECT count(*) INTO ns FROM public.newsroom_editorial_theme_sources;
 SELECT count(*) INTO nr FROM public.newsroom_mesa_organization_requests;
 PERFORM set_config('mesa.ci_fail','yes',true);
 BEGIN
  PERFORM public.newsroom_organize_theme_sources_v1('96000000-0000-4000-8000-000000000001',null,'Atomic failure','sporting',
   ARRAY['95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002']::uuid[]);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'intentional-ci-mid-operation-failure' THEN RAISE; END IF;
  failed:=true;
 END;
 IF NOT failed OR nt<>(SELECT count(*) FROM public.newsroom_editorial_themes)
  OR ns<>(SELECT count(*) FROM public.newsroom_editorial_theme_sources)
  OR nr<>(SELECT count(*) FROM public.newsroom_mesa_organization_requests)
 THEN RAISE EXCEPTION 'mid-operation failure left partial data'; END IF;
 PERFORM set_config('mesa.ci_fail','no',true);
END;
$atomic$;
SET LOCAL ROLE service_role;
DO $contracts$
DECLARE
 a uuid:='95000000-0000-4000-8000-000000000001';
 b uuid:='95000000-0000-4000-8000-000000000002';
 sa uuid:='95000000-0000-4000-8000-000000000101';
 sb uuid:='95000000-0000-4000-8000-000000000102';
 t record; again record; d record; n bigint; failed boolean;
BEGIN
 SELECT * INTO t FROM public.newsroom_organize_theme_sources_v1(
  '96000000-0000-4000-8000-000000000002',null,'Order independent','sporting',ARRAY[a,b]);
 SELECT * INTO again FROM public.newsroom_organize_theme_sources_v1(
  '96000000-0000-4000-8000-000000000002',null,'Order independent','sporting',ARRAY[b,a]);
 IF NOT again.reused OR again.theme_id<>t.theme_id THEN RAISE EXCEPTION 'reordered retry duplicated theme'; END IF;
 failed:=false;
 BEGIN
  PERFORM public.newsroom_acknowledge_theme_source_v1(t.theme_id,a,sb);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'mesa-organization-snapshot-mismatch' THEN RAISE; END IF;
  failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'snapshot from another source accepted'; END IF;
 SELECT count(*) INTO n FROM public.newsroom_editorial_dossiers;
 failed:=false;
 BEGIN
  PERFORM public.newsroom_prepare_theme_dossier_v1(t.theme_id,
   '96000000-0000-4000-8000-000000000003','Wrong frozen snapshot',ARRAY[a],ARRAY[sb],'{}'::uuid[]);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%source_unavailable%' THEN RAISE; END IF;
  failed:=true;
 END;
 IF NOT failed OR n<>(SELECT count(*) FROM public.newsroom_editorial_dossiers)
 THEN RAISE EXCEPTION 'invalid preparation persisted a dossier'; END IF;
 SELECT * INTO d FROM public.newsroom_prepare_theme_dossier_v1(t.theme_id,
   '96000000-0000-4000-8000-000000000004','Included source guard',ARRAY[a],ARRAY[sa],'{}'::uuid[]);
 -- This legacy/direct source writer must also preserve the new hierarchy.
 INSERT INTO public.newsroom_editorial_dossier_sources(dossier_id,newsroom_article_id,newsroom_snapshot_id,included)
 VALUES(d.dossier_id,b,sb,false);
 PERFORM public.newsroom_remove_theme_source_v1(t.theme_id,b);
 UPDATE public.newsroom_editorial_dossier_sources SET included=true
 WHERE dossier_id=d.dossier_id AND newsroom_article_id=b;
 IF NOT EXISTS(SELECT 1 FROM public.newsroom_editorial_theme_sources WHERE theme_id=t.theme_id AND newsroom_article_id=b)
 THEN RAISE EXCEPTION 'legacy include did not restore parent membership'; END IF;
 failed:=false;
 BEGIN
  UPDATE public.newsroom_editorial_dossier_sources SET newsroom_snapshot_id=sb
  WHERE dossier_id=d.dossier_id AND newsroom_article_id=a;
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%frozen_identity_immutable%' THEN RAISE; END IF;
  failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'frozen production source was mutable'; END IF;
 PERFORM public.newsroom_set_editorial_theme_status_v1(t.theme_id,'archived');
 failed:=false;
 BEGIN
  PERFORM public.newsroom_organize_theme_sources_v1(
   '96000000-0000-4000-8000-000000000005',t.theme_id,null,null,ARRAY[a]);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'mesa-organization-theme-unavailable' THEN RAISE; END IF;
  failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'archived theme accepted new organization'; END IF;
END;
$contracts$;
ROLLBACK;
