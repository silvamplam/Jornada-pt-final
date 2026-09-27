// Lexical comparison ignores SQL formatting/comments but preserves quoted values.
export const tokens = function(sql) {
 sql=sql.replace(/\r\n/g,"\n");const tokens=[];let i=0;
 while(i<sql.length){
  if(/\s|\uFEFF/.test(sql[i])){i++;continue;}
  if(sql.startsWith("--",i)){i=sql.indexOf("\n",i);if(i<0)break;continue;}
  if(sql.startsWith("/*",i)){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith("/*",i)){depth++;i+=2;}else if(sql.startsWith("*/",i)){depth--;i+=2;}else i++;}continue;}
  if(sql[i]==="'"||sql[i]==='"'){const quote=sql[i],start=i++,escaped=quote==="\'"&&/\be$/i.test(sql.slice(0,start));while(i<sql.length){if(sql[i]==="\\"&&escaped){i+=2;continue;}if(sql[i]===quote){i++;if(sql[i]===quote){i++;continue;}break;}i++;}tokens.push(sql.slice(start,i));continue;}
  const dollar=sql.slice(i).match(/^\$[A-Za-z_0-9]*\$/);if(dollar){tokens.push(dollar[0]);i+=dollar[0].length;continue;}
  const word=sql.slice(i).match(/^[A-Za-z_][A-Za-z_0-9$]*|^\d+(?:\.\d+)?/);if(word){tokens.push(word[0].toLowerCase());i+=word[0].length;continue;}
  tokens.push(sql[i++]);
 }return tokens;
};
