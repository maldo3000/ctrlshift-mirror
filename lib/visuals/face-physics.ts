import type { Point, TrackingFrame } from "../vision/types";

type Body={x:number;y:number;vx:number;vy:number;r:number;angle:number;spin:number;color:string;kind:number};
type Collider={x:number;y:number;vx:number;vy:number;r:number};

// Lightweight 2D physics for the VOL 14 placeholder portraits. The vector faces can
// later be replaced by Josh/Sid image textures without changing the collision model.
export class FacePhysics {
  private bodies:Body[]=[];
  private width=0;private height=0;
  private previous=new Map<string,{x:number;y:number}>();
  reset(width:number,height:number){
    this.width=width;this.height=height;this.previous.clear();
    const count=Math.max(8,Math.min(14,Math.round(width/135)));
    this.bodies=Array.from({length:count},(_,i)=>{
      const r=Math.max(24,Math.min(48,Math.min(width,height)*(.038+(i%3)*.004)));
      return {x:r+(i*173%(Math.max(1,width-r*2))),y:r+(i*97%(Math.max(1,height*.48))),vx:((i%5)-2)*24,vy:-20-(i%4)*15,r,angle:i*.7,spin:(i%2?1:-1)*(.45+(i%4)*.12),color:i%2?"#ff4fd8":"#36e6ff",kind:i%2};
    });
  }
  private collider(key:string,x:number,y:number,r:number,dt:number):Collider{
    const old=this.previous.get(key);this.previous.set(key,{x,y});
    return {x,y,r,vx:old?(x-old.x)/Math.max(.016,dt):0,vy:old?(y-old.y)/Math.max(.016,dt):0};
  }
  update(dt:number,width:number,height:number,points:Point[],hands:TrackingFrame["hands"],mirror:boolean){
    if(!this.bodies.length||Math.abs(width-this.width)>2||Math.abs(height-this.height)>2)this.reset(width,height);
    const colliders:Collider[]=[];
    if(points.length>=468){
      const map=(p:Point)=>({x:(mirror?1-p.x:p.x)*width,y:p.y*height});
      const nose=map(points[1]),left=map(points[234]),right=map(points[454]);
      colliders.push(this.collider("face",nose.x,nose.y,Math.max(42,Math.hypot(right.x-left.x,right.y-left.y)*.6),dt));
    }
    for(const [i,hand] of (hands??[]).entries()){
      const p=hand.indexTip??hand.tip,x=(mirror?1-p.x:p.x)*width,y=p.y*height;
      colliders.push(this.collider(`hand-${i}`,x,y,Math.max(30,Math.min(width,height)*.045),dt));
    }
    const step=Math.min(.032,Math.max(.001,dt));
    for(const b of this.bodies){
      b.vy+=height*.23*step;b.vx*=Math.pow(.988,step*60);b.vy*=Math.pow(.994,step*60);
      b.x+=b.vx*step;b.y+=b.vy*step;b.angle+=b.spin*step;
      if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*.84;}else if(b.x>width-b.r){b.x=width-b.r;b.vx=-Math.abs(b.vx)*.84;}
      if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy)*.82;}else if(b.y>height-b.r){b.y=height-b.r;b.vy=-Math.abs(b.vy)*.82;b.vx*=.95;}
      for(const c of colliders){
        const dx=b.x-c.x,dy=b.y-c.y,d=Math.hypot(dx,dy),min=b.r+c.r;
        if(d>=min)continue;
        const nx=d>.001?dx/d:1,ny=d>.001?dy/d:0,push=min-d;
        b.x+=nx*push;b.y+=ny*push;
        const impact=Math.max(120,Math.min(950,Math.hypot(c.vx,c.vy)*.72+230));
        b.vx=nx*impact+c.vx*.52;b.vy=ny*impact+c.vy*.52;b.spin+=(nx*c.vy-ny*c.vx)*.006;
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
      ctx.fillStyle="#08090c";
      ctx.beginPath();ctx.arc(-b.r*.3,-b.r*.17,b.r*.095,0,Math.PI*2);ctx.arc(b.r*.3,-b.r*.17,b.r*.095,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(0,b.r*.04,b.r*.48,.18*Math.PI,.82*Math.PI);ctx.lineWidth=Math.max(3,b.r*.085);ctx.strokeStyle="#08090c";ctx.lineCap="round";ctx.stroke();
      ctx.fillStyle="#fff";ctx.font=`700 ${Math.max(9,b.r*.23)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(b.kind?"S":"J",0,b.r*.67);
      ctx.restore();
    }
  }
}
