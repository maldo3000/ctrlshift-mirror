import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import ts from "typescript";

function load(path){
  const exports={};
  const source=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{exports,Image:class{},require:id=>id.includes("asset-url")?{assetUrl:x=>x}:load(resolve(dirname(path),id+".ts"))});
  return exports;
}
const {BodyContact}=load(resolve("lib/vision/body-contact.ts"));
const {CornerTrigger,cornerButton}=load(resolve("lib/vision/gestures.ts"));
const {FacePhysics}=load(resolve("lib/visuals/face-physics.ts"));
test("Face Bounce includes all four portraits at every installation size",()=>{
  const physics=new FacePhysics();
  assert.deepEqual(Array.from(physics.portraits,p=>p.src),["/portraits/josh-head.png","/portraits/sid-head.png","/portraits/amy-head.png","/portraits/anson-head.png"]);
  for(const [w,h] of [[640,480],[1920,1080]]){
    physics.reset(w,h);
    assert.equal(new Set(physics.bodies.map(b=>b.kind)).size,4);
    assert.equal(new Set(physics.bodies.map(b=>b.color)).size,4);
  }
});
function rectangle(x0,y0,x1,y1){
  const mask=new Uint8Array(10000);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)mask[y*100+x]=255;
  return mask;
}
test("silhouette contact respects mirroring, screen size, freshness and flooded masks",()=>{
  const body=new BodyContact();body.observe(rectangle(85,35,100,65),100,100,100);
  for(const [w,h] of [[1280,720],[1920,1080],[720,1280]]){
    assert.equal(body.button(w,h,false,200),true);
    assert.equal(body.button(w,h,true,200),false);
  }
  assert.equal(body.button(1280,720,false,500),false);
  assert.equal(body.contact(1150,360,50,1280,720,false,500),undefined);
  body.observe(new Uint8Array(10000).fill(255),100,100,600);
  assert.equal(body.fresh(600),false);
});
test("body button needs clear space before entry, dwell, and release before another switch",()=>{
  const trigger=new CornerTrigger();let fired=0;
  const step=(time,touch,fresh=true)=>{if(trigger.observe([],time,false,1280,720,touch,fresh))fired++;};
  for(let t=0;t<1500;t+=100)step(t,true);assert.equal(fired,0,"startup overlap must not fire");
  for(let t=1500;t<2100;t+=100)step(t,false);
  for(let t=2100;t<4200;t+=100)step(t,true);assert.equal(fired,1,"held silhouette fires once");
  for(let t=4200;t<4800;t+=100)step(t,false);
  for(let t=4800;t<5900;t+=100)step(t,true);assert.equal(fired,2);
  for(let t=5900;t<7500;t+=100)step(t,true,false);assert.equal(fired,2,"stale tracking cannot trigger");
});
test("fingertip button remains available without segmentation",()=>{
  const trigger=new CornerTrigger(),b=cornerButton(1280,720);
  const hands=[{indexTip:{x:1-b.x/1280,y:b.y/720}}];let fired=0;
  for(let t=0;t<1500;t+=100)if(trigger.observe(hands,t,true))fired++;
  assert.equal(fired,1);
});
test("outline pushes heads without any face or hand landmarks and stays bounded",()=>{
  const body=new BodyContact(),physics=new FacePhysics();
  physics.reset(1280,720);
  physics.bodies=[{x:655,y:360,vx:0,vy:0,r:50,angle:0,spin:0,color:"cyan",kind:0}];
  body.observe(rectangle(20,10,50,90),100,100,0);
  physics.update(.016,1280,720,[],[],false,body,0);
  assert.ok(physics.bodies[0].vx>300,"right boundary pushes outward");
  for(let i=1;i<1200;i++){
    const now=i*16;if(i%6===0)body.observe(rectangle(20,10,50,90),100,100,now);
    physics.update(.016,1280,720,[],[],false,body,now);
    const b=physics.bodies[0];assert.ok([b.x,b.y,b.vx,b.vy].every(Number.isFinite));
    assert.ok(b.x>=b.r&&b.x<=1280-b.r&&b.y>=b.r&&b.y<=720-b.r);
  }
});
