import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;

const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const startBtn = document.getElementById("startEmotionBtn");
const stopBtn = document.getElementById("stopEmotionBtn");
const statusEl = document.getElementById("emotionStatus");
const hintEl = document.getElementById("emotionHint");
const labelEl = document.getElementById("emotionLabel");
const videoEl = document.getElementById("emotionVideo");
const canvasEl = document.getElementById("emotionCanvas");

let faceLandmarker = null;
let stream = null;
let drawingUtils = null;
let running = false;
let rafId = null;

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function getBlendshapeScore(categories, name) {
  const category = categories.find((item) => item.categoryName === name);
  return category ? category.score : 0;
}

function classifyEmotion(categories) {
  const smile =
    (getBlendshapeScore(categories, "mouthSmileLeft") +
      getBlendshapeScore(categories, "mouthSmileRight")) /
    2;
  const frown =
    (getBlendshapeScore(categories, "mouthFrownLeft") +
      getBlendshapeScore(categories, "mouthFrownRight")) /
    2;
  const browDown =
    (getBlendshapeScore(categories, "browDownLeft") +
      getBlendshapeScore(categories, "browDownRight")) /
    2;
  const browUp = getBlendshapeScore(categories, "browInnerUp");
  const eyeWide =
    (getBlendshapeScore(categories, "eyeWideLeft") +
      getBlendshapeScore(categories, "eyeWideRight")) /
    2;
  const jawOpen = getBlendshapeScore(categories, "jawOpen");
  const cheekSquint =
    (getBlendshapeScore(categories, "cheekSquintLeft") +
      getBlendshapeScore(categories, "cheekSquintRight")) /
    2;

  const scores = {
    Happy: smile * 0.65 + cheekSquint * 0.35,
    Sad: frown * 0.7 + browUp * 0.3,
    Angry: browDown * 0.75 + frown * 0.25,
    Surprised: jawOpen * 0.6 + eyeWide * 0.25 + browUp * 0.15,
  };

  let topEmotion = "Neutral";
  let topScore = 0.22;
  Object.entries(scores).forEach(([emotion, score]) => {
    if (score > topScore) {
      topEmotion = emotion;
      topScore = score;
    }
  });

  return { emotion: topEmotion, confidence: topScore };
}

async function ensureLandmarker() {
  if (faceLandmarker) return;

  setStatus("Loading MediaPipe model...");
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_ASSET_URL,
      delegate: "GPU",
    },
    outputFaceBlendshapes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  });

  setStatus("Model loaded. Starting camera...");
}

function stopDetection() {
  running = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  if (videoEl) {
    videoEl.srcObject = null;
  }
  if (canvasEl) {
    const ctx = canvasEl.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }
  }
  if (labelEl) {
    labelEl.textContent = "Emotion: --";
  }

  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  setStatus("Camera stopped.");
}

function predictLoop() {
  if (!running || !faceLandmarker || !videoEl || !canvasEl) return;

  const width = videoEl.videoWidth || 640;
  const height = videoEl.videoHeight || 480;

  if (canvasEl.width !== width || canvasEl.height !== height) {
    canvasEl.width = width;
    canvasEl.height = height;
  }

  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  const result = faceLandmarker.detectForVideo(videoEl, performance.now());

  if (result?.faceLandmarks?.length > 0) {
    const landmarks = result.faceLandmarks[0];
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_TESSELATION,
      { color: "rgba(255,255,255,0.22)", lineWidth: 1 }
    );

    const categories = result?.faceBlendshapes?.[0]?.categories || [];
    const { emotion, confidence } = classifyEmotion(categories);
    if (labelEl) {
      labelEl.textContent = `Emotion: ${emotion} (${Math.round(confidence * 100)}%)`;
    }
    setStatus("Detection running...");
  } else {
    if (labelEl) {
      labelEl.textContent = "Emotion: No face detected";
    }
    setStatus("No face detected. Move into frame.", true);
  }

  rafId = requestAnimationFrame(predictLoop);
}

async function startDetection() {
  if (!videoEl || !canvasEl) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Camera API is not available in this browser.", true);
    return;
  }

  if (startBtn) startBtn.disabled = true;
  try {
    await ensureLandmarker();

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
      audio: false,
    });

    videoEl.srcObject = stream;
    await videoEl.play();

    drawingUtils = new DrawingUtils(canvasEl.getContext("2d"));
    running = true;
    if (stopBtn) stopBtn.disabled = false;
    setStatus("Camera started.");
    if (hintEl) {
      hintEl.hidden = false;
    }
    predictLoop();
  } catch (error) {
    if (startBtn) startBtn.disabled = false;
    setStatus(`Could not start detection: ${error.message}`, true);
  }
}

if (startBtn) startBtn.addEventListener("click", startDetection);
if (stopBtn) stopBtn.addEventListener("click", stopDetection);
