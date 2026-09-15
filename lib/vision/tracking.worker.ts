import { FaceLandmarker, FilesetResolver, ImageSegmenter, GestureRecognizer } from "@mediapipe/tasks-vision";
import type { TrackingFrame } from "./types";

let landmarker: FaceLandmarker | undefined;
let segmenter: ImageSegmenter | undefined;
let lastSegment = -Infinity;
let gestures: GestureRecognizer | undefined;
let lastGesture = -Infinity;

// This is bundled as a classic worker so MediaPipe's WASM loader can use importScripts.
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  if (data.type === "init") {
    try {
      const vision = await FilesetResolver.forVisionTasks(`${data.origin}/mediapipe-wasm`);
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${data.origin}/models/face-landmarker.task`, delegate: "CPU" },
        runningMode: "VIDEO", numFaces: 1, minFaceDetectionConfidence: .5,
        minFacePresenceConfidence: .5, minTrackingConfidence: .5,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
      // Body tracking is optional: a segmentation failure must not disable the face mesh.
      try {
        segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${data.origin}/models/selfie-segmenter-landscape.tflite`, delegate: "CPU" },
          runningMode: "VIDEO", outputCategoryMask: false, outputConfidenceMasks: true,
        });
      } catch (error) { console.warn("Body segmentation unavailable", error); }
      const edges = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
      const triangles: number[] = [];
      for (let i = 0; i < edges.length; i += 3) {
        const indices = [...new Set(edges.slice(i, i + 3).flatMap(e => [e.start, e.end]))];
        if (indices.length === 3) triangles.push(...indices);
      }
      self.postMessage({ type: "ready", triangles, segmentation: !!segmenter });
      // Optional hand model loads after face readiness; failures leave camera/face effects alive.
      try {
        gestures = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${data.origin}/models/gesture-recognizer.task`, delegate: "CPU" },
          runningMode: "VIDEO", numHands: 2,
          minHandDetectionConfidence: .6, minHandPresenceConfidence: .6,
        });
      } catch (error) { console.warn("Hand gestures unavailable", error); }
    } catch (error) {
      self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Face model failed to load" });
    }
    return;
  }
  if (data.type !== "frame") return;
  const bitmap: ImageBitmap = data.bitmap;
  try {
    if (!landmarker) throw new Error("Face Landmarker is not ready");
    const result = landmarker.detectForVideo(bitmap, data.time);
    const frame: TrackingFrame = {
      type: "frame", time: data.time, points: result.faceLandmarks[0] ?? [],
      expressions: Object.fromEntries((result.faceBlendshapes[0]?.categories ?? []).map(c => [c.categoryName, c.score])),
      matrix: result.facialTransformationMatrixes[0]?.data ?? [],
      gesturesAvailable: !!gestures,
    };
    if (gestures && data.time - lastGesture >= 100) {
      lastGesture = data.time;
      try {
        const hands = gestures.recognizeForVideo(bitmap, data.time);
        frame.hands = hands.gestures.map((categories, i) => ({
          name: categories[0]?.categoryName ?? "None", score: categories[0]?.score ?? 0,
          tip: hands.landmarks[i][4], indexTip: hands.landmarks[i][8],
        }));
      } catch (error) { console.warn("Hand gestures stopped", error); gestures.close(); gestures = undefined; frame.gesturesAvailable = false; }
    }
    if (segmenter && data.time - lastSegment > 160) {
      lastSegment = data.time;
      try {
        segmenter.segmentForVideo(bitmap, data.time, result => {
          // The selfie model has one output: foreground confidence, not a category-1 mask.
          const mask = result.confidenceMasks?.[0];
          if (!mask) return;
          frame.mask = Uint8Array.from(mask.getAsFloat32Array(), value => Math.round(value * 255));
          frame.maskWidth = mask.width; frame.maskHeight = mask.height;
        });
      } catch (error) { console.warn("Body tracking frame skipped", error); }
    }
    self.postMessage(frame, { transfer: frame.mask ? [frame.mask.buffer] : [] });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Tracking failed" });
  } finally { bitmap.close(); }
};
