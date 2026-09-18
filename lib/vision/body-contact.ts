import { cornerButton } from "./gestures";

// Camera-space confidence mask. Never retain it indefinitely after tracking stops.
export class BodyContact {
  private mask?: Uint8Array;
  private width=0; private height=0; private at=-Infinity;
  private usable=false;
  observe(mask:Uint8Array,width:number,height:number,time:number) {
    this.mask=mask;this.width=width;this.height=height;this.at=time;
    let occupied=0;
    for(const value of mask)if(value>140)occupied++;
    const coverage=occupied/Math.max(1,mask.length);
    // Reject a flooded mask (e.g. lens covered or a badly exposed projection).
    this.usable=mask.length===width*height&&coverage<.85;
  }
  fresh(time:number){return this.usable&&time-this.at<350;}
  private sample(x:number,y:number,mirror:boolean){
    if(!this.mask||x<0||x>1||y<0||y>1)return false;
    const ix=Math.min(this.width-1,Math.floor((mirror?1-x:x)*this.width));
    const iy=Math.min(this.height-1,Math.floor(y*this.height));
    return this.mask[iy*this.width+ix]>140;
  }
  button(width:number,height:number,mirror:boolean,time:number){
    if(!this.fresh(time)||width<=0||height<=0)return false;
    const b=cornerButton(width,height);let hits=0,total=0;
    // A forgiving halo, still requiring multiple foreground samples, not one noisy pixel.
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)if(x*x+y*y<=4){
      total++;if(this.sample((b.x+x*b.radius*.65)/width,(b.y+y*b.radius*.65)/height,mirror))hits++;
    }
    return hits/total>=.23;
  }
  contact(x:number,y:number,r:number,width:number,height:number,mirror:boolean,time:number){
    if(!this.fresh(time))return;
    let hits=0,nx=0,ny=0;
    for(let iy=-2;iy<=2;iy++)for(let ix=-2;ix<=2;ix++)if(ix*ix+iy*iy<=4){
      if(this.sample((x+ix*r*.55)/width,(y+iy*r*.55)/height,mirror)){hits++;nx-=ix;ny-=iy;}
    }
    if(hits<2)return;
    const length=Math.hypot(nx,ny);
    // If engulfed by the silhouette, lift out instead of leaving a stuck object.
    return length>.01?{x:nx/length,y:ny/length}:{x:0,y:-1};
  }
}
