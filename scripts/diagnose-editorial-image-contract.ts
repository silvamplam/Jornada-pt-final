/** Read-only network diagnosis; writes evidence only under out/image-contract. */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { downloadEditorialResource, downloadFrozenEditorialImage } from "../lib/editorial-image-download.server";
import { resolveEditorialImageSource } from "../lib/editorial-image-source.server";

async function main() {
  const source="https://img.iol.pt/preset/6ad13331d34e53c759c76a1a/og/maisfutebol";
  const pageUrl="https://maisfutebol.iol.pt/benfica/celtic/liga-europa-benfica-celtic-4-1-cronica";
  const page=await downloadEditorialResource(pageUrl,["text/html","application/xhtml+xml"],2*1024*1024);
  const html=Buffer.from(page.bytes).toString("utf8");
  const resolved=await resolveEditorialImageSource(source,pageUrl,async()=>({html,url:page.finalUrl}));
  await mkdir("out/image-contract",{recursive:true});
  await writeFile("out/image-contract/source.html",html);
  const images=[];
  // The rewritten URL is the literal failed URL from the incident, used only
  // for comparison. The resolver never constructs it.
  for(const [name,url] of [["social",source],["article",resolved],["rewritten","https://img.iol.pt/image/id/6ad13331d34e53c759c76a1a/1024.jpg"]]){
    const result=await downloadFrozenEditorialImage(url);
    const meta=await sharp(result.bytes).metadata();
    await writeFile(`out/image-contract/${name}.jpg`,result.bytes);
    images.push({name,sourceUrl:url,finalUrl:result.finalUrl,status:200,redirected:result.finalUrl!==url,
      contentType:result.contentType,bytes:result.bytes.length,width:meta.width,height:meta.height,format:meta.format,
      sha256:createHash("sha256").update(result.bytes).digest("hex")});
  }
  const evidence={observedAt:new Date().toISOString(),pageUrl,resolved,images};
  await writeFile("out/image-contract/evidence.json",JSON.stringify(evidence,null,2)+"\n");
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
