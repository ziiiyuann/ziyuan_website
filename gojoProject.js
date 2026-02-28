const MEDIAPIPE_VERSION = "0.10.14";
const VISION_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const VISION_WASM_URL = `${VISION_BUNDLE_URL}/wasm`;
const HAND_MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const startBtn = document.getElementById("startGojoBtn");
const stopBtn = document.getElementById("stopGojoBtn");
const statusEl = document.getElementById("gojoStatus");
const hintEl = document.getElementById("gojoHint");
const labelEl = document.getElementById("gojoLabel");
const motionBadgeEl = document.getElementById("gojoMotionBadge");
const videoEl = document.getElementById("gojoVideo");
const canvasEl = document.getElementById("gojoCanvas");
const blueOrbEl = document.getElementById("gojoBlueOrb");
const redOrbEl = document.getElementById("gojoRedOrb");
const purpleOrbEl = document.getElementById("gojoPurpleOrb");
const stageEl = document.getElementById("gojoStage") || (videoEl ? videoEl.closest(".emotion-stage") : null);
const chaosLayerEl = document.getElementById("gojoChaosLayer");

let handLandmarker = null;
let stream = null;
let drawingUtils = null;
let running = false;
let rafId = null;
let HandLandmarker = null;
let FilesetResolver = null;
let DrawingUtils = null;
let handConnections = null;
let visionModulePromise = null;
let previousWrist = null;
let previousTimeMs = 0;
let lastBlueParticleMs = 0;
let lastRedParticleMs = 0;
let lastPurpleParticleMs = 0;
let blueOrbActiveSinceMs = 0;
let redOrbActiveSinceMs = 0;
let purpleOrbActiveSinceMs = 0;
let lastChaosStormMs = 0;

const ORB_PARTICLE_COOLDOWN_MS = 30;
const ORB_FLOAT_LIFT_PERCENT = 14;
const ORB_MAX_GROWTH = 1.25;
const ORB_GROWTH_TIME_MS = 5200;
const PURPLE_ORB_MAX_GROWTH = 2.4;
const PURPLE_GROWTH_TIME_MS = 3200;
const ORB_FUSION_DISTANCE = 0.13;
const CHAOS_STORM_COOLDOWN_MS = 70;

const INDEX_TIP = 8;
const INDEX_PIP = 6;
const INDEX_MCP = 5;
const MIDDLE_TIP = 12;
const MIDDLE_PIP = 10;
const MIDDLE_MCP = 9;
const RING_TIP = 16;
const RING_PIP = 14;
const RING_MCP = 13;
const PINKY_TIP = 20;
const PINKY_PIP = 18;
const PINKY_MCP = 17;
const THUMB_TIP = 4;

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setMotionBadge(message, isMoving = false) {
  if (!motionBadgeEl) return;
  motionBadgeEl.textContent = message;
  motionBadgeEl.style.borderColor = isMoving ? "rgba(110, 231, 135, 0.9)" : "rgba(255, 255, 255, 0.28)";
}

function resetTrackingState() {
  previousWrist = null;
  previousTimeMs = 0;
  if (labelEl) {
    labelEl.textContent = "Hand: --";
  }
  setMotionBadge("Movement: Waiting...");
  hideAllOrbs();
  clearChaosLayer();
}

function distance2D(pointA, pointB) {
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  return Math.hypot(dx, dy);
}

function normalizeHandedness(rawLabel) {
  const value = String(rawLabel || "").toLowerCase();
  if (value.includes("right")) return "Right";
  if (value.includes("left")) return "Left";
  return null;
}

function isFingerUp(landmarks, tip, pip, mcp) {
  return (
    landmarks[tip].y < landmarks[pip].y - 0.025 &&
    landmarks[pip].y < landmarks[mcp].y - 0.008
  );
}

function isFingerClosed(landmarks, tip, pip, mcp) {
  const foldedByY = landmarks[tip].y > landmarks[pip].y - 0.004;
  const compact = distance2D(landmarks[tip], landmarks[mcp]) < 0.11;
  return foldedByY || compact;
}

function isThumbClosed(landmarks) {
  return distance2D(landmarks[THUMB_TIP], landmarks[INDEX_MCP]) < 0.17;
}

