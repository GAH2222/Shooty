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
    for (const id in players
