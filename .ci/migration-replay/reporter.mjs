export default async function* report(source) {
  for await (const event of source) {
    if(event.type==='test:fail') {
      const {name,file,line,column,details}=event.data;
      yield JSON.stringify({event:'fail',name,file,line,column,message:String(details?.error?.cause?.message||details?.error?.message||'').split('\n')[0],stack:String(details?.error?.cause?.stack||'').split('\n').filter(s=>s.includes('.test.')).slice(0,3)})+'\n';
    }
    if(event.type==='test:summary') yield JSON.stringify({event:'summary',...event.data})+'\n';
  }
}
