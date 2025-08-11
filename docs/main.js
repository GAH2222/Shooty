// client/main.js
// Module script - uses ESM imports from CDN
import * as THREE from "https://unpkg.com/three@0.152.2/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js";
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

/* ---------- CONFIG ---------- */
const SERVER_URL = "https://shooty-5tse.onrender.com"; // your render URL
const ASSET_BASE = "assets/"; // client/assets/
const CHARACTER_FILE = "Shawty1.glb";
const GUN_FILE = "gun2.glb";
const MAP_FILE = "the first map!.glb";
const GUNSHOT_FILE = "gunshot.wav";

/* ---------- DOM elements ---------- */
const menu = document.getElementById("menu");
const joinBtn = document.getElementById("joinBtn");
const skinSelect = document.getElementById("skinSelect");
const loadingScreen = document.getElementById("loadingScreen");
const loadingText = document.getElementById("loadingText");
const canvas = document.getElementById("gameCanvas");
const healthBar = document.getElementById("healthBar");
const scoreEl = document.getElementById("score");
const crosshair = document.getElementById("crosshair");
const chatContainer = document.getElementById("chatContainer");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const instructions = document.getElementById("instructions");

/* ---------- Three.js setup ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07102a);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2.2, 6);

const loader = new GLTFLoader();
const audioLoader = new THREE.AudioLoader();

/* ---------- lighting ---------- */
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(10, 15, 10);
scene.add(dir);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

/* ---------- world objects ---------- */
let mapRoot = new THREE.Group();
scene.add(mapRoot);

/* ---------- player & networking ---------- */
let socket;
let localPlayer = {
  id: null,
  model: null,
  gun: null,
  pos: new THREE.Vector3(0, 5, 0),
  rotY: 0,
  vel: new THREE.Vector3(),
  grounded: false,
  canDoubleJump: true,
  dashCooldown: 0,
  health: 100,
  alive: true,
  score: 0,
  skin: 0
};

const remotePlayers = {}; // id -> {model, pos, rotY, health, alive, skin}

/* ---------- audio ---------- */
const listener = new THREE.AudioListener();
camera.add(listener);
const gunshotSound = new THREE.Audio(listener);

/* load audio file */
audioLoader.load(ASSET_BASE + GUNSHOT_FILE, buffer => {
  gunshotSound.setBuffer(buffer);
  gunshotSound.setVolume(0.5);
});

/* ---------- input ---------- */
const keys = {};
let mouseDown = false;
let pointerLocked = false;
let chatOpen = false;
let isBoost = false; // F key held

window.addEventListener("keydown", (e) => {
  if (chatOpen) return;
  keys[e.code] = true;
  if (e.code === "KeyT") {
    openChat();
  } else if (e.code === "Escape") {
    document.exitPointerLock();
  } else if (e.code === "KeyF") {
    isBoost = true;
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "KeyF") isBoost = false;
});

canvas.addEventListener("mousedown", e => {
  if (!pointerLocked) canvas.requestPointerLock();
  mouseDown = true;
  if (!chatOpen) shoot();
});
window.addEventListener("mouseup", () => mouseDown = false);

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const msg = chatInput.value.trim();
    if (msg.length > 0 && socket) {
      socket.emit("chatMessage", msg);
      addChatMessage("You: " + msg);
    }
    closeChat();
  } else if (e.key === "Escape") {
    closeChat();
  }
});

/* ---------- UI helpers ---------- */
function showLoading(text = "Loading...") {
  loadingText.textContent = text;
  loadingScreen.classList.remove("hidden");
}
function hideLoading() {
  loadingScreen.classList.add("hidden");
}

