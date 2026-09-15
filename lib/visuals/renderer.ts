import type { EffectSettings, Point, TrackingFrame } from "../vision/types";
import { assetUrl } from "../asset-url";
import { MotionParticles } from "./particles";
import { ThumbTrigger, CornerTrigger, cornerButton, EyeLaserTrigger } from "../vision/gestures";
import * as shaders from "./shaders";

function program(gl:WebGLRenderingContext,vertex:string,fragment:string){
  const p=gl.createProgram()!;
  for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
    const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);gl.deleteProgram(p);throw new Error(message||"Effect shader failed");}
    gl.attachShader(p,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||"Effect program failed");
  return p;
}
export class VisualRenderer {
  private gl:WebGLRenderingContext;
  private base:WebGLProgram;private mesh:WebGLProgram;private dots:WebGLProgram;private copy:WebGLProgram;
  private quad:WebGLBuffer;private meshBuffer:WebGLBuffer;private pointBuffer:WebGLBuffer;
  private videoTexture:WebGLTexture;private bodyTexture:WebGLTexture;private asciiTexture:WebGLTexture;
  private targets:{texture:WebGLTexture;framebuffer:WebGLFramebuffer}[]=[];
  private uniformCache=new Map<WebGLProgram,Map<string,WebGLUniformLocation|null>>();
  private triangles:number[]=[];private targetPoints:Point[]=[];private points:Point[]=[];
  private frame?:TrackingFrame;private previousCenter={x:.5,y:.5};private velocity={x:0,y:0};
  private particles=new MotionParticles();private bodyReady=false;private bodyAt=0;
  private thumb=new ThumbTrigger();private brand:WebGLProgram;private brandTextures:WebGLTexture[];
  private corner=new CornerTrigger();private bursts=new MotionParticles();
  private eyeLaser=new EyeLaserTrigger();private laser:WebGLProgram;
  private overlay=document.createElement("canvas");private overlayTexture:WebGLTexture;
  private overlayKey="";private handReady=false;private live=false;private renderNow=0;
  private receivedAt=0;
  private expression={jaw:0,smile:0,blink:0,yaw:0};private lock=0;private lastNow=0;private time=0;
  private write=0;private lastMode=-1;private lastMirror=-1;private lastEnabled=-1;
  private lost=false;private restore:()=>void;
  private contextLost=(event:Event)=>{event.preventDefault();this.lost=true;this.onError("Graphics context lost. Reload to restore the output.");};
  constructor(private canvas:HTMLCanvasElement,private onError:(message:string)=>void,private onNext:()=>void=()=>{}){
    const gl=canvas.getContext("webgl",{alpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error("WebGL is unavailable in this browser.");this.gl=gl;
    this.base=program(gl,shaders.FULLSCREEN_VERTEX,shaders.BASE_FRAGMENT);
    this.mesh=program(gl,shaders.MESH_VERTEX,shaders.MESH_FRAGMENT);
    this.dots=program(gl,shaders.PARTICLE_VERTEX,shaders.PARTICLE_FRAGMENT);
    this.copy=program(gl,shaders.FULLSCREEN_VERTEX,shaders.COPY_FRAGMENT);
    this.quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    this.meshBuffer=gl.createBuffer()!;this.pointBuffer=gl.createBuffer()!;
    this.videoTexture=this.texture();this.bodyTexture=this.texture();
    this.asciiTexture=this.texture();
    const atlas=document.createElement("canvas");atlas.width=320;atlas.height=48;
    const glyphs=atlas.getContext("2d")!;glyphs.font="bold 38px monospace";glyphs.textAlign="center";glyphs.textBaseline="middle";glyphs.fillStyle="#fff";
    Array.from(" .:-=+*#%@").forEach((glyph,i)=>glyphs.fillText(glyph,i*32+16,25));
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
    this.brand=program(gl,shaders.FULLSCREEN_VERTEX,shaders.BRAND_FRAGMENT);
    this.laser=program(gl,shaders.FULLSCREEN_VERTEX,shaders.LASER_FRAGMENT);
    this.overlayTexture=this.texture();
    this.brandTextures=[this.imageTexture("/brand/ctrl-shift-white.png"),this.imageTexture("/brand/ambition-black-source-v2.svg",1176,164)];
    this.restore=()=>{this.onError("Graphics restored. Reload to restart the instrument.");};
    canvas.addEventListener("webglcontextlost",this.contextLost);canvas.addEventListener("webglcontextrestored",this.restore);
  }
  private texture(){const gl=this.gl,t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));return t;}
  private imageTexture(src:string,width?:number,height?:number){
    const gl=this.gl,t=this.texture();
    gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
    const image=new Image();image.decoding="async";if(width&&height){image.width=width;image.height=height;}image.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);};image.onerror=()=>this.onError("A projection logo could not be loaded.");image.src=assetUrl(src);
    return t;
  }
  private loc(p:WebGLProgram,name:string){let map=this.uniformCache.get(p);if(!map){map=new Map();this.uniformCache.set(p,map);}if(!map.has(name))map.set(name,this.gl.getUniformLocation(p,name));return map.get(name)!;}
  private f(p:WebGLProgram,name:string,value:number){this.gl.uniform1f(this.loc(p,name),value);}
  private bind(p:WebGLProgram,name:string,texture:WebGLTexture,unit:number){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.loc(p,name),unit);}
  private attribute(p:WebGLProgram,name:string,size:number,stride=0,offset=0){const gl=this.gl,i=gl.getAttribLocation(p,name);if(i>=0){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,size,gl.FLOAT,false,stride,offset);}}
  private fullscreen(p:WebGLProgram){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);this.attribute(p,"a_position",2);gl.drawArrays(gl.TRIANGLES,0,6);}
  setTopology(triangles:number[]){this.triangles=triangles;}
  accept(frame:TrackingFrame,s:EffectSettings){
    this.frame=frame;this.targetPoints=frame.points;
    this.receivedAt=performance.now();
    this.handReady=!!frame.gesturesAvailable;
    if(frame.hands){
      const tip=this.thumb.observe(frame.hands,frame.time);
      if(tip)this.bursts.burst(tip.x,tip.y,s.particles,this.canvas.width/this.canvas.height);
      if(this.corner.observe(frame.hands,this.receivedAt,!!s.mirror,this.canvas.clientWidth,this.canvas.clientHeight))this.onNext();
    }
    this.particles.observe(frame.points,frame.time,s.particles,s.particlesEnabled>0);
    if(frame.mask&&frame.maskWidth&&frame.maskHeight){
      const gl=this.gl;gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.bodyTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,frame.maskWidth,frame.maskHeight,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,frame.mask);
      this.bodyReady=true;this.bodyAt=performance.now();
      this.particles.observeBody(frame.mask,frame.maskWidth,frame.maskHeight,s.particles,s.particlesEnabled>0);
    }
  }
  private clearHistory(){const gl=this.gl;for(const t of this.targets){gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}this.particles.clear();}
  private resize(){
    // Bound fullscreen GPU work so projection resolution doesn't starve hand inference.
    const gl=this.gl,ratio=Math.min(devicePixelRatio,1.5,1920/Math.max(1,this.canvas.clientWidth),1080/Math.max(1,this.canvas.clientHeight)),w=Math.max(1,Math.round(this.canvas.clientWidth*ratio)),h=Math.max(1,Math.round(this.canvas.clientHeight*ratio));
    if(this.canvas.width===w&&this.canvas.height===h&&this.targets.length)return;
    this.canvas.width=w;this.canvas.height=h;gl.viewport(0,0,w,h);
    for(const t of this.targets){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.framebuffer);}
    this.targets=Array.from({length:2},()=>{const texture=this.texture(),framebuffer=gl.createFramebuffer()!;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error("Output buffer could not be allocated");return {texture,framebuffer};});
    this.clearHistory();
  }
  render(video:HTMLVideoElement|null,s:EffectSettings,now:number){
    if(this.lost)return;
    this.live=s.hasVideo;this.renderNow=now;
    const dt=Math.min(.05,Math.max(0,(now-(this.lastNow||now))/1000));this.lastNow=now;
    this.resize();
    if(s.frozen){this.present();return;}
    this.time+=dt;
    const gl=this.gl;
    if(this.lastMode!==s.mode||this.lastMirror!==s.mirror||this.lastEnabled!==s.particlesEnabled){this.clearHistory();this.lastMode=s.mode;this.lastMirror=s.mirror;this.lastEnabled=s.particlesEnabled;}
    if(video&&video.readyState>=2&&s.hasVideo){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.videoTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);}
    const tracking=!!this.targetPoints.length&&!!this.frame&&now-this.receivedAt<900;
    const alpha=1-Math.exp(-dt*18);
    this.lock+=((tracking?1:0)-this.lock)*(1-Math.exp(-dt*9));
    if(tracking){
      this.points=this.targetPoints.map((p,i)=>{const q=this.points[i]??p;return {x:q.x+(p.x-q.x)*alpha,y:q.y+(p.y-q.y)*alpha,z:q.z+(p.z-q.z)*alpha};});
    }
    const blend=this.frame?.expressions??{};
    this.eyeLaser.update(blend,!!this.targetPoints.length&&now-this.receivedAt<900&&s.mode===4&&s.hasVideo&&this.points.length>=478,dt,this.targetPoints,video?.videoHeight?video.videoWidth/video.videoHeight:1);
    const target={jaw:tracking?(blend.jawOpen??0):0,smile:tracking?((blend.mouthSmileLeft??0)+(blend.mouthSmileRight??0))/2:0,blink:tracking?((blend.eyeBlinkLeft??0)+(blend.eyeBlinkRight??0))/2:0,yaw:tracking&&this.frame!.matrix.length===16?Math.atan2(this.frame!.matrix[8],this.frame!.matrix[10]):0};
    for(const key of ["jaw","smile","blink","yaw"] as const)this.expression[key]+=(target[key]-this.expression[key])*alpha;
    const nose=this.points[1]??{x:.5,y:.5,z:0};
    this.velocity.x+=(Math.max(-.3,Math.min(.3,(nose.x-this.previousCenter.x)/Math.max(dt,.016)))-this.velocity.x)*alpha;
    this.velocity.y+=(Math.max(-.3,Math.min(.3,(nose.y-this.previousCenter.y)/Math.max(dt,.016)))-this.velocity.y)*alpha;this.previousCenter=nose;
    const p=this.base;gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[this.write].framebuffer);gl.disable(gl.BLEND);gl.useProgram(p);
    this.bind(p,"u_video",this.videoTexture,0);this.bind(p,"u_previous",this.targets[1-this.write].texture,1);this.bind(p,"u_body",this.bodyTexture,2);this.bind(p,"u_ascii",this.asciiTexture,3);
    gl.uniform2f(this.loc(p,"u_resolution"),this.canvas.width,this.canvas.height);
    const eye=(index:number)=>this.points[index]??nose;
    for(const [name,v] of [["u_face",nose],["u_leftEye",eye(468)],["u_rightEye",eye(473)]] as const)gl.uniform2f(this.loc(p,name),s.mirror?1-v.x:v.x,1-v.y);
    gl.uniform2f(this.loc(p,"u_motion"),this.velocity.x*(s.mirror?-1:1),-this.velocity.y);
    this.f(p,"u_videoReady",s.hasVideo?1:0);this.f(p,"u_bodyReady",this.bodyReady&&now-this.bodyAt<1200?1:0);
    for(const [name,value] of Object.entries({u_feedback:s.feedback,u_pixel:s.pixel,u_threshold:s.threshold}))this.f(p,name,value);
    this.common(p,s);this.fullscreen(p);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    if(s.mode!==7&&this.lock>.01&&this.points.length>=468&&this.triangles.length){
      const vertices=new Float32Array(this.triangles.length*6);
      this.triangles.forEach((index,i)=>{const v=this.points[index];vertices.set([v.x,v.y,v.z,i%3===0?1:0,i%3===1?1:0,i%3===2?1:0],i*6);});
      gl.useProgram(this.mesh);this.common(this.mesh,s);
      gl.uniform3f(this.loc(this.mesh,"u_origin"),nose.x,nose.y,nose.z);
      this.f(this.mesh,"u_faceScale",Math.hypot(this.points[234].x-this.points[454].x,this.points[234].y-this.points[454].y));
      gl.bindBuffer(gl.ARRAY_BUFFER,this.meshBuffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);this.attribute(this.mesh,"a_position",3,24,0);this.attribute(this.mesh,"a_barycentric",3,24,12);gl.drawArrays(gl.TRIANGLES,0,this.triangles.length);
      // Attribute arrays from mesh must not leak into the subsequent point pass.
      const bary=gl.getAttribLocation(this.mesh,"a_barycentric");if(bary>=0)gl.disableVertexAttribArray(bary);
    }
    const motion=this.particles.update(dt,this.time),burst=this.bursts.update(dt,this.time);
    const particles=new Float32Array((s.particlesEnabled?motion.length:0)+burst.length);
    if(s.particlesEnabled)particles.set(motion);
    particles.set(burst,s.particlesEnabled?motion.length:0);
    if(particles.length){
      gl.useProgram(this.dots);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);this.f(this.dots,"u_mirror",s.mirror);this.f(this.dots,"u_scale",Math.min(devicePixelRatio,1.5));
      const colors=[[.9,.35,1.],[.2,1.,.55],[1.,.35,.08],[.65,.5,1.],[.1,.75,1.],[.25,1.,.8],[.03,1.,1.],[.55,1.,.74]];
      gl.uniform3fv(this.loc(this.dots,"u_color"),colors[s.mode]);gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,particles,gl.DYNAMIC_DRAW);this.attribute(this.dots,"a_particle",4);gl.drawArrays(gl.POINTS,0,particles.length/4);
    }
    gl.disable(gl.BLEND);this.write=1-this.write;this.present();
  }
  private common(p:WebGLProgram,s:EffectSettings){for(const [name,value] of Object.entries({u_mirror:s.mirror,u_mode:s.mode,u_time:this.time,u_intensity:s.intensity,u_lock:this.lock,u_jaw:this.expression.jaw,u_smile:this.expression.smile,u_blink:this.expression.blink,u_yaw:this.expression.yaw}))this.f(p,name,value);}
  private present(){
    const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);gl.useProgram(this.copy);this.bind(this.copy,"u_frame",this.targets[1-this.write].texture,0);this.fullscreen(this.copy);
    // Live beams are outside feedback so they follow the irises without ghost trails.
    if(this.lastMode===4&&this.eyeLaser.strength>.005&&this.points.length>=478){
      gl.useProgram(this.laser);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
      gl.uniform2f(this.loc(this.laser,"u_resolution"),this.canvas.width,this.canvas.height);
      for(const [name,index] of [["u_leftEye",468],["u_rightEye",473]] as const){
        const p=this.points[index];gl.uniform2f(this.loc(this.laser,name),this.lastMirror?1-p.x:p.x,1-p.y);
      }
      this.f(this.laser,"u_power",this.eyeLaser.strength);this.f(this.laser,"u_time",this.time);this.f(this.laser,"u_yaw",this.expression.yaw*(this.lastMirror?-1:1));this.fullscreen(this.laser);
    }
    // Partner marks are composited after feedback: readable, unmirrored, and captured on export.
    const w=this.canvas.clientWidth||1,h=this.canvas.clientHeight||1;
    const marginX=Math.min(56,Math.max(24,w*.025)),marginY=Math.min(46,Math.max(20,h*.03));
    const ctrlW=Math.min(460,Math.max(220,w*.21)),ctrlH=ctrlW*(822/3240);
    // Match visible lettering, not the very different transparent image bounds.
    const ambitionW=ctrlW*.55,ambitionH=ambitionW*(40.94/294.1);
    const drawBrand=(texture:WebGLTexture,x:number,y:number,width:number,height:number)=>{this.bind(this.brand,"u_brand",texture,0);gl.uniform4f(this.loc(this.brand,"u_bounds"),x/w,1-(y+height)/h,width/w,height/h);this.fullscreen(this.brand);};
    gl.useProgram(this.brand);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    drawBrand(this.brandTextures[0],marginX,marginY,ctrlW,ctrlH);
    drawBrand(this.brandTextures[1],w-marginX-ambitionW,marginY+(ctrlH-ambitionH)/2,ambitionW,ambitionH);
    this.drawInteraction(w,h);
    gl.disable(gl.BLEND);
  }
  private drawInteraction(w:number,h:number){
    const gl=this.gl,ready=this.live&&this.handReady&&this.renderNow-this.receivedAt<1500;
    const progress=ready&&this.corner.fresh(this.renderNow)?Math.round(this.corner.progress*20)/20:0;
    const touching=ready&&this.corner.fresh(this.renderNow)&&this.corner.touching;
    const firing=this.lastMode===4&&this.eyeLaser.strength>.5;
    const key=[Math.round(w),Math.round(h),this.lastMode,this.live,ready,progress,touching,firing].join(":");
    if(key!==this.overlayKey){
      this.overlayKey=key;this.overlay.width=Math.round(w);this.overlay.height=Math.round(h);
      const ctx=this.overlay.getContext("2d")!;
      ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.shadowColor="#000";ctx.shadowBlur=10;
      if(this.live&&[0,2,4,7].includes(this.lastMode)){
        ctx.font=`200 ${Math.max(20,Math.min(38,w*.03))}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
        ctx.fillText(this.lastMode===4?(firing?"heat vision":"open your eyes wide"):"smile :)",w*.5,h*.91);
      }
      if(ready){
        const {x,y,radius:r}=cornerButton(w,h);
        ctx.shadowColor=touching?"#36e6ff":"#000";ctx.shadowBlur=touching?26:8;
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fillStyle=touching?"rgba(30,155,190,.6)":"rgba(0,0,0,.5)";ctx.fill();
        ctx.strokeStyle=touching?"#8af3ff":"rgba(255,255,255,.65)";ctx.lineWidth=touching?3:1;ctx.stroke();
        if(progress>0){ctx.beginPath();ctx.arc(x,y,r+6,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.lineWidth=3;ctx.strokeStyle="#b9faff";ctx.stroke();}
        // Lucide Pointer (ISC): an upright index finger, not a mouse cursor.
        ctx.save();ctx.translate(x-r*.48,y-r*.48);ctx.scale(r*.04,r*.04);
        ctx.shadowBlur=0;ctx.strokeStyle="#fff";ctx.lineWidth=1.8;ctx.lineJoin="round";ctx.lineCap="round";
        ctx.stroke(new Path2D("M22 14a8 8 0 0 1-8 8 M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2 M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1 M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10 M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"));ctx.restore();
      }
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.overlayTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.overlay);
    }
    gl.useProgram(this.copy);this.bind(this.copy,"u_frame",this.overlayTexture,0);this.fullscreen(this.copy);
  }
  dispose(){const gl=this.gl;this.canvas.removeEventListener("webglcontextlost",this.contextLost);this.canvas.removeEventListener("webglcontextrestored",this.restore);for(const p of [this.base,this.mesh,this.dots,this.copy,this.brand,this.laser])gl.deleteProgram(p);for(const b of [this.quad,this.meshBuffer,this.pointBuffer])gl.deleteBuffer(b);for(const t of [this.videoTexture,this.bodyTexture,this.asciiTexture,this.overlayTexture,...this.brandTextures,...this.targets.map(t=>t.texture)])gl.deleteTexture(t);for(const t of this.targets)gl.deleteFramebuffer(t.framebuffer);}
}
