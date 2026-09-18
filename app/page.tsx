"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Aperture, Camera, Circle, Expand, FlipHorizontal2, Gauge, Maximize2,
  Pause, Play, ScanLine, SlidersHorizontal, Video, X,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { OfflineStatus } from "@/components/offline-status";
import { FaceTracker } from "@/lib/vision/tracker";
import { VisualRenderer } from "@/lib/visuals/renderer";
import type { EffectSettings, TrackingStatus } from "@/lib/vision/types";

type Preset = { name: string; code: string; accent: string };
const PRESETS: Preset[] = [
  { name: "Prism Skin", code: "FX.01", accent: "#ff4fd8" },
  { name: "Signal Echo", code: "FX.02", accent: "#a6ff00" },
  { name: "Heat Bloom", code: "FX.03", accent: "#ff6b00" },
  { name: "Mesh Ritual", code: "FX.04", accent: "#9c7bff" },
  { name: "Iris Drift", code: "FX.05", accent: "#36e6ff" },
  { name: "Spectral Body", code: "FX.06", accent: "#59ffd0" },
  { name: "Neon Raster", code: "FX.07", accent: "#00f5ff" },
  { name: "ASCII Signal", code: "FX.08", accent: "#8cffbc" },
  { name: "Face Bounce", code: "FX.09", accent: "#36e6ff" },
];
type EffectSet="vol14"|"all";
const EFFECT_SETS:Record<EffectSet,number[]>={vol14:[0,1,4,5,8],all:PRESETS.map((_,i)=>i)};