function isIndexMiddleGesture(landmarks) {
  const indexUp = isFingerUp(landmarks, INDEX_TIP, INDEX_PIP, INDEX_MCP);
  const middleUp = isFingerUp(landmarks, MIDDLE_TIP, MIDDLE_PIP, MIDDLE_MCP);
  const ringClosed = isFingerClosed(landmarks, RING_TIP, RING_PIP, RING_MCP);
  const pinkyClosed = isFingerClosed(landmarks, PINKY_TIP, PINKY_PIP, PINKY_MCP);
  const thumbClosed = isThumbClosed(landmarks);
  return indexUp && middleUp && ringClosed && pinkyClosed && thumbClosed;
}

function hideOrb(orbEl, color) {
  if (!orbEl) return;
  orbEl.classList.remove("is-active");
  orbEl.style.setProperty("--gojo-growth", "0");
  if (color === "blue") blueOrbActiveSinceMs = 0;
  if (color === "red") redOrbActiveSinceMs = 0;
  if (color === "purple") purpleOrbActiveSinceMs = 0;
}

function hideAllOrbs() {
  hideOrb(blueOrbEl, "blue");
  hideOrb(redOrbEl, "red");
  hideOrb(purpleOrbEl, "purple");
}

function clearChaosLayer() {
  if (chaosLayerEl) {
    chaosLayerEl.replaceChildren();
  }
  if (stageEl) {
    stageEl.classList.remove("gojo-chaos-active", "gojo-chaos-flash", "gojo-purple-active");
  }
}

function getOrbActiveSince(color) {
  if (color === "blue") return blueOrbActiveSinceMs;
  if (color === "red") return redOrbActiveSinceMs;
  if (color === "purple") return purpleOrbActiveSinceMs;
  return 0;
}

function setOrbActiveSince(color, value) {
  if (color === "blue") blueOrbActiveSinceMs = value;
  if (color === "red") redOrbActiveSinceMs = value;
  if (color === "purple") purpleOrbActiveSinceMs = value;
}

function placeOrb(orbEl, tipPoint, color, nowMs) {
  if (!orbEl || !tipPoint) return;
  if (!color) return;

  let activeSince = getOrbActiveSince(color);
  if (!activeSince) {
    activeSince = nowMs;
    setOrbActiveSince(color, activeSince);
  }
  const elapsed = Math.max(0, nowMs - activeSince);
  const maxGrowth = color === "purple" ? PURPLE_ORB_MAX_GROWTH : ORB_MAX_GROWTH;
  const growthTime = color === "purple" ? PURPLE_GROWTH_TIME_MS : ORB_GROWTH_TIME_MS;
  const growth = Math.min(maxGrowth, (elapsed / growthTime) * maxGrowth);

  const mirroredX = 1 - tipPoint.x;
  const lift = color === "purple" ? ORB_FLOAT_LIFT_PERCENT + 6 : ORB_FLOAT_LIFT_PERCENT;
  const floatingY = Math.max(4, tipPoint.y * 100 - lift);
  orbEl.style.left = `${mirroredX * 100}%`;
  orbEl.style.top = `${floatingY}%`;
  orbEl.style.setProperty("--gojo-growth", growth.toFixed(3));
  orbEl.classList.add("is-active");
}

