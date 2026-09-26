"""Canonical A-H invariants on the disposable Mesa PostgreSQL harness only."""
from pathlib import Path
import runpy
from uuid import uuid4

base = runpy.run_path(str(Path(__file__).with_name('publication.py')))
execute, load, scalar, fixture, prepare, package, article, finish, receipts, uid, val, test, report = (
    base[name] for name in ('execute','load','scalar','fixture','prepare','package','article','finish','receipts','uid','val','test','report'))
# The synthetic baseline omits this existing production compatibility column.
execute("alter table public.editorial_articles add column if not exists newsroom_article_id uuid references public.newsroom_articles(id);")
if execute("select to_regprocedure('public.newsroom_organize_theme_selection_v3(uuid,uuid,text,text,uuid[],uuid[],jsonb)') is null;") == 't':
    load('supabase/migrations/20260926183411_mesa_continuity_explicit_articles_and_reads.sql')
if execute("select to_regclass('public.newsroom_editorial_article_sources') is null;") == 't':
    load('supabase/migrations/20260926202221_newsroom_canonical_article_sources.sql')


def publish(f,p,o,a):
    if execute("select to_regprocedure('public.newsroom_publish_mesa_intent_output_v2(uuid,uuid,uuid,uuid[],jsonb,text)') is null;") == 't':
        return base['publish'](f,p,o,a)
    a={**a,'classificationKey':'sporting'}
    ids='array['+','.join(repr(x) for x in p['ids'][o['outputId']])+']::uuid[]'
    return scalar(f"select row_to_json(r) from public.newsroom_publish_mesa_intent_output_v2('{f['dossier']}','{o['outputId']}','{p['id']}',{ids},{val(a)},'sporting') r;")


def new_source(theme=None):
    source,snapshot=str(uuid4()),str(uuid4())
    execute(f"""insert into public.newsroom_articles(id,source_code,original_url,normalized_url,title,
      detected_at,first_detected_at,last_detected_at,processing_status) values('{source}','__canonical_test__',
      'https://example.invalid/{source}','https://example.invalid/{source}','Continuidade',now(),now(),now(),'ready_for_review');
      insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at)
      values('{snapshot}','{source}',repeat('a',64),'[{{"type":"paragraph","text":"Material documental avaliado"}}]',
      '{{"fixture":true}}',now());
      insert into public.newsroom_editorial_article_classifications(newsroom_article_id,classification_key,classification_source)
      values('{source}','sporting','manual');""")
    if theme:
        execute(f"select public.newsroom_set_editorial_theme_source_membership_v1('{theme}','{source}',true);")
    return source


def candidates(source):
    return scalar(f"select candidates from public.newsroom_mesa_global_article_candidates_v1(array['{source}']::uuid[]);")


def grouped(theme=None, sources=(), reviews=()):
    req=dict(version=2,preparationKey=str(uuid4()),title='Continuidade canónica',selection=dict(
      sourceIds=list(sources),themeIds=[theme] if theme else [],reviewArticleIds=list(reviews)))
    source_ids='array['+','.join(repr(x) for x in sources)+']::uuid[]'
    theme_ids=f"array['{theme}']::uuid[]" if theme else "'{}'::uuid[]"
    found=scalar(f"select candidates from public.newsroom_mesa_global_article_candidates_v1({source_ids},{theme_ids});")
    req['selection']['candidateArticleIds']=[a['editorialArticleId'] for a in found]
    prepared=base['base']['grouping_prepare'](req)
    dossier=prepared['dossierId']
    revision,_=base['base']['grouping_change'](dossier,'theme_target' if theme else 'target',1,
      target=0 if reviews else 1,theme=theme)
    base['base']['grouping_materialize'](dossier,revision)
    frozen=scalar(f"select frozen_plan from public.newsroom_mesa_intent_preparations where dossier_id='{dossier}';")
    return dict(dossier=dossier,plan=frozen,request=req)


