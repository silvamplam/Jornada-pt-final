"""Continuity A/B and atomic explicit Theme membership, on disposable PostgreSQL only.
Run with the same --container or --socket options as publication.py. No production data.
"""
from pathlib import Path
import runpy
from uuid import uuid4

base = runpy.run_path(str(Path(__file__).with_name('publication.py')))
execute, load, scalar, prepare, package, article, publish, finish, receipts, uid, val, test, report = (
    base[name] for name in ('execute','load','scalar','prepare','package','article','publish','finish','receipts','uid','val','test','report'))
load('supabase/migrations/20260926183411_mesa_continuity_explicit_articles_and_reads.sql')


def explicit_theme_continuity():
    source_ids, article_ids = [str(uuid4()), str(uuid4())], [str(uuid4()), str(uuid4())]
    for source in source_ids:
        execute(f"""insert into public.newsroom_articles(id,source_code,original_url,normalized_url,title,
          detected_at,first_detected_at,last_detected_at,processing_status) values('{source}','__closure_test__',
          'https://example.invalid/{source}','https://example.invalid/{source}','Fonte',now(),now(),now(),'ready_for_review');
          insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at)
          values('{uuid4()}','{source}',repeat('a',64),'[{{"type":"paragraph","text":"Nova matéria relacionada"}}]',
          '{{"fixture":true}}',now());
          insert into public.newsroom_editorial_article_classifications(newsroom_article_id,classification_key,classification_source)
          values('{source}','benfica','manual');""")
    for aid in article_ids:
        execute(f"""insert into public.editorial_articles(id,status,scope,author,label,title,subtitle,body,slug,
          image_url,published_at,competition_id,season_id,matchday_id) values('{aid}','published','matchday','Editor','Ante',
          'Artigo selecionável','Subtítulo','Corpo original','closure-{aid}','https://example.invalid/bottle.png',
          '2026-09-17T09:00:00Z','{uid(900)}','{uid(901)}','{uid(902)}');""")
    request_id = str(uuid4())
    def organize(ids, key=request_id):
        return scalar(f"""set role service_role;
          select row_to_json(r) from public.newsroom_organize_theme_selection_v3('{key}',null,'Tema explícito','benfica',
          array[{','.join(repr(s) for s in source_ids)}]::uuid[],array[{','.join(repr(a) for a in ids)}]::uuid[]) r;""")
    row = organize([article_ids[0]])
    theme = row['theme_id']
    def membership():
        return scalar(f"select jsonb_agg(editorial_article_id order by editorial_article_id) from public.newsroom_editorial_theme_articles where theme_id='{theme}';")
    assert membership() == [article_ids[0]], 'only explicit article belongs to Theme'
    assert organize([article_ids[0]])['reused'] is True
    try:
        organize(article_ids)
        raise AssertionError('changed explicit selection reused request ID')
    except RuntimeError as error:
        assert 'request-conflict' in str(error)
    def production():
        req = dict(version=1,preparationKey=str(uuid4()),title='Continuidade explícita',themes=[],sources=[],
                   selection=dict(sourceIds=[],themeIds=[theme],reviewArticleIds=[article_ids[0]],newArticleCount=0))
        prepared = prepare(req)
        return dict(theme=theme,sources=source_ids,articles=[article_ids[0]],request=req,
                    dossier=prepared['dossierId'],plan=prepared['plan'])
    before = execute(f"select md5(to_jsonb(a)::text) from public.editorial_articles a where id='{article_ids[0]}';")
    first = production(); first_package = package(first); output = first['plan']['outputs'][0]
    assert len(first['plan']['outputs']) == 1 and output['kind'] == 'existing'
    finish(first, first_package, [output['outputId']])
    assert receipts(first)[0]['decision'] == 'SEM_ALTERAÇÃO'
    assert before == execute(f"select md5(to_jsonb(a)::text) from public.editorial_articles a where id='{article_ids[0]}';")
    assert membership() == [article_ids[0]], 'A: no materialized output required'
    assert execute(f"select article_count from public.newsroom_mesa_theme_summaries_v1(array['{theme}']::uuid[]);") == '1'
    second = production(); second_package = package(second); output = second['plan']['outputs'][0]
    updated = article(output)
    assert updated['id'] == article_ids[0]
    publish(second, second_package, output, updated); finish(second, second_package)
    assert receipts(second)[0]['decision'] == 'UPDATE'
    assert membership() == [article_ids[0]], 'B: unchanged canonical ID, one membership'
    assert execute(f"select article_count from public.newsroom_mesa_theme_summaries_v1(array['{theme}']::uuid[]);") == '1'
    assert finish(second, second_package)['action'] == 'reused'
    assert membership() == [article_ids[0]]
    for role in ('anon', 'authenticated'):
        assert execute(f"select has_function_privilege('{role}','public.newsroom_organize_theme_selection_v3(uuid,uuid,text,text,uuid[],uuid[],jsonb)','execute');") == 'f'
    # Any failure linking explicit articles rolls the entire new Theme/source command back.
    failed_key = str(uuid4())
    try:
        organize([str(uuid4())], failed_key)
        raise AssertionError('unknown article accepted')
    except RuntimeError as error:
        assert 'article-unavailable' in str(error)
    assert execute(f"select count(*) from public.newsroom_mesa_organization_requests where request_id='{failed_key}';") == '0'


test('A/B: Tema explícito + 0 NEW preserva artigo com SEM_ALTERAÇÃO e UPDATE, replay e RLS', explicit_theme_continuity)
report()
