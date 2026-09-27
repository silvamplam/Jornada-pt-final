-- Synthetic precondition for the historical, exactly-one-candidate repair.
-- No production rows or identifiers. Loading the legacy bug state must not run
-- modern write-path triggers. Constraints/triggers are fully enabled when the
-- unchanged migration runs and verifies its own retirement postconditions.
begin;
do $guard$ begin
 if current_database() <> 'jornada_migration_replay'
 or current_setting('jornada.replay',true) is distinct from 'on' then
 raise exception 'isolated replay fixture only'; end if;
end $guard$;
set local session_replication_role = replica;
insert into public.competitions(id,name,slug) values('11111111-1111-4111-8111-000000000101','Replay synthetic competition','replay-synthetic');
insert into public.seasons(id,competition_id,label) values('11111111-1111-4111-8111-000000000102','11111111-1111-4111-8111-000000000101','Replay synthetic season');
insert into public.matchdays(id,season_id,number,label) values
('11111111-1111-4111-8111-000000000103','11111111-1111-4111-8111-000000000102',1,'Replay source'),
('11111111-1111-4111-8111-000000000104','11111111-1111-4111-8111-000000000102',2,'Replay target');
insert into public.editorial_articles(id,slug,title,status,scope,matchday_id)
values('11111111-1111-4111-8111-000000000105','replay-synthetic-article','Replay synthetic article','published','matchday','11111111-1111-4111-8111-000000000103');
insert into public.matchday_reference_compositions(id,matchday_id,status,is_current,presentation_mode)
values('11111111-1111-4111-8111-000000000106','11111111-1111-4111-8111-000000000103','published',true,'standard');
insert into public.matchday_editorial_desk_control(matchday_id,season_id,is_managed)
values('11111111-1111-4111-8111-000000000103','11111111-1111-4111-8111-000000000102',false),('11111111-1111-4111-8111-000000000104','11111111-1111-4111-8111-000000000102',true);
insert into public.matchday_editorial_bank_items(id,matchday_id,title,source_type,source_id,status,continuity_source_matchday_id,continuity_source_composition_id)
values('11111111-1111-4111-8111-000000000107','11111111-1111-4111-8111-000000000103','Replay synthetic article','editorial_article','11111111-1111-4111-8111-000000000105','active',null,null),
('11111111-1111-4111-8111-000000000108','11111111-1111-4111-8111-000000000104','Replay synthetic article','editorial_article','11111111-1111-4111-8111-000000000105','active','11111111-1111-4111-8111-000000000103','11111111-1111-4111-8111-000000000106');
insert into public.matchday_live_layout_placements(id,matchday_id,bank_item_id,placement_type,slot_position)
values('11111111-1111-4111-8111-000000000109','11111111-1111-4111-8111-000000000103','11111111-1111-4111-8111-000000000107','opening',1),
('11111111-1111-4111-8111-000000000110','11111111-1111-4111-8111-000000000104','11111111-1111-4111-8111-000000000108','opening',1);
insert into public.matchday_editorial_continuity_transitions(source_matchday_id,target_matchday_id,source_composition_id,continuity_version)
values('11111111-1111-4111-8111-000000000103','11111111-1111-4111-8111-000000000104','11111111-1111-4111-8111-000000000106',6);
set local session_replication_role = origin;
commit;

