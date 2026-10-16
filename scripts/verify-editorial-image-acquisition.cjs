// Run after verify-editorial-image-authority.cjs against its disposable local DB.
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const connection=process.argv[2],url=new URL(connection);
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/image_freeze_test')throw Error('local-image_freeze_test-only');
const migration=fs.readFileSync('supabase/migrations/20261016154652_editorial_image_acquisition_failure.sql','utf8');
const sql=`${migration}
begin;
set role service_role;
insert into editorial_image_decisions(decision_key,source_url) values('failure-test','https://source.example/a.jpg');
update editorial_image_decisions set state='failed',failure_code='image-download-timeout' where decision_key='failure-test' and state='acquiring' and image is null;
do $$ begin
 assert (select state='failed' and image is null from editorial_image_decisions where decision_key='failure-test');
 begin
   update editorial_image_decisions set state='acquiring' where decision_key='failure-test';
   raise exception 'failed decision was resurrected';
 exception when others then
   if sqlerrm <> 'image-decision-immutable' then raise; end if;
 end;
 assert not has_table_privilege('anon','public.editorial_image_decisions','INSERT');
 assert not has_table_privilege('authenticated','public.editorial_image_decisions','UPDATE');
end $$;
insert into newsroom_editorial_dossier_images(id,frozen_url,source_url) values('1d9db9c3-d3a3-4e91-b4de-dc835ae17997','https://img.iol.pt/preset/6ad13331d34e53c759c76a1a/og/maisfutebol',null);
insert into editorial_image_decisions(decision_key,source_url) values('real-contract','https://img.iol.pt/preset/6ad13331d34e53c759c76a1a/og/maisfutebol');
update editorial_image_decisions set state='candidate',image='{"path":"editorial/sha256/c012110e5fede55c711d98fa553afdc8850c3077459f8079e9177fe55acd5d58.webp","sha256":"c012110e5fede55c711d98fa553afdc8850c3077459f8079e9177fe55acd5d58","byteSize":207852,"contentType":"image/webp","publicUrl":"https://foundation.example/storage/v1/object/public/editorial-images/editorial/sha256/c012110e5fede55c711d98fa553afdc8850c3077459f8079e9177fe55acd5d58.webp","acquisitionUrl":"https://img.iol.pt/image/id/6ad13331d34e53c759c76a1a/"}' where decision_key='real-contract';
insert into editorial_image_assets(public_url,storage_path,sha256,byte_size,content_type)
 select image->>'publicUrl',image->>'path',image->>'sha256',(image->>'byteSize')::bigint,image->>'contentType' from editorial_image_decisions where decision_key='real-contract';
insert into storage.objects(bucket_id,name) select 'editorial-images',image->>'path' from editorial_image_decisions where decision_key='real-contract';
insert into storage.objects(bucket_id,name) select 'editorial-images','previews/v1/'||(image->>'path')||'/w'||w||'.webp' from editorial_image_decisions cross join unnest(array[320,640,960,1280]) w where decision_key='real-contract';
update editorial_image_decisions set state='ready' where decision_key='real-contract';
select editorial_confirm_dossier_image_v1('1d9db9c3-d3a3-4e91-b4de-dc835ae17997','real-contract');
select editorial_confirm_dossier_image_v1('1d9db9c3-d3a3-4e91-b4de-dc835ae17997','real-contract');
insert into editorial_articles(id,status,title,image_url) select '99999999-9999-4999-8999-999999999999','published','Isolated image contract',frozen_url from newsroom_editorial_dossier_images where id='1d9db9c3-d3a3-4e91-b4de-dc835ae17997';
do $$ begin
 assert (select source_url='https://img.iol.pt/preset/6ad13331d34e53c759c76a1a/og/maisfutebol' and frozen_url like '%c012110e%.webp' from newsroom_editorial_dossier_images where id='1d9db9c3-d3a3-4e91-b4de-dc835ae17997');
 assert (select image_url like '%c012110e%.webp' from editorial_articles where id='99999999-9999-4999-8999-999999999999');
 begin
   update editorial_image_decisions set state='failed',image=null where decision_key='real-contract';
   raise exception 'ready decision was changed';
 exception when others then
   if sqlerrm <> 'image-decision-immutable' then raise; end if;
 end;
end $$;
select 'PASS: failed terminal; immutable ready; real source NULL provenance confirmed; local article published; original and four preview object records; idempotent confirm; ACL preserved' result;
rollback;`;
process.stdout.write(execFileSync(process.env.PSQL_BIN||'psql',['-X','-w','-v','ON_ERROR_STOP=1',connection],{input:sql,encoding:'utf8',windowsHide:true}));
