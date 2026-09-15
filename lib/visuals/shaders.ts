export const FULLSCREEN_VERTEX = `
attribute vec2 a_position; varying vec2 v_uv;
void main(){ v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.); }
`;
export const BASE_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_video, u_previous, u_body, u_ascii;
uniform vec2 u_resolution, u_face, u_leftEye, u_rightEye, u_motion;
uniform float u_time, u_mode, u_intensity, u_feedback, u_pixel, u_threshold, u_mirror, u_videoReady, u_bodyReady, u_lock, u_jaw, u_smile, u_blink, u_yaw;
vec3 palette(float t){return .5+.5*cos(6.28318*(t+vec3(.02,.34,.64)));}
float luminance(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec2 sourceUv(vec2 uv){return vec2(mix(uv.x,1.-uv.x,u_mirror),uv.y);}
vec3 source(vec2 uv){
  if(u_videoReady>.5){float grid=mix(900.,65.,u_pixel);uv=mix(uv,(floor(uv*grid)+.5)/grid,u_pixel);return texture2D(u_video,clamp(sourceUv(uv),.001,.999)).rgb;}
  vec2 p=uv-.5; float t=u_time*.22;
  float field=sin(p.x*7.+sin(p.y*9.+t)*2.+t)+cos(p.y*8.-t+p.x*3.);
  return palette(field*.2+t*.08)*(.22+.22*cos(field*2.));
}
float body(vec2 uv){return texture2D(u_body,vec2(sourceUv(uv).x,1.-uv.y)).r;}
void main(){
  vec2 uv=v_uv; vec2 px=1./u_resolution;
  float t=u_time, k=u_intensity;
  if(u_mode>6.5){
    // Character selection is constant across each cell; glyphs stay crisp as the subject moves.
    float cellWidth=mix(7.,24.,u_pixel)*max(1.,u_resolution.x/1280.);
    vec2 cell=vec2(cellWidth,cellWidth*1.6);
    vec2 center=(floor(gl_FragCoord.xy/cell)+.5)*cell/u_resolution;
    vec3 sampleColor=source(center);
    float light=smoothstep(u_threshold*.35,.92,luminance(sampleColor));
    float index=min(9.,floor(pow(light,.7)*10.));
    vec2 glyphUv=fract(gl_FragCoord.xy/cell);
    float ink=texture2D(u_ascii,vec2((index+glyphUv.x)/10.,glyphUv.y)).a;
    vec3 tint=mix(vec3(.55,1.,.74),vec3(.45,.85,1.),smoothstep(.15,.7,u_smile));
    gl_FragColor=vec4(tint*ink*(.5+light*.7)*(.6+k*.8),1.);
    return;
  }
  vec3 raw=source(uv); float l=luminance(raw);
  float dx=luminance(source(uv+vec2(px.x*2.,0.)))-luminance(source(uv-vec2(px.x*2.,0.)));
  float dy=luminance(source(uv+vec2(0.,px.y*2.)))-luminance(source(uv-vec2(0.,px.y*2.)));
  float edge=smoothstep(.015+u_threshold*.06,.3,length(vec2(dx,dy))*3.);
  float person=mix(smoothstep(.08,.45,l),smoothstep(.25,.8,body(uv)),u_bodyReady);
  vec3 col=raw*.6;
  if(u_mode<.5){
    vec2 shift=vec2(.003+k*.008+u_smile*.008,0.);
    col=vec3(source(uv+shift).r,raw.g,source(uv-shift).b)*.72;
    col+=palette(l*.7+t*.03+smoothstep(.12,.65,u_smile)*.5)*edge*.6;
  }else if(u_mode<1.5){
    col=vec3(.06,1.,.58)*(l*.3+edge*.75)*(.25+.75*person);
  }else if(u_mode<2.5){
    col=palette(l*.63-.18+u_jaw*.07+smoothstep(.12,.65,u_smile)*.45)*smoothstep(u_threshold*.35,.85,l)*(.25+.85*person);
  }else if(u_mode<3.5){
    col=raw*.13+vec3(.27,.13,.65)*edge*.45;
  }else if(u_mode<4.5){
    col=raw*.4;
    vec2 a=vec2(u_resolution.x/u_resolution.y,1.);
    float eyes=min(length((uv-u_leftEye)*a),length((uv-u_rightEye)*a));
    float rays=exp(-eyes*19.)*u_lock*(1.-u_blink*.7);
    col+=palette(eyes*5.-t*.13)*rays*(.2+.45*k);
  }else if(u_mode<5.5){
    vec2 e=vec2(.004,.006);
    float contour=abs(body(uv+vec2(e.x,0.))-body(uv-vec2(e.x,0.)))+abs(body(uv+vec2(0.,e.y))-body(uv-vec2(0.,e.y)));
    float bands=1.-smoothstep(.015,.12,abs(fract(l*9.+t*.04)-.5));
    col=raw*(.1+person*.16)+vec3(.06,.92,.7)*(edge*.5+bands*person*.34);
    col+=vec3(.7,1.,.92)*contour*u_bodyReady;
  }else{
    vec2 p=uv-.5; vec2 crt=p*(1.+dot(p,p)*.15)+.5;
    float roll=exp(-abs(fract(crt.y+t*.1)-.5)*65.);
    crt.x+=sin(crt.y*85.+t*.9)*.0015*k;
    float light=luminance(source(crt));
    float scan=.27+.73*pow(.5+.5*sin(gl_FragCoord.y*2.15),1.6);
    col=vec3(.015,1.,1.)*(light*.85+edge*.5)*scan;
    col+=vec3(.0,.8,1.)*roll*(.08+light*.38)*(1.+k);
    col*=step(0.,crt.x)*step(crt.x,1.)*step(0.,crt.y)*step(crt.y,1.);
  }
  // Persistent ping-pong feedback: previous silhouettes expand and advect with movement.
  float history=(u_mode> .5&&u_mode<1.5)? .995 : ((u_mode>4.5&&u_mode<5.5)? .99:.65);
  vec2 pastUv=(uv-u_face)/(1.+.006+u_feedback*.017)+u_face-u_motion*.07;
  vec3 past=texture2D(u_previous,clamp(pastUv,.001,.999)).rgb;
  past=mix(past,past.gbr,.015+abs(u_yaw)*.015);
  col=max(col,past*history*mix(.7,.985,u_feedback)*step(.001,u_feedback));
  float vignette=1.-smoothstep(.36,.79,length((v_uv-.5)*vec2(.8,1.)));
  gl_FragColor=vec4(max(col,0.)*(.72+.28*vignette),1.);
}
`;
export const MESH_VERTEX = `
attribute vec3 a_position; attribute vec3 a_barycentric;
uniform float u_mirror,u_faceScale; uniform vec3 u_origin; varying vec3 v_bary; varying vec3 v_position; varying vec2 v_uv;
void main(){
  vec2 uv=vec2(mix(a_position.x,1.-a_position.x,u_mirror),1.-a_position.y);
  v_uv=uv;v_position=(a_position-u_origin)/max(.05,u_faceScale);v_bary=a_barycentric;
  gl_Position=vec4(uv*2.-1.,0.,1.);
}
`;
export const MESH_FRAGMENT = `
precision highp float;
varying vec3 v_bary,v_position; varying vec2 v_uv;
uniform float u_mode,u_time,u_intensity,u_lock,u_jaw,u_smile,u_blink,u_yaw;
vec3 palette(float t){return .5+.5*cos(6.28318*(t+vec3(.03,.35,.68)));}
void main(){
  float edge=1.-smoothstep(.012,.065,min(v_bary.x,min(v_bary.y,v_bary.z)));
  float depth=v_position.z*3.;float t=u_time;
  float flow=sin(v_position.x*21.+depth*2.+t*.65+u_jaw*4.);
  vec3 color; float alpha;
  if(u_mode<.5){color=palette(depth*.32+flow*.12+t*.04+u_smile*.2);alpha=.25+edge*.24;}
  else if(u_mode<1.5){color=vec3(.16,1.,.6);alpha=edge*.32;}
  else if(u_mode<2.5){color=palette(depth*.16+u_jaw*.12+.12);alpha=.22+edge*.12;}
  else if(u_mode<3.5){color=palette(depth*.35+t*.035+smoothstep(.12,.65,u_smile)*.5);alpha=.06+edge*.87;}
  else if(u_mode<4.5){color=vec3(.13,.75,1.);alpha=edge*.08;}
  else if(u_mode<5.5){color=palette(depth*.4+t*.035);alpha=edge*.3;}
  else{float scan=pow(.5+.5*sin(gl_FragCoord.y*2.15),2.);color=vec3(.05,1.,1.);alpha=(edge*.24+scan*.12)*(1.+u_jaw*.4);}
  gl_FragColor=vec4(color,alpha*u_lock*(.35+u_intensity*.65));
}
`;
export const PARTICLE_VERTEX = `
attribute vec4 a_particle; uniform float u_mirror,u_scale; varying float v_alpha;
void main(){gl_Position=vec4(vec2(mix(a_particle.x,1.-a_particle.x,u_mirror),1.-a_particle.y)*2.-1.,0.,1.);gl_PointSize=a_particle.z*u_scale;v_alpha=a_particle.w;}
`;
export const PARTICLE_FRAGMENT = `
precision mediump float; uniform vec3 u_color; varying float v_alpha;
void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(u_color,a*v_alpha);}
`;
export const COPY_FRAGMENT = `precision mediump float; varying vec2 v_uv;uniform sampler2D u_frame;void main(){gl_FragColor=texture2D(u_frame,v_uv);}`;
export const LASER_FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_resolution,u_leftEye,u_rightEye;
uniform float u_power,u_time,u_yaw;
vec3 beam(vec2 origin,vec2 direction){
  vec2 p=(v_uv-origin)*u_resolution;
  float along=dot(p,direction);
  float across=abs(p.x*direction.y-p.y*direction.x);
  float scale=max(1.,u_resolution.y/900.);
  float core=exp(-pow(across/(3.*scale),2.));
  float glow=exp(-across/(22.*scale));
  float gate=smoothstep(-2.*scale,5.*scale,along);
  float flow=.88+.12*sin(along*.018-u_time*5.);
  vec3 ray=(vec3(1.,.88,.65)*core*2.4+vec3(1.,.025,.005)*glow*1.4)*gate*flow;
  float flare=exp(-length(p)/(22.*scale));
  return ray+vec3(1.,.08,.015)*flare*2.;
}
void main(){
  // Both eyes fire in the same projected direction, steered by head rotation.
  vec2 direction=normalize(vec2(.65+u_yaw*2.,.3));
  vec3 light=beam(u_leftEye,direction)+beam(u_rightEye,direction);
  gl_FragColor=vec4(light*u_power,1.);
}`;
export const BRAND_FRAGMENT = `precision mediump float;
varying vec2 v_uv;uniform sampler2D u_brand;uniform vec4 u_bounds;
void main(){vec2 uv=(v_uv-u_bounds.xy)/u_bounds.zw;if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)discard;vec4 mark=texture2D(u_brand,uv);gl_FragColor=vec4(1.,1.,1.,mark.a);}`;
