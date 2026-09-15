import { build } from "vite";
import { readdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
await import("./build-vision.mjs");
await build({configFile:resolve("vite.pages.config.ts")});
const root=resolve("pages-dist");
async function walk(dir,prefix=""){
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.name.startsWith(".")||entry.name==="_headers")continue;
    const name=prefix+entry.name;
    if(entry.isDirectory())files.push(...await walk(resolve(dir,entry.name),name+"/"));else files.push(name);
  }
  return files.sort();
}
const files=await walk(root),hash=createHash("sha256");
for(const file of files){hash.update(file);hash.update(await readFile(resolve(root,file)));}
const version=hash.digest("hex").slice(0,16);
const template=await readFile(resolve("standalone/sw-template.js"),"utf8");
await writeFile(resolve(root,"sw.js"),template.replace("__VERSION__",JSON.stringify(version)).replace("__FILES__",JSON.stringify(files)));
await writeFile(resolve(root,".nojekyll"),"");
console.log(`Pages build ready: ${files.length} offline assets; revision ${version}`);
