import type { TrackingStatus, VisionMessage } from "./types";
import { assetUrl } from "../asset-url";

export class FaceTracker {
  private worker: Worker;
  private ready = false;
  private busy = false;
  private stopped = false;
  private videoTime = -1;
  private sentAt = 0;
  private watchdog: ReturnType<typeof setTimeout>;
  constructor(private onMessage: (message: VisionMessage) => void, private onStatus: (status: TrackingStatus) => void) {
    this.onStatus("loading");
    this.worker = new Worker(assetUrl("vision-worker.js"));
    this.watchdog = setTimeout(() => this.fail("Face tracking took too long to start. Retry tracking."), 45000);
    this.worker.onerror = event => this.fail(event.message || "Tracking worker failed");
    this.worker.onmessage = ({ data }: MessageEvent<VisionMessage>) => {
      if (this.stopped) return;
      if (data.type === "ready") { clearTimeout(this.watchdog); this.ready = true; this.onStatus("searching"); }
      if (data.type === "frame") { clearTimeout(this.watchdog); this.busy = false; this.onStatus(data.points.length ? "tracking" : "searching"); }
      if (data.type === "error") { this.fail(data.message); return; }
      this.onMessage(data);
    };
    this.worker.postMessage({ type: "init", origin: assetUrl("").replace(/\/$/,"") });
  }
  private fail(message: string) {
    if (this.stopped) return;
    this.stop(); this.onStatus("error"); this.onMessage({ type: "error", message });
  }
  // Backpressure: at most one transferred image is ever waiting for inference.
  capture(video: HTMLVideoElement, now: number) {
    if (this.stopped || !this.ready || this.busy || video.readyState < 2 || video.currentTime === this.videoTime || now - this.sentAt < 45) return;
    this.busy = true; this.sentAt = now; this.videoTime = video.currentTime;
    const width = Math.min(640, video.videoWidth);
    void createImageBitmap(video, { resizeWidth: width, resizeHeight: Math.round(width * video.videoHeight / video.videoWidth) }).then(bitmap => {
      if (this.stopped) { bitmap.close(); return; }
      this.watchdog = setTimeout(() => this.fail("Face tracking stalled. Retry tracking."), 8000);
      this.worker.postMessage({ type: "frame", time: now, bitmap }, [bitmap]);
    }).catch(error => this.fail(String(error)));
  }
  stop() { this.stopped = true; clearTimeout(this.watchdog); this.worker.terminate(); }
}
