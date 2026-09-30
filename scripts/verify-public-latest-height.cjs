// Reproducible browser regression using the real wrappers, CSS and Latest client.
// node scripts/verify-public-latest-height.cjs <agent-browser> [--ref origin/main] [--quick] [--diagnose]
// Isolate a case with --case companion/short/four_news/500/1440 [--repeat 10].
// Use --controls --diagnose --ref origin/main to compare the unchanged layouts.
// No application server, credentials or database. Generated evidence stays in ignored out/.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { build } = require('esbuild');
const React = require('react');
const { renderToString } = require('react-dom/server');
const browser = process.argv[2];
if (!browser) throw new Error('Supply the agent-browser executable');
const argument = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const ref = argument('--ref');
const quick = process.argv.includes('--quick');
const diagnose = process.argv.includes('--diagnose');
const controls = process.argv.includes('--controls');
const selectedCase = argument('--case');
const label = ((ref || 'branch') + (selectedCase ? '-isolated' : controls ? '-controls' : '')).replace(/[^\w-]/g, '_');
const output = path.resolve('out/latest-height-1024');
fs.mkdirSync(output, { recursive: true });
const files = new Map();
function source(file) {
  if (!files.has(file)) files.set(file, ref
    ? execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', windowsHide: true })
    : fs.readFileSync(file, 'utf8'));
  return files.get(file);
}
const plugin = { name: 'isolated-real-renderers', setup(builder) {
  builder.onLoad({ filter: /\.(?:tsx?|css)$/ }, args => {
    const file = path.relative(process.cwd(), args.path).replaceAll('\\', '/');
    if (file === 'lib/site-advertising.ts') return { loader: 'ts', contents: `
      export async function readPrimarySideAdvertisement() { return {advertisement:globalThis.__latestTestAd}; }
      export function isDisplayableSideAdvertisement(ad) { return Boolean(ad); }
    ` };
    if (/^lib\/supabase/.test(file)) throw new Error('The fixture must not access Supabase');
    if (!/^(components|lib)\//.test(file)) return;
    return { contents: source(file), loader: file.endsWith('.css') ? 'local-css' : file.endsWith('.tsx') ? 'tsx' : 'ts' };
  });
} };

// Runs in the fixture browser, before hydration. Counts refer to rendered items,
// not to whether the complete section happens to be inside the viewport.
function measure() {
  const latest = document.querySelector('[data-public-latest-news]');
  const owner = document.querySelector('[data-test-target]');
  const list = latest?.querySelector('.public-news-list');
  const companion = owner.querySelector('.public-latest-companion-zone,.public-four-news-grid');
  const rect = el => { const r = el?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom} : null; };
  const geometry = el => { const root = rect(el); return [...el.querySelectorAll('*')].filter(e => !e.closest('[aria-hidden="true"]') && e.getBoundingClientRect().height && !['STYLE','SCRIPT','LINK'].includes(e.tagName)).map(e => { const r=rect(e); return {tag:e.tagName,class:e.className,x:r.x-root.x,y:r.y-root.y,width:r.width,height:r.height}; }); };
  const visible = [...(list?.querySelectorAll('.public-news-item') || [])].filter(e => e.getBoundingClientRect().height && getComputedStyle(e).display !== 'none');
  const bounds = rect(list);
  const rootBounds = rect(latest);
  const complete = visible.filter(e => { const r=rect(e); return r.y>=bounds.y-.5 && r.bottom<=Math.min(bounds.bottom,rootBounds.bottom)+.5; });
  const ad = owner.querySelector('[data-public-ad-slot]');
  return { width:innerWidth, owner:rect(owner), root:rootBounds, list:bounds, companion:rect(companion), ad:rect(ad),
    before:rect(document.querySelector('[data-test-before]')), after:rect(document.querySelector('[data-test-after]')),
    beforeGeometry:geometry(document.querySelector('[data-test-before]')), afterGeometry:geometry(document.querySelector('[data-test-after]')),
    total:list?.children.length || 0, visible:visible.length, complete:complete.length,
    rootInline:latest?.getAttribute('style') || null,
    internalScroll:!!list && getComputedStyle(list).overflowY==='auto' && list.scrollHeight>list.clientHeight,
    overflow:document.documentElement.scrollWidth>innerWidth,
    observerCalls:window.__calls.length, mutations:window.__mutations,
    cls:window.__shifts.reduce((sum,e)=>sum+e.value,0), shifts:window.__shifts.slice(), errors:window.__errors.slice() };
}

