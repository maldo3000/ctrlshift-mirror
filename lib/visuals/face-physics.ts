import type { Point, TrackingFrame } from "../vision/types";
import { assetUrl } from "../asset-url";
import type { BodyContact } from "../vision/body-contact";

type Body={x:number;y:number;vx:number;vy:number;r:number;angle:number;spin:number;color:string;kind:number};
type Collider={x:number;y:number;vx:number;vy:number;r:number};

// Low-gravity portrait physics with buoyancy and smoothed camera colliders.
export class FacePhysics {
  private bodies:Body[]=[];
  private width=0;private height=0;
  private time=0;
  private previous=new Map<string,{x:number;y:number}>();
  private portraits:HTMLImageElement[];
  constructor(){this.portraits=["/portraits/josh-head.png","/portraits/sid-head.png"].map(src=>{const image=new Image();image.decoding="async";image.src=assetUrl(src);return image;});}
  reset(width:number,height:number){
    this.width=width;this.height=height;this.previous.clear();
    const count=Math.max(8,Math.min(14,Math.round(width/135)));
    this.bodies=Array.from({length:count},(_,i)=>{
      const r=1.4*Math.max(24,Math.min(48,Math.min(width,height)*(.038+(i%3)*.004)));
      return {x:r+(i*173%(Math.max(1,width-r*2))),y:r+(i*97%(Math.max(1,height*.48))),vx:((i%5)-2)*24,vy:-20-(i%4)*15,r,angle:i*.7,spin:(i%2?1:-1)*(.45+(i%4)*.12),color:i%2?"#ff4fd8":"#36e6ff",kind:i%2};
    });
  }
  private collider(key:string,x:number,y:number,r:number,dt:number):Collider{
    const old=this.previous.get(key),alpha=1-Math.exp(-dt*22);
    const next=old?{x:old.x+(x-old.x)*alpha,y:old.y+(y-old.y)*alpha}:{x,y};
    this.previous.set(key,next);
    return {...next,r,vx:old?(next.x-old.x)/Math.max(.008,dt):0,vy:old?(next.y-old.y)/Math.max(.008,dt):0};
  }
  update(dt:number,width:number,height:number,points:Point[],hands:TrackingFrame["hands"],mirror:boolean,body?:BodyContact,now=0){
    if(!this.bodies.length||Math.abs(width-this.width)>2||Math.abs(height-this.height)>2)this.reset(width,height);
    const colliders:Collider[]=[];
    if(points.length>=468){
      const map=(p:Point)=>({x:(mirror?1-p.x:p.x)*width,y:p.y*height});
      const nose=map(points[1]),left=map(points[234]),right=map(points[454]);
      colliders.push(this.collider("face",nose.x,nose.y,Math.max(50,Math.hypot(right.x-left.x,right.y-left.y)*.7),dt));
    }else this.previous.delete("face");
    for(const [i,hand] of (hands??[]).entries()){
      const p=hand.indexTip??hand.tip,x=(mirror?1-p.x:p.x)*width,y=p.y*height;
      colliders.push(this.collider(`hand-${i}`,x,y,Math.max(44,Math.min(width,height)*.07),dt));
    }
    for(const key of this.previous.keys())if(key.startsWith("hand-")&&Number(key.slice(5))>=(hands?.length??0))this.previous.delete(key);
    const step=Math.min(.032,Math.max(.001,dt));
    this.time+=step;
    for(const [index,b] of this.bodies.entries()){
      // Gentle downward gravity, with rising air near the floor to keep heads in reach.
      const lift=Math.max(0,(b.y/height-.55)/.45);
      b.vy+=height*(.055-.22*lift+Math.sin(this.time*.8+index*1.7)*.018)*step;
      b.vx+=width*.018*Math.sin(this.time*.6+index*2.4)*step;
      b.vx*=Math.exp(-.16*step);b.vy*=Math.exp(-.12*step);
      b.x+=b.vx*step;b.y+=b.vy*step;b.angle+=b.spin*step;
      const contact=body?.contact(b.x,b.y,b.r,width,height,mirror,now);
      if(contact){
        const outward=b.vx*contact.x+b.vy*contact.y;
        const impulse=Math.max(0,Math.min(width,height)*.55-outward);
        b.vx+=contact.x*impulse;b.vy+=contact.y*impulse;
        b.x+=contact.x*height*.22*step;b.y+=contact.y*height*.22*step;
      }
      if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*.84;}else if(b.x>width-b.r){b.x=width-b.r;b.vx=-Math.abs(b.vx)*.84;}
      if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy)*.88;}else if(b.y>height-b.r){b.y=height-b.r;b.vy=-Math.max(height*.17,Math.abs(b.vy)*.88);}
      for(const c of colliders){
        const dx=b.x-c.x,dy=b.y-c.y,d=Math.hypot(dx,dy),min=b.r+c.r;
        if(d>=min)continue;
        const nx=d>.001?dx/d:1,ny=d>.001?dy/d:0,push=min-d;
        b.x+=nx*push;b.y+=ny*push;
        const impact=Math.max(220,Math.min(900,Math.hypot(c.vx,c.vy)*1.05+300));
        b.vx=nx*impact+c.vx*.8;b.vy=ny*impact+c.vy*.8;
        const speed=Math.hypot(b.vx,b.vy),limit=Math.max(width,height)*1.25;
        if(speed>limit){b.vx*=limit/speed;b.vy*=limit/speed;}
        b.spin=Math.max(-6,Math.min(6,b.spin+(nx*c.vy-ny*c.vx)*.006));
      }
    }
    for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++){
      const a=this.bodies[i],b=this.bodies[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.r+b.r;
      if(d<=.001||d>=min)continue;
      const nx=dx/d,ny=dy/d,over=(min-d)*.5;a.x-=nx*over;a.y-=ny*over;b.x+=nx*over;b.y+=ny*over;
      const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rel<0){const impulse=-rel*.88;a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;}
    }
  }
  draw(ctx:CanvasRenderingContext2D){
    for(const b of this.bodies){
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);
      ctx.shadowColor=b.color;ctx.shadowBlur=b.r*.7;ctx.fillStyle=b.color;ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(2,b.r*.055);
      ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
      const portrait=this.portraits[b.kind];
      if(portrait.complete&&portrait.naturalWidth){
        const size=b.r*2.42;
        ctx.drawImage(portrait,-size*.5,-size*.5,size,size);
        ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.lineWidth=Math.max(2,b.r*.055);ctx.strokeStyle=b.kind?"#ffc4ef":"#b9faff";ctx.stroke();
        ctx.restore();continue;
      }
      ctx.fillStyle="#08090c";
      ctx.beginPath();ctx.arc(-b.r*.3,-b.r*.17,b.r*.095,0,Math.PI*2);ctx.arc(b.r*.3,-b.r*.17,b.r*.095,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(0,b.r*.04,b.r*.48,.18*Math.PI,.82*Math.PI);ctx.lineWidth=Math.max(3,b.r*.085);ctx.strokeStyle="#08090c";ctx.lineCap="round";ctx.stroke();
      ctx.fillStyle="#fff";ctx.font=`700 ${Math.max(9,b.r*.23)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("S",0,b.r*.67);
      ctx.restore();
    }
  }
}