def canonical_invariants():
    seed=fixture(published=0,review=False,new=1,sources=1)
    first={**grouped(theme=seed['theme']), 'theme':seed['theme'], 'sources':seed['sources']}
    pa=package(first); oa=first['plan']['outputs'][0]; a=article(oa); aid=a['id']; A=first['sources'][0]
    publish(first,pa,oa,a)
    assert candidates(A)==[], 'partial publication must not certify completed continuity'
    finish(first,pa)
    def linked():
        return scalar(f"select jsonb_agg(newsroom_article_id order by newsroom_article_id) from public.newsroom_editorial_article_sources where editorial_article_id='{aid}';")
    assert linked()==[A], 'A: NEW links its article context'
    def review():
        return grouped(theme=first['theme'],reviews=[aid])
    B=new_source(first['theme']); second=review(); pb=package(second); ob=second['plan']['outputs'][0]
    assert ob['target']['editorialArticleId']==aid
    publish(second,pb,ob,article(ob)); finish(second,pb)
    assert linked()==sorted([A,B]), 'B: UPDATE accumulates without replacing A'
    C=new_source(first['theme']); third=review(); pc=package(third); oc=third['plan']['outputs'][0]
    before=execute(f"select md5(to_jsonb(a)::text) from public.editorial_articles a where id='{aid}';")
    usage=execute(f"select count(*) from public.newsroom_mesa_output_source_usage where editorial_article_id='{aid}';")
    finish(third,pc,[oc['outputId']])
    assert linked()==sorted([A,B,C]), 'C: SEM_ALTERACAO accumulates C'
    assert before==execute(f"select md5(to_jsonb(a)::text) from public.editorial_articles a where id='{aid}';")
    for source in [A,B,C]:
        assert [a['editorialArticleId'] for a in candidates(source)]==[aid], 'D: equal discovery authority'
    assert usage==execute(f"select count(*) from public.newsroom_mesa_output_source_usage where editorial_article_id='{aid}';")
    assert execute(f"select count(*) from public.newsroom_mesa_output_source_usage where newsroom_article_id='{C}';")=='0', 'E: no false factual usage'
    for source in [B,C]:
        key=str(uuid4())
        result=scalar(f"""set role service_role; select row_to_json(r) from public.newsroom_organize_theme_selection_v3(
          '{key}',null,'Tema canónico','sporting',array['{source}']::uuid[],array['{aid}']::uuid[]) r;""")
        theme=result['theme_id']
        assert execute(f"select article_count from public.newsroom_mesa_theme_summaries_v1(array['{theme}']::uuid[]);")=='1'
        assert execute(f"select count(*) from public.newsroom_editorial_theme_articles where theme_id='{theme}' and editorial_article_id='{aid}';")=='1', 'F: relation before any new production'
    pending=new_source(first['theme'])
    summary=scalar(f"select row_to_json(t) from public.newsroom_mesa_theme_summaries_v1(array['{first['theme']}']::uuid[]) t;")
    assert summary['source_count']==4 and summary['article_count']==1, 'Theme: four sources, one distinct article'
    assert candidates(pending)==[], 'the fourth source is pending, not automatically worked by Theme membership'
    assert execute(f"select count(distinct relation.newsroom_article_id) from public.newsroom_editorial_article_sources relation join public.newsroom_editorial_theme_sources member on member.newsroom_article_id=relation.newsroom_article_id where member.theme_id='{first['theme']}';")=='3'
    # Deliberately create another canonical article with the same source through a real NEW.
    fourth=grouped(sources=[C])
    pd=package(fourth); od=fourth['plan']['outputs'][0]; other=article(od)
    publish(fourth,pd,od,other);finish(fourth,pd)
    assert {a['editorialArticleId'] for a in candidates(C)}=={aid,other['id']}, 'G: resolver returns both, selects neither'
    key=str(uuid4())
    command=f"select row_to_json(r) from public.newsroom_organize_theme_selection_v3('{key}',null,'Escolha explícita','sporting',array['{C}']::uuid[],array['{aid}']::uuid[]) r;"
    organized=scalar(command); theme=organized['theme_id']
    assert scalar(command)['reused'] is True
    assert scalar(f"select jsonb_agg(editorial_article_id) from public.newsroom_editorial_theme_articles where theme_id='{theme}';")==[aid]
    assert finish(first,pa)['action']=='reused'
    assert finish(second,pb)['action']=='reused'
    assert finish(third,pc,[oc['outputId']])['action']=='reused'
    assert linked()==sorted([A,B,C]), 'H: replays never duplicate or discard links'
    assert receipts(third)[0]['decision']=='SEM_ALTERAÇÃO'
    for role in ['anon','authenticated']:
        assert execute(f"select has_table_privilege('{role}','public.newsroom_editorial_article_sources','select');")=='f'
    assert execute("select has_table_privilege('service_role','public.newsroom_editorial_article_sources','insert');")=='f'




def distributed_outputs():
    sources=[new_source() for _ in range(4)]
    req=dict(version=2,preparationKey=str(uuid4()),title='Duas peças distintas',selection=dict(
      sourceIds=sources,themeIds=[],candidateArticleIds=[],reviewArticleIds=[]))
    prepared=base['base']['grouping_prepare'](req); dossier=prepared['dossierId']
    revision,_=base['base']['grouping_change'](dossier,'target',1,target=2)
    for pair in [sources[:2],sources[2:]]:
        ids='array['+','.join(repr(x) for x in pair)+']::uuid[]'
        groups=scalar(f"""select jsonb_agg(distinct g.group_id) from public.newsroom_mesa_new_output_group_sources g
          join public.newsroom_editorial_dossier_sources source on source.id=g.dossier_source_id
          where g.dossier_id='{dossier}' and source.newsroom_article_id=any({ids});""")
        revision,_=base['base']['grouping_change'](dossier,'merge',revision,group_ids=groups)
    base['base']['grouping_materialize'](dossier,revision)
    frozen=scalar(f"select frozen_plan from public.newsroom_mesa_intent_preparations where dossier_id='{dossier}';")
    f=dict(dossier=dossier,plan=frozen,request=req); p=package(f)
    assert len(frozen['contexts'])==1 and len(frozen['outputs'])==2
    mapping={}
    for output in frozen['outputs']:
        chosen=set(output['focusSourceIds']);assert len(chosen)==2
        a=article(output);mapping[a['id']]=chosen
        usage_ids=scalar(f"select jsonb_agg(id) from public.newsroom_editorial_dossier_sources where dossier_id='{dossier}' and newsroom_article_id='{next(iter(chosen))}';")
        selected_package={**p,'ids':{**p['ids'],output['outputId']:usage_ids}}
        publish(f,selected_package,output,a)
    finish(f,p)
    assert set.union(*mapping.values())==set(sources)
    for aid, expected in mapping.items():
        linked=scalar(f"select jsonb_agg(newsroom_article_id) from public.newsroom_editorial_article_sources where editorial_article_id='{aid}';")
        assert set(linked)==expected, 'N-N: never link the other output sources'
        assert execute(f"select count(*) from public.newsroom_mesa_output_source_usage where editorial_article_id='{aid}';")=='1'
    assert all(len(r['sources'])==4 for r in receipts(f))
    assert finish(f,p)['action']=='reused'

test('A-H: canonical source continuity, Theme identity, factual usage separation, ambiguity, replay and permissions',canonical_invariants)
test('N-N: same context, disjoint frozen output groups, factual subset, no cross-relations',distributed_outputs)
report()
