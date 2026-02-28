const MEDIAPIPE_VERSION = "0.10.14";
const VISION_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const VISION_WASM_URL = `${VISION_BUNDLE_URL}/wasm`;

const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const FLASH_DURATION_MS = 260;
const BLACKOUT_START_DELAY_MS = 150;
const BLACKOUT_DURATION_MS = 4000;
const EMOTION_IMAGE_MAP = {
  Happy: "assets/images/emotion-happy.png",
  Neutral: "assets/images/emotion-neutral.png",
  Surprised: "assets/images/emotion-surprised.png",
  Sad: "assets/images/emotion-sad.png",
  Angry: "assets/images/emotion-angry.png",
};

const startBtn = document.getElementById("startEmotionBtn");
const stopBtn = document.getElementById("stopEmotionBtn");
const statusEl = document.getElementById("emotionStatus");
const hintEl = document.getElementById("emotionHint");
const labelEl = document.getElementById("emotionLabel");
const videoEl = document.getElementById("emotionVideo");
const canvasEl = document.getElementById("emotionCanvas");
const flashEl = document.getElementById("emotionFlash");
const blackoutEl = document.getElementById("emotionBlackout");
const reactionImageEl = document.getElementById("emotionReactionImage");
const reactionTextEl = document.getElementById("emotionReactionText");

let faceLandmarker = null;
let stream = null;
let drawingUtils = null;
let running = false;
let rafId = null;
let FaceLandmarker = null;
let FilesetResolver = null;
let DrawingUtils = null;
let visionModulePromise = null;
let flashTimeoutId = null;
let blackoutStartTimeoutId = null;
let blackoutTimeoutId = null;
let happyEffectCooldownUntil = 0;
let isBlackoutActive = false;

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function resetReactionImage(message = "Emotion image will appear here.") {
  if (reactionImageEl) {
    reactionImageEl.hidden = true;
    reactionImageEl.removeAttribute("src");
    reactionImageEl.removeAttribute("alt");
    reactionImageEl.style.opacity = "1";
  }
  if (reactionTextEl) {
    reactionTextEl.textContent = message;
  }
}

function updateReactionImage(emotion, confidence) {
  if (!reactionImageEl || !reactionTextEl) return;

  const imagePath = EMOTION_IMAGE_MAP[emotion] || EMOTION_IMAGE_MAP.Neutral;
  const confidencePct = Math.max(0, Math.min(100, Math.round(confidence * 100)));
  const alpha = Math.max(0.6, Math.min(1, confidence + 0.35));

  if (reactionImageEl.getAttribute("src") !== imagePath) {
    reactionImageEl.src = imagePath;
  }
  reactionImageEl.alt = `${emotion} emotion visual`;
  reactionImageEl.hidden = false;
  reactionImageEl.style.opacity = `${alpha}`;
  reactionTextEl.textContent = `${emotion} (${confidencePct}%)`;
}

function clearHappyEffects() {
  if (flashTimeoutId) {
    clearTimeout(flashTimeoutId);
    flashTimeoutId = null;
  }
  if (blackoutStartTimeoutId) {
    clearTimeout(blackoutStartTimeoutId);
    blackoutStartTimeoutId = null;
  }
  if (blackoutTimeoutId) {
    clearTimeout(blackoutTimeoutId);
    blackoutTimeoutId = null;
  }
  if (flashEl) {
    flashEl.classList.remove("is-active");
  }
  if (blackoutEl) {
    blackoutEl.hidden = true;
  }
  isBlackoutActive = false;
}

function maybeTriggerHappyEffect(emotion, confidence) {
  if (emotion !== "Happy" || confidence < 0.6) return;

  const now = Date.now();
  if (now < happyEffectCooldownUntil || isBlackoutActive) return;
  happyEffectCooldownUntil = now + 7000;

  if (flashEl) {
    flashEl.classList.remove("is-active");
    // Force reflow so repeated triggers restart the CSS animation.
    void flashEl.offsetWidth;
    flashEl.classList.add("is-active");
    flashTimeoutId = setTimeout(() => {
      flashEl.classList.remove("is-active");
      flashTimeoutId = null;
    }, FLASH_DURATION_MS + 20);
  }

  if (blackoutEl) {
    blackoutStartTimeoutId = setTimeout(() => {
      blackoutStartTimeoutId = null;
      isBlackoutActive = true;
      blackoutEl.hidden = false;
      blackoutEl.textContent = "You look good cutie ;) Keep smiling everyday!";
      blackoutTimeoutId = setTimeout(() => {
        blackoutEl.hidden = true;
        blackoutTimeoutId = null;
        isBlackoutActive = false;
      }, BLACKOUT_DURATION_MS);
    }, BLACKOUT_START_DELAY_MS);
  }
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
  if (!visionModulePromise) {
    visionModulePromise = import(VISION_BUNDLE_URL);
  }

  const vision = await visionModulePromise;
  FaceLandmarker = vision.FaceLandmarker;
  FilesetResolver = vision.FilesetResolver;
  DrawingUtils = vision.DrawingUtils;

  if (!FaceLandmarker || !FilesetResolver || !DrawingUtils) {
    throw new Error("MediaPipe modules failed to load.");
  }

  const fileset = await FilesetResolver.forVisionTasks(VISION_WASM_URL);

  const baseOptions = { modelAssetPath: MODEL_ASSET_URL };
  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { ...baseOptions, delegate: "GPU" },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });
  } catch (_gpuError) {
    faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions,
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });
  }

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
  clearHappyEffects();
  resetReactionImage("Emotion image will appear here.");

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
    updateReactionImage(emotion, confidence);
    maybeTriggerHappyEffect(emotion, confidence);
    setStatus("Detection running...");
  } else {
    if (labelEl) {
      labelEl.textContent = "Emotion: No face detected";
    }
    resetReactionImage("No face detected.");
    setStatus("No face detected. Move into frame.", true);
  }

  rafId = requestAnimationFrame(predictLoop);
}

async function startDetection() {
  if (!videoEl || !canvasEl) return;

  if (window.location.protocol === "file:") {
    setStatus("Open this page via HTTPS (GitHub Pages) or a local web server, not file://", true);
    return;
  }

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
if (reactionImageEl) {
  reactionImageEl.addEventListener("error", () => {
    resetReactionImage("Emotion image file not found. Check image names in assets/images.");
  });
}
clearHappyEffects();
resetReactionImage();