const Control=({label,value,setValue,disabled=false}:{label:string,value:number,setValue:(v:number)=>void,disabled?:boolean})=><label className={disabled?"control-row disabled":"control-row"}><span><b>{label}</b><output>{String(value).padStart(2,"0")}</output></span><Slider value={[value]} onValueChange={v=>setValue(v[0])} max={100} step={1} aria-label={label} disabled={disabled}/></label>;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const rendererRef = useRef<VisualRenderer | null>(null);
  const mountedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stateRef = useRef<EffectSettings>({mode:0,intensity:.72,feedback:.68,pixel:.08,threshold:.28,particles:.82,particlesEnabled:1,mirror:1,frozen:false,hasVideo:false});
  const [preset,setPreset]=useState(0),[effectSet,setEffectSet]=useState<EffectSet>("vol14"),[intensity,setIntensity]=useState(72),[feedback,setFeedback]=useState(68);
  const [pixel,setPixel]=useState(8),[threshold,setThreshold]=useState(28),[particles,setParticles]=useState(82);
  const [particleEnabled,setParticleEnabled]=useState([true,true,true,true,true,true,false,false,false]);
  const [mirror,setMirror]=useState(true),[frozen,setFrozen]=useState(false),[recording,setRecording]=useState(false);
  const [cameraStatus,setCameraStatus]=useState<"idle"|"loading"|"live"|"error">("idle");
  const [cameras,setCameras]=useState<MediaDeviceInfo[]>([]);
  const [cameraId,setCameraId]=useState("");
  const [cameraError,setCameraError]=useState("");
  const cameraBusy=useRef(false);
  const refreshCameras=useCallback(async()=>{
    try{const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput");
      if(mountedRef.current){setCameras(devices);setCameraId(id=>devices.some(d=>d.deviceId===id)?id:"");}
    }catch{/* Permission may be needed before camera names are available. */}
  },[]);
  const [faceStatus,setFaceStatus]=useState<TrackingStatus>("off");
  const [renderError,setRenderError]=useState("");
  const [trackingError,setTrackingError]=useState("");
  const [gesturesAvailable,setGesturesAvailable]=useState(false);
  const [expression,setExpression]=useState({jaw:0,smile:0});
  const [projectionMode,setProjectionMode]=useState(false),[fps,setFps]=useState(60);
  const activeSetRef=useRef(EFFECT_SETS.vol14);
  const cyclePreset=useCallback(()=>setPreset(current=>{const set=activeSetRef.current,index=set.indexOf(current);return set[(index+1+set.length)%set.length];}),[]);
  const selectEffectSet=useCallback((next:EffectSet)=>{const set=EFFECT_SETS[next];activeSetRef.current=set;setEffectSet(next);setPreset(current=>set.includes(current)?current:set[0]);},[]);
  const activePresets=EFFECT_SETS[effectSet];

  useEffect(()=>{stateRef.current={...stateRef.current,mode:preset,intensity:intensity/100,feedback:feedback/100,pixel:pixel/100,threshold:threshold/100,particles:particles/100,particlesEnabled:particleEnabled[preset]?1:0,mirror:mirror?1:0,frozen};},[preset,intensity,feedback,pixel,threshold,particles,particleEnabled,mirror,frozen]);
  useEffect(()=>{
    mountedRef.current=true;
    let renderer:VisualRenderer;
    try { renderer=new VisualRenderer(canvasRef.current!,setRenderError,cyclePreset);rendererRef.current=renderer; }
    catch(error){setRenderError(String(error));return;}
    let raf=0,frames=0,fpsAt=performance.now();
    const draw=(now:number)=>{
      if(!stateRef.current.frozen&&stateRef.current.hasVideo&&videoRef.current)trackerRef.current?.capture(videoRef.current,now);
      try { renderer.render(videoRef.current,stateRef.current,now); }
      catch(error){setRenderError(String(error));return;}
      frames++;
      if(now-fpsAt>800){setFps(Math.round(frames*1000/(now-fpsAt)));frames=0;fpsAt=now;}
      raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);
    return()=>{mountedRef.current=false;cancelAnimationFrame(raf);trackerRef.current?.stop();streamRef.current?.getTracks().forEach(t=>t.stop());renderer.dispose();rendererRef.current=null;};
  },[cyclePreset]);

  const startTracking=useCallback(()=>{
    trackerRef.current?.stop();setTrackingError("");setGesturesAvailable(false);
    try {
      trackerRef.current=new FaceTracker(message=>{
        if(!mountedRef.current)return;
        if(message.type==="ready")rendererRef.current?.setTopology(message.triangles);
        if(message.type==="frame"&&!stateRef.current.frozen){
          rendererRef.current?.accept(message,stateRef.current);
          setGesturesAvailable(!!message.gesturesAvailable);
          setExpression({jaw:message.points.length?(message.expressions.jawOpen??0):0,smile:message.points.length?((message.expressions.mouthSmileLeft??0)+(message.expressions.mouthSmileRight??0))/2:0});
        }
        if(message.type==="error")setTrackingError(message.message);
      },setFaceStatus);
    }catch(error){setFaceStatus("error");setTrackingError(String(error));}
  },[]);
  const enableCamera=useCallback(async()=>{
    if(cameraBusy.current)return;
    cameraBusy.current=true;setCameraError("");stateRef.current.hasVideo=false;
    trackerRef.current?.stop();setFaceStatus("off");setGesturesAvailable(false);
    setCameraStatus("loading");
    try{
      streamRef.current?.getTracks().forEach(t=>t.stop());
      const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30},...(cameraId?{deviceId:{exact:cameraId}}:{facingMode:"user"})},audio:false});
      if(!mountedRef.current){stream.getTracks().forEach(t=>t.stop());return;}
      streamRef.current=stream;
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      stateRef.current.hasVideo=true;setCameraStatus("live");startTracking();
      await refreshCameras();
      const actual=stream.getVideoTracks()[0].getSettings().deviceId??"";setCameraId(actual);
      try{localStorage.setItem("signal-camera",actual);}catch{}
      stream.getVideoTracks()[0].onended=()=>{if(mountedRef.current){stateRef.current.hasVideo=false;setCameraStatus("error");setCameraError("Camera disconnected. Reconnect it, select it below, then enable camera.");trackerRef.current?.stop();setFaceStatus("off");setGesturesAvailable(false);void refreshCameras();}};
    }catch(error){stateRef.current.hasVideo=false;if(mountedRef.current){setCameraStatus("error");setFaceStatus("off");setCameraError(error instanceof DOMException&&error.name==="NotAllowedError"?"Camera permission denied. Allow access in the browser and Windows privacy settings.":"Could not open the selected camera. Check its USB connection, close other camera apps, or select another camera.");}}
    finally{cameraBusy.current=false;}
  },[startTracking,cameraId,refreshCameras]);
  useEffect(()=>{
    try{setCameraId(localStorage.getItem("signal-camera")??"");}catch{}
    void refreshCameras();
    navigator.mediaDevices?.addEventListener("devicechange",refreshCameras);
    return()=>navigator.mediaDevices?.removeEventListener("devicechange",refreshCameras);
  },[refreshCameras]);
  const snapshot=()=>{const a=document.createElement("a");a.download=`signal-mirror-${Date.now()}.png`;a.href=canvasRef.current!.toDataURL("image/png");a.click();};
  const toggleRecord=()=>{if(recording){recorderRef.current?.stop();setRecording(false);return;}const canvas=canvasRef.current;if(!canvas||!("MediaRecorder"in window))return;const mimeType=["video/webm;codecs=vp9","video/webm","video/mp4"].find(type=>MediaRecorder.isTypeSupported(type));const recorder=new MediaRecorder(canvas.captureStream(30),mimeType?{mimeType}:undefined);chunksRef.current=[];recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data);};recorder.onstop=()=>{const url=URL.createObjectURL(new Blob(chunksRef.current,{type:recorder.mimeType})),a=document.createElement("a");a.href=url;a.download=`signal-mirror-${Date.now()}.${recorder.mimeType.includes("mp4")?"mp4":"webm"}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};recorder.start();recorderRef.current=recorder;setRecording(true);};
  const toggleProjection=useCallback(async()=>{if(projectionMode){if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});setProjectionMode(false);}else{await document.documentElement.requestFullscreen?.().catch(()=>{});setProjectionMode(true);}},[projectionMode]);
  useEffect(()=>{const change=()=>{if(!document.fullscreenElement)setProjectionMode(false);};document.addEventListener("fullscreenchange",change);return()=>document.removeEventListener("fullscreenchange",change);},[]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||(e.target instanceof HTMLElement&&e.target.closest("input,textarea,select,button,[contenteditable=true],[role=slider],[role=switch]")))return;if(e.key.toLowerCase()==="f")toggleProjection();if(e.key.toLowerCase()==="p")setFrozen(v=>!v);if(e.code==="Space"){e.preventDefault();cyclePreset();}if(/^[1-9]$/.test(e.key)){const index=Number(e.key)-1,target=activeSetRef.current[index];if(target!==undefined)setPreset(target);}};addEventListener("keydown",key);return()=>removeEventListener("keydown",key);},[toggleProjection,cyclePreset]);
  useEffect(()=>{
    type ToolInput={preset?:number;intensity?:number;echo?:number;pixelate?:number;threshold?:number;particles?:number;particlesEnabled?:boolean};
    type ModelContext={registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>object},options:{signal:AbortSignal})=>void|Promise<void>};
    const context=(document as Document&{modelContext?:ModelContext}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const bounded=(v:unknown)=>typeof v==="number"&&v>=0&&v<=100;
    void Promise.resolve(context.registerTool({
      name:"configure_visual_patch",
      title:"Configure visual patch",
      description:"Select one of the nine visual presets and optionally tune its effect values.",
      inputSchema:{type:"object",properties:{preset:{type:"integer",minimum:1,maximum:9},intensity:{type:"number",minimum:0,maximum:100},echo:{type:"number",minimum:0,maximum:100},pixelate:{type:"number",minimum:0,maximum:100},threshold:{type:"number",minimum:0,maximum:100},particles:{type:"number",minimum:0,maximum:100},particlesEnabled:{type:"boolean"}},additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute(input:unknown){
        if(!input||typeof input!=="object")throw new Error("Input must be an object.");
        const value=input as ToolInput;
        if(value.preset!==undefined&&(!Number.isInteger(value.preset)||value.preset<1||value.preset>9))throw new Error("Preset must be 1–9.");
        for(const key of ["intensity","echo","pixelate","threshold","particles"] as const)if(value[key]!==undefined&&!bounded(value[key]))throw new Error(`${key} must be 0–100.`);
        if(value.particlesEnabled!==undefined&&typeof value.particlesEnabled!=="boolean")throw new Error("particlesEnabled must be true or false.");
        const targetPreset=value.preset!==undefined?value.preset-1:preset;
        if(value.preset!==undefined)setPreset(value.preset-1);
        if(value.intensity!==undefined)setIntensity(value.intensity);
        if(value.echo!==undefined)setFeedback(value.echo);
        if(value.pixelate!==undefined)setPixel(value.pixelate);
        if(value.threshold!==undefined)setThreshold(value.threshold);
        if(value.particles!==undefined)setParticles(value.particles);
        if(value.particlesEnabled!==undefined)setParticleEnabled(current=>current.map((enabled,index)=>index===targetPreset?value.particlesEnabled!:enabled));
        return {status:"configured",preset:value.preset??preset+1};
      }
    },{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[preset]);

  return <main className={projectionMode?"app projection":"app"} style={{"--accent":PRESETS[preset].accent} as React.CSSProperties}>
    <video ref={videoRef} muted playsInline className="source-video"/>
    <header className="topbar chrome"><div className="brand"><div><strong>SIGNAL MIRROR</strong><small>GESTURE INSTRUMENT / 003</small></div></div><div className="top-status"><span className={cameraStatus==="live"?"live-dot on":"live-dot"}/>{cameraStatus==="live"?"CAMERA ONLINE":"GENERATIVE FEED"}<i/>{fps} FPS<i/>WEBGL</div><button className="project-button" onClick={toggleProjection}><Maximize2 size={16}/>PROJECT <kbd>F</kbd></button></header>
    <section className="workspace">
      <aside className="presets chrome" aria-label="Effect presets"><div className="panel-title"><Aperture size={16}/><span>PATCH SELECT</span></div><div className="set-tabs" aria-label="Effect set"><button className={effectSet==="vol14"?"active":""} onClick={()=>selectEffectSet("vol14")}>VOL 14</button><button className={effectSet==="all"?"active":""} onClick={()=>selectEffectSet("all")}>ALL FX</button></div><div className="preset-list">{activePresets.map((i,position)=>{const p=PRESETS[i];return <button key={p.code} onClick={()=>setPreset(i)} className={preset===i?"preset active":"preset"}><span>{p.code}</span><b>{p.name}</b><em>{String(position+1).padStart(2,"0")}</em></button>;})}</div><div className="signal-chain"><small>{effectSet==="vol14"?"VOL 14 / 05 PATCHES":"SIGNAL PATH"}</small><div><span>CAM</span><i/><span>GLSL</span><i/><span>OUT</span></div></div></aside>
      <section className="viewport" aria-label="Live visual output"><canvas ref={canvasRef} tabIndex={0} aria-label="CTRL+SHIFT camera output. Space changes filter, P freezes, F projects."/><div className="frame-corners" aria-hidden="true"><i/><i/><i/><i/></div><div className="viewport-meta chrome"><span>OUT.01</span><span>1920 × 1080</span><span className={faceStatus==="tracking"?"face-lock locked":"face-lock"}>{faceStatus==="tracking"?"478 POINTS / FACE LOCK":faceStatus==="loading"?"LOADING FACE MESH…":faceStatus==="error"?"TRACKING UNAVAILABLE":"SEARCHING FACE"}</span></div>
        {renderError&&<div className="renderer-error" role="alert"><strong>OUTPUT UNAVAILABLE</strong><p>{renderError}</p><button onClick={()=>location.reload()}>RELOAD OUTPUT</button></div>}
        {cameraStatus!=="live"&&<div className="camera-gate chrome"><div className="gate-icon"><ScanLine size={32}/></div><p>{cameraStatus==="error"?"CAMERA BLOCKED":"ACTIVATE LIVE INPUT"}</p><span>{cameraStatus==="error"?"Allow camera access in your browser, then try again.":"Your video stays on this device. Nothing is uploaded."}</span><button onClick={enableCamera} disabled={cameraStatus==="loading"}><Video size={17}/>{cameraStatus==="loading"?"CONNECTING…":cameraStatus==="error"?"TRY AGAIN":"ENABLE CAMERA"}</button></div>}
        <div className="mode-label"><small>{PRESETS[preset].code}</small><strong>{PRESETS[preset].name}</strong></div>
      </section>
      <aside className="controls chrome" aria-label="Effect controls"><div className="panel-title"><SlidersHorizontal size={16}/><span>OPERATORS</span></div><div className="camera-picker"><label htmlFor="camera-select">CAMERA INPUT</label><select id="camera-select" value={cameraId} disabled={cameraStatus==="loading"} onChange={e=>setCameraId(e.target.value)}><option value="">System default camera</option>{cameras.filter(c=>c.deviceId).map((c,i)=><option key={c.deviceId} value={c.deviceId}>{c.label||`Camera ${i+1}`}</option>)}</select><button onClick={()=>void enableCamera()} disabled={cameraStatus==="loading"}>{cameraStatus==="loading"?"CONNECTING…":cameraStatus==="live"?"APPLY CAMERA":"ENABLE CAMERA"}</button><button onClick={()=>void refreshCameras()}>REFRESH CAMERAS</button>{cameraError&&<p role="alert">{cameraError}</p>}<OfflineStatus/></div><div className="control-stack"><Control label="INTENSITY" value={intensity} setValue={setIntensity}/><Control label="TRAIL MEMORY" value={feedback} setValue={setFeedback} disabled={preset===7}/><Control label="POINT DENSITY" value={particles} setValue={setParticles} disabled={!particleEnabled[preset]}/><Control label={preset===7?"CHARACTER SIZE":"PIXELATE"} value={pixel} setValue={setPixel}/><Control label="THRESHOLD" value={threshold} setValue={setThreshold}/></div><div className="toggle-row"><span><Circle size={15}/>PARTICLES / {PRESETS[preset].code}</span><Switch checked={particleEnabled[preset]} onCheckedChange={checked=>setParticleEnabled(current=>current.map((enabled,index)=>index===preset?checked:enabled))} aria-label={`Particles for ${PRESETS[preset].name}`}/></div><div className="toggle-row"><span><FlipHorizontal2 size={15}/>MIRROR INPUT</span><Switch checked={mirror} onCheckedChange={setMirror} aria-label="Mirror camera input"/></div><div className="scope" aria-hidden="true"><span>SIGNAL LEVEL</span><div>{Array.from({length:24}).map((_,i)=><i key={i} style={{height:`${18+Math.abs(Math.sin(i*.74+preset))*58}%`}}/>)}</div></div><div className="expression-readout"><span>SMILE <meter min="0" max="1" value={expression.smile}/></span><span>MOUTH <meter min="0" max="1" value={expression.jaw}/></span></div>{faceStatus==="error"?<div className="tracking-error" role="status"><p>Face tracking unavailable. The camera effects still run.</p><button onClick={startTracking}>RETRY FACE TRACKING</button><details><summary>Details</summary>{trackingError}</details></div>:<p className="tip"><Gauge size={14}/>{preset===8?"Move your hands, arms or body through the portraits to bat them around. Silhouette contact works even when fingers are not detected. Hold a hand or arm over the glowing button to switch; move away to re-arm.":<>Smile shifts color in Prism Skin, Heat Bloom and ASCII Signal. {gesturesAvailable?"Thumbs up triggers a burst on every filter. Lower your hand to re-arm. Hold a hand or arm over the finger button on the right edge until it fills, then move away before switching again. The particles toggle controls ambient motion only.":"Hand gestures are loading or unavailable. Silhouette contact can still switch filters: hold a hand or arm over the right-edge button, then move away. Space is the manual fallback."}</>}</p>}</aside>
    </section>
    <footer className="transport chrome"><div className="transport-left"><button onClick={()=>setFrozen(v=>!v)} className={frozen?"active":""}>{frozen?<Play size={15}/>:<Pause size={15}/>} {frozen?"RESUME":"FREEZE"}<kbd>P</kbd></button><button onClick={cyclePreset}>NEXT PATCH<kbd>SPACE</kbd></button><button onClick={snapshot}><Camera size={15}/>SNAPSHOT</button><button onClick={toggleRecord} className={recording?"recording":""}><span className="rec-dot"/>{recording?"STOP + SAVE":"RECORD LOOP"}</button></div><div className="timeline"><span>00:00:LIVE</span><div><i/></div><span>∞ LIVE</span></div><div className="transport-right"><span>{effectSet==="vol14"?"VOL 14 INSTALLATION":"INSTALLATION MODE"}</span><button onClick={toggleProjection}><Expand size={15}/>FULL OUTPUT</button></div></footer>
    {projectionMode&&<button className="exit-projection" onClick={toggleProjection} aria-label="Exit projection mode"><X size={18}/>EXIT</button>}<div className="noise" aria-hidden="true"/>
  </main>;
}