function emitOrbParticles(color, tipPoint) {
  if (!stageEl || !tipPoint) return;

  const now = performance.now();
  const lastTime =
    color === "blue"
      ? lastBlueParticleMs
      : color === "red"
      ? lastRedParticleMs
      : lastPurpleParticleMs;
  if (now - lastTime < ORB_PARTICLE_COOLDOWN_MS) return;
  if (color === "blue") {
    lastBlueParticleMs = now;
  } else if (color === "red") {
    lastRedParticleMs = now;
  } else {
    lastPurpleParticleMs = now;
  }

  const baseX = (1 - tipPoint.x) * 100;
  const lift = color === "purple" ? ORB_FLOAT_LIFT_PERCENT + 6 : ORB_FLOAT_LIFT_PERCENT;
  const baseY = Math.max(4, tipPoint.y * 100 - lift);
  const burstCount = color === "purple" ? 14 + Math.floor(Math.random() * 8) : 8 + Math.floor(Math.random() * 6);

  for (let i = 0; i < burstCount; i += 1) {
    const particle = document.createElement("span");
    particle.className = `gojo-particle gojo-particle-${color}`;
    particle.style.left = `${baseX}%`;
    particle.style.top = `${baseY}%`;
    const spread = color === "purple" ? 130 : 86;
    particle.style.setProperty("--gojo-pdx", `${(Math.random() * 2 - 1) * spread}px`);
    particle.style.setProperty("--gojo-pdy", `${(Math.random() * 2 - 1) * spread}px`);
    particle.style.setProperty("--gojo-psize", `${color === "purple" ? 4 + Math.random() * 9 : 3 + Math.random() * 6}px`);
    particle.style.animationDuration = `${color === "purple" ? 380 + Math.random() * 520 : 420 + Math.random() * 540}ms`;
    stageEl.appendChild(particle);

    requestAnimationFrame(() => {
      particle.classList.add("is-live");
    });

    window.setTimeout(() => {
      particle.remove();
    }, 1200);
  }

  const lightningCount = color === "purple" ? 10 + Math.floor(Math.random() * 8) : 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i < lightningCount; i += 1) {
    const bolt = document.createElement("span");
    bolt.className = `gojo-lightning gojo-lightning-${color}`;
    bolt.style.left = `${baseX}%`;
    bolt.style.top = `${baseY}%`;
    bolt.style.setProperty("--gojo-len", `${color === "purple" ? 34 + Math.random() * 88 : 24 + Math.random() * 42}px`);
    bolt.style.setProperty("--gojo-angle", `${Math.random() * 360}deg`);
    bolt.style.setProperty("--gojo-lthickness", `${1.8 + Math.random() * (color === "purple" ? 3 : 2)}px`);
    bolt.style.setProperty("--gojo-branch-angle", `${-75 + Math.random() * 150}deg`);
    bolt.style.setProperty("--gojo-branch-len", `${10 + Math.random() * (color === "purple" ? 34 : 22)}px`);
    bolt.style.setProperty("--gojo-branch-y", `${14 + Math.random() * 60}%`);
    const drift = color === "purple" ? 90 : 52;
    bolt.style.setProperty("--gojo-ltx", `${(Math.random() * 2 - 1) * drift}px`);
    bolt.style.setProperty("--gojo-lty", `${(Math.random() * 2 - 1) * drift}px`);
    bolt.style.animationDuration = `${color === "purple" ? 120 + Math.random() * 170 : 170 + Math.random() * 180}ms`;
    stageEl.appendChild(bolt);

    requestAnimationFrame(() => {
      bolt.classList.add("is-live");
    });

    window.setTimeout(() => {
      bolt.remove();
    }, 500);
  }

  const sparkCount = color === "purple" ? 14 + Math.floor(Math.random() * 10) : 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i < sparkCount; i += 1) {
    const spark = document.createElement("span");
    spark.className = `gojo-spark gojo-spark-${color}`;
    spark.style.left = `${baseX}%`;
    spark.style.top = `${baseY}%`;
    const sparkSpread = color === "purple" ? 118 : 72;
    spark.style.setProperty("--gojo-sdx", `${(Math.random() * 2 - 1) * sparkSpread}px`);
    spark.style.setProperty("--gojo-sdy", `${(Math.random() * 2 - 1) * sparkSpread}px`);
    spark.style.setProperty("--gojo-ssize", `${color === "purple" ? 1.5 + Math.random() * 4 : 1 + Math.random() * 3}px`);
    spark.style.animationDuration = `${color === "purple" ? 90 + Math.random() * 160 : 130 + Math.random() * 180}ms`;
    stageEl.appendChild(spark);

    requestAnimationFrame(() => {
      spark.classList.add("is-live");
    });

    window.setTimeout(() => {
      spark.remove();
    }, 450);
  }
}