function openChat() {
  chatOpen = true;
  chatContainer.classList.remove("chat-hidden");
  chatInput.focus();
}
function closeChat() {
  chatOpen = false;
  chatContainer.classList.add("chat-hidden");
  chatInput.value = "";
  canvas.focus();
}
function addChatMessage(text) {
  const d = document.createElement("div");
  d.textContent = text;
  chatMessages.appendChild(d);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ---------- load assets ---------- */
async function loadMap() {
  return new Promise((res, rej) => {
    loader.load(ASSET_BASE + MAP_FILE, gltf => {
      mapRoot.clear();
      mapRoot.add(gltf.scene);
      res();
    }, xhr => {
      // progress
    }, err => rej(err));
  });
}

async function loadCharacterModel() {
  return new Promise((res, rej) => {
    loader.load(ASSET_BASE + CHARACTER_FILE, gltf => {
      res(gltf.scene);
    }, null, rej);
  });
}

async function loadGunModel() {
  return new Promise((res, rej) => {
    loader.load(ASSET_BASE + GUN_FILE, gltf => {
      res(gltf.scene);
    }, null, rej);
  });
}

/* ---------- spawn local player model ---------- */
async function spawnLocalPlayer(skinIndex = 0) {
  showLoading("Loading character...");
  const model = await loadCharacterModel();
  // scale and center if needed
  model.scale.set(1,1,1);
  model.position.copy(localPlayer.pos);
  scene.add(model);
  localPlayer.model = model;

  // gun
  const gun = await loadGunModel();
  gun.scale.set(1,1,1);
  gun.position.set(0.2, -0.2, -0.6);
  model.add(gun);
  localPlayer.gun = gun;

  hideLoading();
}

/* ---------- network handling ---------- */
function setupSocket(skinIndex) {
  showLoading("Connecting to server...");
  socket = io(SERVER_URL, { transports: ["websocket", "polling"] });

  socket.on("connect", () => {
    localPlayer.id = socket.id;
    localPlayer.skin = skinIndex;
    hideLoading();
    addChatMessage("Connected to server.");
  });

  socket.on("currentPlayers", players => {
    // create remote players
    for (const id in players) {
      const p = players[id];
      if (id === socket.id) continue;
      createRemotePlayer(id, p);
    }
  });

  socket.on("newPlayer", p => {
    createRemotePlayer(p.id, p);
  });

  socket.on("playerMoved", data => {
    if (data.id === socket.id) return;
    const r = remotePlayers[data.id];
    if (r) {
      r.pos.set(data.x, data.y, data.z);
      r.skin = data.skin ?? r.skin;
      r.model.position.copy(r.pos);
      r.model.rotation.y = data.rotY || r.model.rotation.y;
    }
  });

  socket.on("playerDisconnected", id => {
    removeRemotePlayer(id);
  });

  socket.on("chatMessage", data => {
    addChatMessage(data.id + ": " + data.msg);
  });

  socket.on("playerShot", data => {
    // play sound and optionally bullet tracer
    if (gunshotSound.isPlaying) gunshotSound.stop();
    gunshotSound.play();
  });

  socket.on("playerHit", data => {
    if (data.id === localPlayer.id) {
      localPlayer.health = data.health;
      updateHealthUI();
    }
  });

  socket.on("playerDied", data => {
    if (data.id === localPlayer.id) {
      // show death effect
      localPlayer.alive = false;
      addChatMessage("You died.");
      // respawn handled by server
    } else {
      addChatMessage((data.killer ? data.killer : "Someone") + " killed " + data.id);
    }
  });

  socket.on("playerRespawn", data => {
    const id = data.id;
    if (id === localPlayer.id) {
      localPlayer.pos.set(data.x, data.y, data.z);
      localPlayer.health = data.health;
      localPlayer.alive = true;
      if (localPlayer.model) localPlayer.model.position.copy(localPlayer.pos);
      updateHealthUI();
    } else {
      const r = remotePlayers[id];
      if (r) {
        r.pos.set(data.x, data.y, data.z);
        r.model.position.copy(r.pos);
        r.health = data.health;
        r.alive = true;
      }
    }
  });

  socket.on("applyImpulse", data => {
    if (data.id === localPlayer.id) {
      // small local impulse
      const imp = data.impulse;
      localPlayer.vel.x += imp.ix;
      localPlayer.vel.y += imp.iy;
      localPlayer.vel.z += imp.iz;
    }
  });
}

/* ---------- remote players ---------- */
async function createRemotePlayer(id, pdata) {
  // simple visual: clone the base character to represent others
  const model = await loadCharacterModel();
  model.scale.set(1,1,1);
  const pos = new THREE.Vector3(pdata.x || 0, pdata.y || 0, pdata.z || 0);
  model.position.copy(pos);
  scene.add(model);
  remotePlayers[id] = { model, pos, rotY: pdata.rotY || 0, health: pdata.health || 100, alive: pdata.alive ?? true, skin: pdata.skin || 0 };
}

/* ---------- cleanup ---------- */
function removeRemotePlayer(id) {
  const r = remotePlayers[id];
  if (!r) return;
  scene.remove(r.model);
  if (r.model.dispose) r.model.dispose();
  delete remotePlayers[id];
}

/* ---------- movement + physics (very simplified) ---------- */
function applyMovement(dt) {
  if (!localPlayer.model || !localPlayer.alive) return;

  const speed = 8.5; // units per second
  const dashImpulse = 10;
  const friction = 8.0;
  const gravity = -30;

  // input direction in camera space
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.copy(forward).applyAxisAngle(new THREE.Vector3(0,1,0), Math.PI/2);

  let moveDir = new THREE.Vector3();
  if (keys["KeyW"]) moveDir.add(forward);
  if (keys["KeyS"]) moveDir.sub(forward);
  if (keys["KeyA"]) moveDir.sub(right);
  if (keys["KeyD"]) moveDir.add(right);
  if (moveDir.lengthSq() > 0) moveDir.normalize();

  // horizontal velocity control
  const targetVel = moveDir.multiplyScalar(speed);
  // lerp localPlayer.vel.xz toward targetVel
  localPlayer.vel.x = THREE.MathUtils.damp(localPlayer.vel.x, targetVel.x, friction, dt);
  localPlayer.vel.z = THREE.MathUtils.damp(localPlayer.vel.z, targetVel.z, friction, dt);

  // jump
  if (keys["Space"]) {
    if (localPlayer.grounded) {
      localPlayer.vel.y = 10;
      localPlayer.grounded = false;
      localPlayer.canDoubleJump = true;
    } else if (localPlayer.canDoubleJump) {
      localPlayer.vel.y = 10;
      localPlayer.canDoubleJump = false;
    }
    // prevent repeated jumps in single press
    keys["Space"] = false;
  }

  // dash (Q)
  if (keys["KeyQ"] && localPlayer.dashCooldown <= 0) {
    // dash in moveDir or forward if stationary
    const dir = moveDir.lengthSq() > 0 ? moveDir.clone().normalize() : forward.clone();
    localPlayer.vel.addScaledVector(dir, dashImpulse);
    localPlayer.dashCooldown = 0.5; // seconds
    keys["KeyQ"] = false;
  }

  // integrate gravity
  localPlayer.vel.y += gravity * dt;

  // integrate position
  localPlayer.pos.addScaledVector(localPlayer.vel, dt);

  // simple ground collision: assume ground at y=0
  if (localPlayer.pos.y <= 0.15) {
    localPlayer.pos.y = 0.15;
    localPlayer.vel.y = 0;
    localPlayer.grounded = true;
  } else {
    localPlayer.grounded = false;
  }

  // simple player-player collision: push apart if overlapping
  for (const id in remotePlayers) {
    const r = remotePlayers[id];
    const dist = r.pos.distanceTo(localPlayer.pos);
    const minSep = 1.0;
    if (dist > 0 && dist < minSep) {
      const push = localPlayer.pos.clone().sub(r.pos).normalize().multiplyScalar((minSep - dist) * 0.5);
      localPlayer.pos.add(push);
      r.pos.sub(push);
      r.model.position.copy(r.pos);
    }
  }

  // map boundaries fallback: if too far away, clamp
  const limit = 200;
  localPlayer.pos.x = THREE.MathUtils.clamp(localPlayer.pos.x, -limit, limit);
  localPlayer.pos.z = THREE.MathUtils.clamp(localPlayer.pos.z, -limit, limit);

  // update model transform
  localPlayer.model.position.copy(localPlayer.pos);
  // rotate model to movement direction if moving
  if (localPlayer.vel.x * localPlayer.vel.x + localPlayer.vel.z * localPlayer.vel.z > 0.1) {
    const ang = Math.atan2(localPlayer.vel.x, localPlayer.vel.z);
    localPlayer.model.rotation.y = ang;
  }

  // reduce dash cooldown
  localPlayer.dashCooldown = Math.max(0, (localPlayer.dashCooldown || 0) - dt);
}

/* ---------- shooting ---------- */
function shoot() {
  if (!socket || !localPlayer.alive) return;

  // camera-based origin & direction
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  origin.copy(camera.position);
  camera.getWorldDirection(dir);
  dir.normalize();

  // play local sound
  if (gunshotSound.isPlaying) gunshotSound.stop();
  gunshotSound.play();

  // send shoot to server
  socket.emit("shoot", {
    origin: { x: origin.x, y: origin.y, z: origin.z },
    dir: { x: dir.x, y: dir.y, z: dir.z },
    isBoost: isBoost,
    range: 60,
    damage: 25
  });

  // recoil on client
  if (isBoost) {
    // boost shot: small camera kick and local velocity impulse (server also applies)
    localPlayer.vel.addScaledVector(dir, -8);
    localPlayer.vel.y += 2;
  } else {
    // small recoil
    localPlayer.vel.addScaledVector(dir, -2);
  }
}

/* ---------- UI updates ---------- */
function updateHealthUI() {
  const pct = Math.max(0, Math.min(1, localPlayer.health / 100));
  healthBar.style.width = (pct * 100) + "%";
  scoreEl.textContent = "Score: " + (localPlayer.score || 0);
}

/* ---------- main loop ---------- */
let lastTime = performance.now();
let acc = 0;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (localPlayer.model) {
    applyMovement(dt);
    // camera follow
    const camTarget = localPlayer.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    camera.position.lerp(camTarget.clone().add(new THREE.Vector3(0, 2.3, 6).applyAxisAngle(new THREE.Vector3(0,1,0), localPlayer.model.rotation.y)), 0.08);
    camera.lookAt(camTarget);

    // send position update to server at ~20Hz (simple throttle)
    acc += dt;
    if (acc > 0.05) {
      acc = 0;
      if (socket) {
        socket.emit("move", {
          x: localPlayer.pos.x, y: localPlayer.pos.y, z: localPlayer.pos.z,
          rotY: localPlayer.model.rotation.y,
          skin: localPlayer.skin,
          vx: localPlayer.vel.x, vy: localPlayer.vel.y, vz: localPlayer.vel.z
        });
      }
    }
  }

  // render
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

/* ---------- start & UI wiring ---------- */
joinBtn.addEventListener("click", async () => {
  const skinIndex = parseInt(skinSelect.value || "0", 10);
  menu.style.display = "none";
  showLoading("Loading map and character...");
  try {
    await loadMap();
    await spawnLocalPlayer(skinIndex);
    setupSocket(skinIndex);
    hideLoading();
    instructions.style.display = "block";
  } catch (err) {
    console.error("Load failed", err);
    loadingText.textContent = "Failed to load assets. Check console.";
  }
});

/* ---------- window resize ---------- */
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

/* ---------- helpful debug: click to lock pointer ---------- */
canvas.addEventListener("click", () => {
  if (!pointerLocked) canvas.requestPointerLock();
});

/* initial UI state */
updateHealthUI();