async function main() {
  const options = { bundle:true, write:false, jsx:'automatic', plugins:[plugin], define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_SUPABASE_URL':'""'} };
  const entry = `
    import React from 'react';
    import Companion from './components/public/PublicLatestCompanionLayout';
    import Four from './components/public/PublicFourNewsLatestLayout';
    import Only from './components/public/PublicThematicLatestOnlyLayout';
    import Frame from './components/public/PublicMatchdayEditorialSectionFrame';
    import {createPublicFlexibleZone} from './components/public/PublicFlexibleZoneLayout';
    import {PublicFlexibleZoneContent} from './components/public/PublicFlexibleZoneRenderers';
    const articles=Array.from({length:6},(_,i)=>({id:'editorial-'+i,sourceId:'source-'+i,sortOrder:i+1,label:'JORNADA',title:'Os protagonistas e as decisões da jornada '+i,subtitle:'Uma leitura das escolhas e dos momentos decisivos para a próxima ronda.',imageUrl:'/fixture.svg',linkUrl:'/noticias/editorial-'+i,publishedAt:null}));
    const zone=(family,key)=>createPublicFlexibleZone({key,visualFamily:family,publicTitle:'Atualidade da jornada',publicTitleColor:'#008A44',items:articles.slice(0,family.startsWith('five_')?5:family==='four_news'?4:6)});
    export async function fixture(config){
      globalThis.__latestTestAd=config.ad==='none'?null:{imageUrl:'/ad.svg?height='+ (config.ad==='short'?80:1600),targetUrl:'#advertisement',altText:'Publicidade de teste',imageWidth:200,imageHeight:config.ad==='short'?80:1600};
      const items=Array.from({length:config.count},(_,i)=>({id:'latest-'+i,timeLabel:'12:34',timeLabelColor:'#B50012',title:'Notícia '+i+': '+ 'O que mudou nesta jornada. '.repeat(1+i%3),subtitle:i%2?'Acompanhe as decisões e os protagonistas da próxima ronda.':null,linkUrl:'/noticias/latest-'+i}));
      const props={items,title:'Últimas',titleColor:'#008A44'};
      const target=config.route==='four'?await Four({items:articles.slice(0,4),latestNews:items,latestNewsTitle:props.title,latestNewsTitleColor:props.titleColor}):config.route==='only'?await Only(props):await Companion({zone:zone(config.family,'companion'),matchdayNumber:8,latestNews:items,latestNewsTitle:props.title,latestNewsTitleColor:props.titleColor});
      return {props:{...props,...(config.route==='four'?{constrainToFourNewsGrid:true}:config.route==='only'?{sectionFlow:true}:{constrainToCompanionZone:true})},tree:<main className="public-matchday-shell">
        <div data-test-before><Frame kind="zone"><PublicFlexibleZoneContent zone={zone('six_news','before')} matchdayNumber={8}/></Frame></div>
        <div data-test-target>{target}</div>
        <div data-test-after><Frame kind="zone"><PublicFlexibleZoneContent zone={zone('six_news_1_2_3','after')} matchdayNumber={8}/></Frame></div>
      </main>};
    }
  `;
  const serverBuild = await build({...options,platform:'node',packages:'external',outfile:path.join(output,'server.cjs'),stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()}});
  const module = {exports:{}};
  new Function('require','module','exports',serverBuild.outputFiles.find(f=>f.path.endsWith('.cjs')).text)(createRequire(path.join(process.cwd(),'fixture.cjs')),module,module.exports);
  const client = await build({...options,platform:'browser',outfile:path.join(output,'client.js'),stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react';import {hydrateRoot} from 'react-dom/client';import Latest from './components/public/PublicLatestNewsBlock';
    window.hydrateLatest=()=>{const root=document.querySelector('[data-public-latest-news]');
      if(root && window.__config.route!=='only') hydrateRoot(root.parentElement,<Latest {...window.__props}/>,{onRecoverableError:error=>window.__errors.push(String(error))});
      window.__started=true;
    };
  `}});
  const css = source('app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx').match(/const publicMatchdayStyles = `([\s\S]*?)`;/)[1]+'\n'+serverBuild.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
  const clientJs = client.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const server = http.createServer(async(req,res)=>{
    try {
      if(req.method!=='GET'){res.writeHead(405).end();return;}
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname==='/client.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(clientJs);return;}
      if(url.pathname==='/fixture.svg'||url.pathname==='/ad.svg') {const ad=url.pathname==='/ad.svg';res.writeHead(200,{'Content-Type':'image/svg+xml'}).end('<svg xmlns="http://www.w3.org/2000/svg" width="'+(ad?200:640)+'" height="'+(ad?Number(url.searchParams.get('height')):360)+'"><rect width="100%" height="100%" fill="'+(ad?'#187342':'#9eb9cf')+'"/></svg>');return;}
      if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
      const config={route:url.searchParams.get('route')||'companion',count:Number(url.searchParams.get('count')||0),ad:url.searchParams.get('ad')||'none',family:url.searchParams.get('family')||'four_news'};
      const {tree,props}=await module.exports.fixture(config);
      const html=renderToString(tree);
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
        <script>window.__calls=[];window.__errors=[];window.__shifts=[];window.__mutations=0;window.__config=${JSON.stringify(config)};window.__props=${JSON.stringify(props)};
        new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__shifts.push({value:e.value,time:e.startTime,sources:e.sources.map(s=>({node:s.node?.tagName,class:s.node?.className,previous:s.previousRect.toJSON(),current:s.currentRect.toJSON()}))})}).observe({type:'layout-shift',buffered:true});
        const Native=ResizeObserver;window.ResizeObserver=class extends Native{constructor(callback){super((entries,observer)=>{window.__calls.push(performance.now());callback(entries,observer)})}};
        window.addEventListener('error',e=>window.__errors.push(e.message));
        new MutationObserver(entries=>{window.__mutations+=entries.filter(e=>e.type==='attributes'&&e.target.closest('[data-public-latest-news]')).length}).observe(document,{subtree:true,attributes:true,attributeFilter:['style']});
        window.measureLatest=${measure.toString()};</script></head><body>${html}<script src="/client.js"></script></body></html>`);
    }catch(error){res.writeHead(500).end(String(error.stack));}
  });
  await new Promise(resolve=>server.listen(3138,'127.0.0.1',resolve));
  function run(...args){return new Promise((resolve,reject)=>{
    const command=spawn(browser,['--session','latest-height-regression',...args,'--json'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',finished=false;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);command.stdout.destroy();command.stderr.destroy();command.unref();if(error){command.kill();reject(error);}else resolve(value);};
    const timer=setTimeout(()=>finish(new Error('Browser timeout: '+args[0]+' '+stderr)),30000);
    command.stdout.on('data',chunk=>{stdout+=chunk;let result;try{result=JSON.parse(stdout);}catch{return;}finish(result.success?null:new Error(JSON.stringify(result)),result.data);});
    command.stderr.on('data',chunk=>{stderr+=chunk;});
    command.on('error',error=>finish(error));
    command.on('close',code=>{if(!finished)finish(new Error('Browser exit '+code+': '+stderr+stdout));});
  });}
  const evaluate=async code=>(await run('eval',code)).result;
  const results=[],failures=[];
  const check=(name,fn)=>{try{fn();}catch(error){failures.push({name,message:error.message.slice(0,700)});}};
  const close=(a,b)=>assert.ok(Math.abs(a-b)<=.5,`${a} != ${b}`);
  const save=()=>fs.writeFileSync(path.join(output,`${label}-browser-regression.json`),JSON.stringify({ref:ref||'working tree',results,failures},null,2));
  async function visit(config,width){
    await run('set','viewport',String(width),'1000');
    await run('open','http://127.0.0.1:3138/?'+new URLSearchParams(config));
    await evaluate('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))).then(()=>true)');
    const ssr=await evaluate('window.measureLatest()');
    await evaluate('window.hydrateLatest();true');
    const hydrated=await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(window.measureLatest()))))');
    const stable=await evaluate('new Promise(r=>setTimeout(()=>r(window.measureLatest()),100))');
    const key=Object.values(config).join('/')+'/'+width;
    const item={key,config,width,ssr,hydrated,stable,hydrationCls:stable.cls-ssr.cls};results.push(item);
    if(!diagnose){
      // Compare complete SSR with hydration. Keep parsing-time shifts separately:
      // the existing :has(ad) grid can change columns as a long HTML feed parses.
      check(key+' SSR/hydration',()=>{for(const m of [hydrated,stable]){close(m.owner.height,ssr.owner.height);close(m.after.y,ssr.after.y);assert.equal(m.cls-ssr.cls,0);assert.deepEqual(m.errors,[]);assert.equal(m.overflow,false);}});
      check(key+' convergence',()=>{assert.equal(stable.observerCalls,hydrated.observerCalls);assert.equal(stable.mutations,hydrated.mutations);});
      check(key+' neighbours',()=>{assert.deepEqual(stable.beforeGeometry,ssr.beforeGeometry);assert.deepEqual(stable.afterGeometry,ssr.afterGeometry);});
      if(config.route==='companion'){
        check(key+' complete bounded feed',()=>{
          assert.equal(stable.total,Number(config.count));assert.equal(stable.visible,stable.complete);assert.equal(stable.internalScroll,false);assert.equal(stable.rootInline,null);
          if(width>760&&width<=1100)assert.equal(ssr.cls,0,'No parsing-time layout shift in the corrected tablet range');
          if(width<=760)assert.equal(stable.visible,0);
          else if(Number(config.count)){close(stable.root.height,stable.companion.height);assert.ok(stable.visible>0);if(Number(config.count)>=100)assert.ok(stable.visible<Number(config.count));}
          if(width>760&&width<=1100&&config.ad==='tall')assert.ok(stable.ad.height>stable.companion.height,'The tall ad must exceed the companion height');
          if(width>760&&width<=1100&&config.ad==='short')assert.ok(stable.ad.height<stable.companion.height,'The short ad must be shorter than the companion');
        });
        const previous=results.find(row=>row!==item&&row.width===width&&row.config.route===config.route&&row.config.ad===config.ad&&row.config.family===config.family&&row.config.count==='20');
        if(previous&&Number(config.count)>20)check(key+' 20 vs large',()=>{close(stable.owner.height,previous.stable.owner.height);close(stable.after.y,previous.stable.after.y);close(stable.companion.height,previous.stable.companion.height);});
      }
    }
    save();
    return item;
  }
  try{
    if(selectedCase){
      const [route,ad,family,count,width]=selectedCase.split('/');
      for(let index=0;index<Number(argument('--repeat')||1);index++)await visit({route,ad,family,count},Number(width));
      console.log(JSON.stringify({ref:ref||'working tree',cases:results.length,failures},null,2));
      if(failures.length)process.exitCode=1;
      return;
    }
    const widths=controls?[]:quick?[1100,1024,760]:[1440,1181,1180,1101,1100,1024,761,760,390];
    for(const ad of quick?['tall']:['none','tall','short'])for(const width of widths){
      for(const count of quick?['500']:['0','1','5','8','20','100','500'])await visit({route:'companion',ad,family:'four_news',count},width);
      console.log(`${label}: ${ad}/${width}, ${results.length} cases, ${failures.length} failures`);
    }
    if(!quick){
      for(const family of ['five_news_column','six_news','six_news_1_2_3','five_news_balanced','five_news_secondary'])for(const ad of ['none','tall'])for(const count of ['20','500'])await visit({route:'companion',ad,family,count},1024);
      for(const route of ['four','only'])for(const width of [1440,1024,760])await visit({route,ad:'tall',family:'four_news',count:'500'},width);
      await visit({route:'companion',ad:'tall',family:'four_news',count:'500'},1440);
      const repeated=new Map();
      for(const width of [1440,1024,1440,1024,760,1024]){
        await run('set','viewport',String(width),'1000');
        const measurement=await evaluate('new Promise(r=>setTimeout(()=>r(window.measureLatest()),150))');
        const initial=repeated.get(width);repeated.set(width,measurement);
        if(!diagnose)check('resize '+width,()=>{assert.equal(measurement.rootInline,null);assert.equal(measurement.visible,measurement.complete);if(initial){close(measurement.owner.height,initial.owner.height);close(measurement.after.y,initial.after.y);assert.equal(measurement.visible,initial.visible);}});
        results.push({resize:width,measurement});
      }
      save();
    }
    const parsingShifts=results.filter(row=>row.ssr?.cls).map(row=>({key:row.key,cls:row.ssr.cls}));
    console.log(JSON.stringify({ref:ref||'working tree',cases:results.length,failures,parsingShifts},null,2));
    if(failures.length)process.exitCode=1;
  }finally{await run('close').catch(()=>{});await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
