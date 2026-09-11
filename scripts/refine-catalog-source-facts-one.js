// Re-run the vetted fact-extraction workflow with a one-fact minimum.
// This does not loosen matching or invent facts; it only allows a concise
// variety-specific description when one reliable structured fact is present.
const fs=require('fs');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,'refine-catalog-from-source-facts.js'),'utf8')
  .replace('if(factCount<2){','if(factCount<1){');
new Function('require','process','console','__dirname','__filename',source)(require,process,console,__dirname,__filename);
