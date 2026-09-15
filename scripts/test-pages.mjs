// Optional browser verification: PLAYWRIGHT_MODULE points to an installed playwright module.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve,extname } from "node:path";
import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=resolve("pages-dist"),types={".html":"text/html",".js":"text/javascript",".css":"text/css",".wasm":"application/wasm",".svg":"image/svg+xml",".png":"image/png"};
const server=createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    if(path.startsWith("/signal-mirror/"))path=path.slice("/signal-mirror".length);
    if(path.endsWith("/"))path+="index.html";
    const file=resolve(root,"."+path);if(!file.startsWith(root+"/"))throw Error("bad path");
    res.setHeader("Content-Type",types[extname(file)]||"application/octet-stream");res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(4173,"127.0.0.1",r));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream","--enable-webgl","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  for(const base of ["/","/signal-mirror/"]){
    const context=await browser.newContext({permissions:["camera"],viewport:{width:1440,height:1000}});
    const page=await context.newPage(),errors=[];page.on("pageerror",e=>{errors.push(e.message);console.log("PAGE ERROR",e.message);});
    console.log("Testing",base);
    page.on("console",m=>{if(m.type()==="error")console.log("CONSOLE",m.text());});
    page.on("response",r=>{if(r.status()>=400)console.log("HTTP",r.status(),r.url());});
    await page.goto("http://127.0.0.1:4173"+base);
    await page.waitForFunction(()=>document.querySelector(".offline-status")?.textContent?.includes("Ready offline on this device"),{},{timeout:30000}).catch(async e=>{console.log(await page.locator("body").innerText());throw e;});
    console.log("Offline cache installed",base);
    assert.equal(await page.locator(".preset").count(),8);
    assert.equal(await page.locator(".renderer-error").count(),0);
    await context.setOffline(true);await page.reload();
    await page.waitForFunction(()=>document.querySelector(".offline-status")?.textContent?.includes("Ready offline on this device"));
    console.log("Offline reload succeeded",base);
    await page.locator(".camera-picker button").filter({hasText:"ENABLE CAMERA"}).click();
    await page.getByText("CAMERA ONLINE",{exact:false}).first().waitFor({timeout:30000});
    await page.waitForFunction(()=>document.querySelector(".face-lock")?.textContent==="SEARCHING FACE",{},{timeout:60000});
    const options=await page.locator("#camera-select option").count();assert.ok(options>=2,"fake USB/webcam option appears after permission");
    await page.locator(".camera-picker button").filter({hasText:"APPLY CAMERA"}).click();
    await page.getByText("CAMERA ONLINE",{exact:false}).first().waitFor({timeout:30000});
    await page.locator("canvas").focus();await page.keyboard.press("8");await page.waitForFunction(()=>document.querySelector(".preset.active")?.textContent?.includes("ASCII"));
    await page.keyboard.press("Space");await page.waitForFunction(()=>document.querySelector(".preset.active")?.textContent?.includes("Prism"));
    assert.deepEqual(errors,[]);
    console.log(`PASS ${base}: offline reload, 8 filters, WebGL, model startup, camera picker/apply, shortcuts`);
    await context.close();
  }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