function emitChaosStorm(hasBlueOrb, hasRedOrb, hasPurpleOrb) {
  if (!stageEl || !chaosLayerEl) return;

  const now = performance.now();
  if (now - lastChaosStormMs < CHAOS_STORM_COOLDOWN_MS) return;
  lastChaosStormMs = now;

  stageEl.classList.add("gojo-chaos-active");
  if (hasPurpleOrb) {
    stageEl.classList.add("gojo-purple-active");
  } else {
    stageEl.classList.remove("gojo-purple-active");
  }
  if (Math.random() < 0.22) {
    stageEl.classList.add("gojo-chaos-flash");
    window.setTimeout(() => {
      stageEl.classList.remove("gojo-chaos-flash");
    }, 90);
  }

  const dominantColor = hasPurpleOrb
    ? "purple"
    : hasBlueOrb && !hasRedOrb
    ? "blue"
    : hasRedOrb && !hasBlueOrb
    ? "red"
    : null;
  const riftCount = hasPurpleOrb
    ? 12 + Math.floor(Math.random() * 12)
    : hasBlueOrb && hasRedOrb
    ? 6 + Math.floor(Math.random() * 6)
    : 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < riftCount; i += 1) {
    const color = dominantColor || (Math.random() < 0.5 ? "blue" : "red");
    const rift = document.createElement("span");
    rift.className = `gojo-rift gojo-rift-${color}`;
    rift.style.left = `${4 + Math.random() * 92}%`;
    rift.style.top = `${4 + Math.random() * 92}%`;
    rift.style.setProperty("--gojo-rift-len", `${hasPurpleOrb ? 110 + Math.random() * 380 : 80 + Math.random() * 280}px`);
    rift.style.setProperty("--gojo-rift-angle", `${Math.random() * 360}deg`);
    rift.style.setProperty("--gojo-rift-thickness", `${1.8 + Math.random() * (hasPurpleOrb ? 3.6 : 2.2)}px`);
    rift.style.setProperty("--gojo-rift-branch-angle", `${-85 + Math.random() * 170}deg`);
    rift.style.setProperty("--gojo-rift-branch-len", `${14 + Math.random() * (hasPurpleOrb ? 60 : 34)}px`);
    rift.style.setProperty("--gojo-rift-branch-y", `${10 + Math.random() * 72}%`);
    const riftDrift = hasPurpleOrb ? 220 : 130;
    rift.style.setProperty("--gojo-rift-dx", `${(Math.random() * 2 - 1) * riftDrift}px`);
    rift.style.setProperty("--gojo-rift-dy", `${(Math.random() * 2 - 1) * riftDrift}px`);
    rift.style.animationDuration = `${hasPurpleOrb ? 120 + Math.random() * 170 : 180 + Math.random() * 220}ms`;
    chaosLayerEl.appendChild(rift);

    requestAnimationFrame(() => {
      rift.classList.add("is-live");
    });

    window.setTimeout(() => {
      rift.remove();
    }, 560);
  }
}

