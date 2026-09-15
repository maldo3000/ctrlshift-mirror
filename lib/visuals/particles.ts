import type { Point } from "../vision/types";
type Particle = { x:number;y:number;vx:number;vy:number;age:number;life:number;seed:number;size:number };
export class MotionParticles {
  private particles: Particle[] = [];
  private previous: Point[] = [];
  private lastTime = 0;
  private lastMask?: Uint8Array;
  readonly capacity = 1600;
  burst(x:number,y:number,amount:number,aspect=1) {
    const count=Math.round(700+Math.max(0,Math.min(1,amount))*650);
    // Reserve room even when movement has already filled the particle pool.
    this.particles.splice(0,Math.max(0,this.particles.length+count-this.capacity));
    for(let i=0;i<count;i++) {
      const angle=Math.random()*Math.PI*2,speed=.25+Math.random()*.85;
      this.particles.push({x,y,vx:Math.cos(angle)*speed/aspect,vy:Math.sin(angle)*speed,
        age:.15,life:1.8+Math.random()*1.7,seed:Math.random()*50,size:1.1+Math.random()*1.1});
    }
  }
  private emit(x:number,y:number,vx:number,vy:number) {
    if (this.particles.length >= this.capacity) return;
    this.particles.push({x,y,vx:vx*.3+(Math.random()-.5)*.025,vy:vy*.3+(Math.random()-.5)*.025,age:0,life:1.3+Math.random()*2.2,seed:Math.random()*50,size:.8+Math.random()*.8});
  }
  observe(points:Point[],time:number,amount:number,enabled:boolean) {
    const dt=Math.max(.03,Math.min(.2,(time-this.lastTime)/1000));
    if(enabled&&this.previous.length===points.length&&points.length) {
      for(let i=0;i<points.length;i+=2) {
        const p=points[i],q=this.previous[i],dx=p.x-q.x,dy=p.y-q.y;
        const speed=Math.hypot(dx,dy)/dt;
        if(speed>.015&&speed<2&&Math.random()<Math.min(.65,speed*3)*amount) this.emit(p.x,p.y,dx/dt,dy/dt);
      }
    }
    this.previous=points;this.lastTime=time;
  }
  observeBody(mask:Uint8Array,w:number,h:number,amount:number,enabled:boolean) {
    if(enabled&&this.lastMask?.length===mask.length) {
      for(let y=2;y<h-2;y+=3)for(let x=2;x<w-2;x+=3){
        const i=y*w+x;
        if(Math.abs(mask[i]-this.lastMask[i])>70&&Math.random()<amount*.09)this.emit(x/w,y/h,0,0);
      }
    }
    this.lastMask=mask;
  }
  update(dt:number,time:number): Float32Array {
    const output:number[]=[];
    this.particles=this.particles.filter(p=>p.age<p.life);
    for(const p of this.particles){
      p.age+=dt;
      // Continuous curl-like acceleration with damped inertia, never framewise random positions.
      p.vx+=(Math.sin(p.y*9+time*.7+p.seed)*.018-p.vx*.75)*dt;
      p.vy+=(Math.cos(p.x*8-time*.55+p.seed)*.018-p.vy*.75)*dt;
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      output.push(p.x,p.y,p.size,Math.min(1,p.age/.15)*Math.max(0,1-p.age/p.life)*.85);
    }
    return new Float32Array(output);
  }
  clear(){this.particles=[];}
}
