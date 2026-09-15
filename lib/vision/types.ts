export type Point = { x: number; y: number; z: number };
export type TrackingStatus = "off" | "loading" | "tracking" | "searching" | "error";
export type TrackingFrame = {
  type: "frame"; time: number; points: Point[]; expressions: Record<string, number>;
  matrix: number[]; mask?: Uint8Array; maskWidth?: number; maskHeight?: number;
  hands?: { name: string; score: number; tip: Point; indexTip?: Point }[];
  gesturesAvailable?: boolean;
};
export type VisionMessage = TrackingFrame | { type: "ready"; triangles: number[]; segmentation: boolean } | { type: "error"; message: string };
export type EffectSettings = { mode: number; intensity: number; feedback: number; pixel: number; threshold: number; particles: number; particlesEnabled: number; mirror: number; frozen: boolean; hasVideo: boolean };