async function ensureHandLandmarker() {
  if (handLandmarker) return;

  setStatus("Loading MediaPipe hand model...");
  if (!visionModulePromise) {
    visionModulePromise = import(VISION_BUNDLE_URL);
  }

  const vision = await visionModulePromise;
  HandLandmarker = vision.HandLandmarker;
  FilesetResolver = vision.FilesetResolver;
  DrawingUtils = vision.DrawingUtils;
  handConnections = vision.HandLandmarker?.HAND_CONNECTIONS || vision.HAND_CONNECTIONS || null;

  if (!HandLandmarker || !FilesetResolver || !DrawingUtils) {
    throw new Error("MediaPipe hand modules failed to load.");
  }

  const fileset = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
  const baseOptions = { modelAssetPath: HAND_MODEL_ASSET_URL };
  try {
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { ...baseOptions, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
  } catch (_gpuError) {
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions,
      runningMode: "VIDEO",
      numHands: 2,
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

  resetTrackingState();
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  setStatus("Camera stopped.");
}

function getMotionStats(wristPoint, width, height) {
  const nowMs = performance.now();
  const wrist = { x: wristPoint.x * width, y: wristPoint.y * height };
  let speed = 0;
  let moving = false;

  if (previousWrist && previousTimeMs > 0) {
    const dt = (nowMs - previousTimeMs) / 1000;
    if (dt > 0) {
      const distance = Math.hypot(wrist.x - previousWrist.x, wrist.y - previousWrist.y);
      speed = distance / dt;
      moving = distance > 6 && speed > 85;
    }
  }

  previousWrist = wrist;
  previousTimeMs = nowMs;
  return { speed, moving };
}

function predictLoop() {
  if (!running || !handLandmarker || !videoEl || !canvasEl) return;

  const width = videoEl.videoWidth || 640;
  const height = videoEl.videoHeight || 480;
  if (canvasEl.width !== width || canvasEl.height !== height) {
    canvasEl.width = width;
    canvasEl.height = height;
  }

  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);

  const result = handLandmarker.detectForVideo(videoEl, performance.now());
  const nowMs = performance.now();
  const hasHand = result?.landmarks?.length > 0;
  let rightOrbTip = null;
  let leftOrbTip = null;
  let purpleOrbTip = null;

  if (hasHand) {
    result.landmarks.forEach((landmarks, index) => {
      if (handConnections) {
        drawingUtils.drawConnectors(landmarks, handConnections, {
          color: "rgba(94, 209, 255, 0.9)",
          lineWidth: 2,
        });
      }
      drawingUtils.drawLandmarks(landmarks, {
        color: "rgba(255, 255, 255, 0.94)",
        lineWidth: 1,
        radius: 2.5,
      });

      const handednessLabel =
        result?.handednesses?.[index]?.[0]?.displayName ||
        result?.handednesses?.[index]?.[0]?.categoryName ||
        "";
      const handedness = normalizeHandedness(handednessLabel);
      const isPoseActive = isIndexMiddleGesture(landmarks);
      if (isPoseActive && handedness === "Right") {
        rightOrbTip = landmarks[INDEX_TIP];
      }
      if (isPoseActive && handedness === "Left") {
        leftOrbTip = landmarks[INDEX_TIP];
      }
    });

    if (rightOrbTip && leftOrbTip && distance2D(rightOrbTip, leftOrbTip) <= ORB_FUSION_DISTANCE) {
      purpleOrbTip = {
        x: (rightOrbTip.x + leftOrbTip.x) / 2,
        y: (rightOrbTip.y + leftOrbTip.y) / 2,
      };
    }

    if (purpleOrbTip) {
      hideOrb(blueOrbEl, "blue");
      hideOrb(redOrbEl, "red");
      placeOrb(purpleOrbEl, purpleOrbTip, "purple", nowMs);
      emitOrbParticles("purple", purpleOrbTip);
    } else {
      hideOrb(purpleOrbEl, "purple");
      if (rightOrbTip) {
        placeOrb(blueOrbEl, rightOrbTip, "blue", nowMs);
        emitOrbParticles("blue", rightOrbTip);
      } else {
        hideOrb(blueOrbEl, "blue");
      }
      if (leftOrbTip) {
        placeOrb(redOrbEl, leftOrbTip, "red", nowMs);
        emitOrbParticles("red", leftOrbTip);
      } else {
        hideOrb(redOrbEl, "red");
      }
    }

    if (rightOrbTip || leftOrbTip || purpleOrbTip) {
      emitChaosStorm(Boolean(rightOrbTip), Boolean(leftOrbTip), Boolean(purpleOrbTip));
    } else if (stageEl) {
      stageEl.classList.remove("gojo-chaos-active", "gojo-chaos-flash", "gojo-purple-active");
    }

    const primaryHand = result.landmarks[0];
    const wrist = primaryHand?.[0];
    const handedness =
      result?.handednesses?.[0]?.[0]?.displayName ||
      result?.handednesses?.[0]?.[0]?.categoryName ||
      "Hand";

    if (wrist) {
      const motion = getMotionStats(wrist, width, height);
      const speedText = `${Math.round(motion.speed)} px/s`;
      if (labelEl) {
        labelEl.textContent = `${handedness}: ${motion.moving ? "Moving" : "Still"} (${speedText})`;
      }
      if (motion.moving) {
        setMotionBadge(`Movement: Active (${speedText})`, true);
        if (purpleOrbTip) {
          setStatus("Hollow Purple activated.");
        } else if (rightOrbTip && leftOrbTip) {
          setStatus("Blue + Red orb activated.");
        } else if (rightOrbTip) {
          setStatus("Blue orb activated (Right index+middle pose).");
        } else if (leftOrbTip) {
          setStatus("Red orb activated (Left index+middle pose).");
        } else {
          setStatus("Hand movement detected.");
        }
      } else {
        setMotionBadge(`Movement: Low (${speedText})`);
        if (purpleOrbTip) {
          setStatus("Hollow Purple charging...");
        } else if (rightOrbTip || leftOrbTip) {
          setStatus("Pose detected. Hold steady to keep orb active.");
        } else {
          setStatus("Hand detected. Move faster to trigger active movement.");
        }
      }
    } else {
      setMotionBadge("Movement: Waiting...");
      setStatus("Hand detected.");
    }
  } else {
    resetTrackingState();
    hideAllOrbs();
    setStatus("No hand detected. Raise your hand into frame.", true);
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
    await ensureHandLandmarker();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
      audio: false,
    });

    videoEl.srcObject = stream;
    await videoEl.play();

    drawingUtils = new DrawingUtils(canvasEl.getContext("2d"));
    resetTrackingState();
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
resetTrackingState();
