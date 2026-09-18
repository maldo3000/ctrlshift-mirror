import type { TrackingFrame, Point } from "./types";

export class EyeLaserTrigger {
  private active = false;
  private heldFor = 0;
  private baseline = .26;
  strength = 0;
  update(blend: Record<string, number>, tracking: boolean, dt: number, points: Point[] = [], aspect = 1) {
    const wide = ((blend.eyeWideLeft ?? 0) + (blend.eyeWideRight ?? 0)) / 2;
    const blink = Math.min(blend.eyeBlinkLeft ?? 0, blend.eyeBlinkRight ?? 0);
    const distance=(a:number,b:number)=>Math.hypot((points[a].x-points[b].x)*aspect,points[a].y-points[b].y);
    const aperture=points.length>=468?Math.min(distance(159,145)/Math.max(.001,distance(33,133)),distance(386,374)/Math.max(.001,distance(362,263))):0;
    if (!tracking || blink > .7 || (points.length>=468&&aperture<.10)) {
      this.active = false; this.heldFor = 0; this.strength = 0;
      return 0;
    }
    // Blendshape scores vary by face: also detect opening relative to relaxed eyelids.
    const geometric=aperture>Math.max(.23,this.baseline*1.16);
    const wantsLaser=wide>.12||geometric;
    this.heldFor = wantsLaser ? this.heldFor + dt : 0;
    if (this.heldFor >= .06) this.active = true;
    if (wide < .07 && aperture<Math.max(.21,this.baseline*1.07)) this.active = false;
    if(!this.active&&aperture>.12&&aperture<.4)this.baseline+=(aperture-this.baseline)*(1-Math.exp(-dt*1.5));
    const target = this.active ? 1 : 0;
    this.strength += (target - this.strength) * (1 - Math.exp(-dt * 22));
    return this.strength;
  }
}

// CSS-pixel geometry shared by rendering and hit testing at every output size.
export function cornerButton(width:number,height:number) {
  const radius=Math.max(26,Math.min(54,Math.min(width,height)*.064));
  return {x:width-radius-Math.max(24,width*.045),y:height/2,radius};
}
export class CornerTrigger {
  progress = 0;
  touching = false;
  private dwell = 0;
  private sample = -Infinity;
  private held = false;
  private outside = -1;
  private bodyArmed = false;
  private bodyClear = -1;
  observe(hands: NonNullable<TrackingFrame["hands"]>, time: number, mirror: boolean, width=1280, height=720, bodyContact=false, bodyFresh=false) {
    if (time <= this.sample) return false;
    const gap=time-this.sample;
    if (gap > 900) { this.dwell = 0; this.progress = 0; this.touching=false; this.bodyArmed=false;this.bodyClear=-1; }
    this.sample = time;
    if(!bodyFresh){this.bodyArmed=false;this.bodyClear=-1;}
    else if(!bodyContact){
      if(this.bodyClear<0)this.bodyClear=time;
      if(time-this.bodyClear>=400)this.bodyArmed=true;
    }else this.bodyClear=-1;
    const b = cornerButton(width,height);
    const inside = (bodyFresh&&bodyContact&&this.bodyArmed)||hands.some(hand => {
      const p = hand.indexTip;
      if (!p) return false;
      const x = mirror ? 1 - p.x : p.x;
      return Math.hypot(x*width-b.x,p.y*height-b.y)<=b.radius+(this.touching?12:5);
    });
    if (!inside) {
      this.dwell = 0; this.progress = 0; this.touching=false;
      if (this.outside < 0) this.outside = time;
      if (time - this.outside >= 400) this.held = false;
      return false;
    }
    this.outside = -1;
    const wasTouching=this.touching;this.touching=true;
    if (this.held) return false;
    // Accumulate observed contact, not inference latency or a single stalled frame.
    if(wasTouching)this.dwell+=Math.min(200,gap);
    this.progress = Math.min(1, this.dwell / 750);
    if (this.progress < 1) return false;
    this.held = true;
    this.bodyArmed=false;
    return true;
  }
  fresh(time: number) { return time - this.sample < 900; }
}

// A held pose fires once; brief recognition dropouts don't re-arm the explosion.
export class ThumbTrigger {
  private held = false;
  private since = -1;
  private released = -1;
  private last = -Infinity;
  private sample = -Infinity;
  observe(hands: NonNullable<TrackingFrame["hands"]>, time: number): Point | undefined {
    if (time <= this.sample) return;
    if (time - this.sample > 600) this.since = -1;
    this.sample = time;
    const hand = hands.find(h => h.name === "Thumb_Up" && h.score >= .7);
    if (!hand) {
      this.since = -1;
      if (this.released < 0) this.released = time;
      if (time - this.released >= 350) this.held = false;
      return;
    }
    this.released = -1;
    if (this.since < 0) this.since = time;
    if (!this.held && time - this.since >= 120 && time - this.last >= 1000) {
      this.held = true; this.last = time;
      return hand.tip;
    }
  }
}
