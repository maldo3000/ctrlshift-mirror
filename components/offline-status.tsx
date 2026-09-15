"use client";
import { useEffect,useState } from "react";
import { assetUrl } from "../lib/asset-url";
export function OfflineStatus(){
  const [status,setStatus]=useState("");
  const [waiting,setWaiting]=useState<ServiceWorker|null>(null);
  useEffect(()=>{
    if(document.documentElement.dataset.staticApp!=="true")return;
    if(!("serviceWorker" in navigator)){setStatus("Offline storage unavailable in this browser");return;}
    let disposed=false;
    const update=(value:string)=>{if(!disposed)setStatus(value);};
    const check=()=>{
      const worker=navigator.serviceWorker.controller;if(!worker)return;
      const channel=new MessageChannel();
      channel.port1.onmessage=event=>{update(event.data.ready?"Ready offline on this device":"Offline files missing — reconnect and reload");channel.port1.close();};
      worker.postMessage("STATUS",[channel.port2]);
    };
    update("Saving app + camera models for offline use…");
    navigator.serviceWorker.addEventListener("controllerchange",check);
    navigator.serviceWorker.register(assetUrl("sw.js"),{scope:assetUrl(""),updateViaCache:"none"}).then(reg=>{
      if(disposed)return;
      const watch=()=>{
        setWaiting(reg.waiting);
        const worker=reg.installing;
        worker?.addEventListener("statechange",()=>{
          if(disposed)return;
          if(worker.state==="installed"&&reg.waiting&&navigator.serviceWorker.controller)setWaiting(reg.waiting);
          if(worker.state==="redundant")update("Offline download failed — reconnect and reload");
          if(worker.state==="activated"){setWaiting(null);check();}
        });
      };
      watch();reg.addEventListener("updatefound",watch);check();
    }).catch(()=>update("Offline setup failed — reconnect and reload"));
    return()=>{disposed=true;navigator.serviceWorker.removeEventListener("controllerchange",check);};
  },[]);
  if(!status)return null;
  return <div className="offline-status" role="status">{status}{waiting&&<button onClick={()=>{navigator.serviceWorker.addEventListener("controllerchange",()=>location.reload(),{once:true});waiting.postMessage("ACTIVATE");}}>UPDATE READY — RELOAD</button>}</div>;
}
