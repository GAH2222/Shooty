// main.js - Client side game logic with UI, physics, chat, menu, etc

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import io from 'socket.io-client';

const socket = io();

let scene, camera, renderer;
let playerModel, gunModel, mapModel;
let players = {}; // other players and yourself
let clock = new THREE.Clock();
let loader = new GLTFLoader();

let move = { forward: false, backward: false, left: false, right: false };
let canJump = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

let speed = 15;
let dashSpeed = 30;
let isDashing = false;
let dashTime = 0.2;
let dashCooldown = 1;
let lastDash = -dashCooldown;

let jumpVelocity = 15;
let gravity = -30;

let health = 100;
const maxHealth = 100;

let crosshair;
let loadingScreen, menuScreen, gameUI, chatUI;

let chatOpen = false;
let chatInput;
let chatMessages = [];

let selectedSkin = 0;
const skins = ['Shawty1.glb', 'Shawty2.glb']; // two skins placeholder

// UI Elements
const container = document.getElementById('container');

init();

function init() {
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, 5, 10);

  // Light
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(10, 20, 10);
  scene.add(light);

  const ambient = new THREE.AmbientLight(0x404040);
  scene.add(ambient);

  // Crosshair
  crosshair = document.createElement('div');
  crosshair.id = 'crosshair';
  document.body.appendChild(crosshair);

  // Loading screen
  loadingScreen = document.getElementById('loadingScreen');
  menuScreen = document.getElementById('menuScreen');
  gameUI = document.getElementById('gameUI');
  chatUI = document.getElementById('chatUI');
  chatInput = document.getElementById('chatInput');
  chatInput.addEventListener('keydown', onChatInput);

  // Hide game UI & chat & crosshair initially
  gameUI.style.display = 'none';
  chatUI.style.display = 'none';
  crosshair.style.display = 'none';

  // Load map
  loader.load('assets/the first map!.glb', gltf => {
    mapModel = gltf.scene;
    scene.add(mapModel);

    // Setup menu after map loaded
    setupMenu();

    // Show menu screen, hide loading
    loadingScreen.style.display = 'none';
    menuScreen.style.display = 'flex';
  });

  window.addEventListener('resize', onWindowResize);

  // Keyboard controls
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Mouse controls
  document.addEventListener('mousedown', onMouseDown);

  animate();
}

function setupMenu() {
  // Populate skins selector dynamically or just simple buttons here
  const skinButtons = document.getElementById('skinButtons');
  skins.forEach((skin, i) => {
    const btn = document.createElement('button');
    btn.innerText = `Skin ${i+1}`;
    btn.classList.add('skinBtn');
    if(i === selectedSkin) btn.classList.add('selected');
    btn.onclick = () => {
      selectedSkin = i;
      document.querySelectorAll('.skinBtn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
    skinButtons.appendChild(btn);
  });

  // Play button
  const playBtn = document.getElementById('playButton');
  playBtn.onclick = () => {
    startGame();
  };
}

function startGame() {
  menuScreen.style.display = 'none';
  loadingScreen.style.display = 'flex';
  loadingScreen.querySelector('p').innerText = 'Loading Game...';

  // Load player model & gun based on skin
  loader.load(`assets/${skins[selectedSkin]}`, gltf => {
    playerModel = gltf.scene;
    playerModel.scale.set(1,1,1);
    scene.add(playerModel);

    loader.load('assets/gun2.glb', gltfGun => {
      gunModel = gltfGun.scene;
      playerModel.add(gunModel);
      gunModel.position.set(0.5, 1, 0);
      gunModel.scale.set(0.7,0.7,0.7);

      // After all loaded, join server
      joinServer();
    });
  });
}

function joinServer() {
  socket.emit('joinGame', { skin: skins[selectedSkin] });

  socket.on('gameData', data => {
    // Update other players & their positions
    updatePlayers(data.players);
    loadingScreen.style.display = 'none';
    gameUI.style.display = 'block';
    crosshair.style.display = 'block';
  });

  socket.on('playerHit', data => {
    if(data.id === socket.id) {
      health -= data.damage;
      if(health <= 0) {
        die();
      }
      updateHealthBar();
    }
  });

  socket.on('chatMessage', data => {
    addChatMessage(data.playerName + ': ' + data.message);
  });
}

function updatePlayers(serverPlayers) {
  // Add/update other players except self
  for(let id in serverPlayers) {
    if(id === socket.id) continue;
    let p = serverPlayers[id];
    if(!players[id]) {
      // Add new player
      loader.load(`assets/${p.skin}`, gltf => {
        const model = gltf.scene;
        model.scale.set(1,1,1);
        scene.add(model);
        players[id] = { model: model, health: maxHealth };
      });
    } else {
      // Update position & rotation
      if(players[id].model) {
        players[id].model.position.set(p.position.x, p.position.y, p.position.z);
        players[id].model.rotation.y = p.rotationY;
      }
    }
  }
}

function onKeyDown(event) {
  if(chatOpen) {
    if(event.key === 'Escape') {
      closeChat();
    }
    return;
  }

  switch(event.code) {
    case 'KeyW': move.forward = true; break;
    case 'KeyS': move.backward = true; break;
    case 'KeyA': move.left = true; break;
    case 'KeyD': move.right = true; break;
    case 'Space': if(canJump) jump(); break;
    case 'KeyQ': dash(); break;
    case 'KeyT': openChat(); break;
  }
}

function onKeyUp(event) {
  switch(event.code) {
    case 'KeyW': move.forward = false; break;
    case 'KeyS': move.backward = false; break;
    case 'KeyA': move.left = false; break;
    case 'KeyD': move.right = false; break;
  }
}

function onMouseDown(event) {
  if(chatOpen) return;
  if(event.button === 0) { // left click shoot
    shoot();
  }
}

function jump() {
  velocity.y = jumpVelocity;
  canJump = false;
}

function dash() {
  const timeNow = clock.getElapsedTime();
  if(timeNow - lastDash < dashCooldown) return;

  lastDash = timeNow;
  isDashing = true;
  setTimeout(() => { isDashing = false; }, dashTime * 1000);
}

function shoot() {
  // Play gunshot sound
  const audio = new Audio('assets/gunshot.wav');
  audio.play();

  // Recoil if F pressed
  if(keysPressed['KeyF']) {
    // Propel player backwards
    velocity.z -= 30;
    // Shoot no damage
    socket.emit('shoot', { damage: 0 });
  } else {
    // Shoot with damage
    socket.emit('shoot', { damage: 10 });
  }
}

let keysPressed = {};
document.addEventListener('keydown', (e) => { keysPressed[e.code] = true; });
document.addEventListener('keyup', (e) => { keysPressed[e.code] = false; });

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  updatePhysics(delta);

  renderer.render(scene, camera);
}

function updatePhysics(delta) {
  // Basic gravity
  velocity.y += gravity * delta;

  // Movement direction
  direction.z = Number(move.forward) - Number(move.backward);
  direction.x = Number(move.right) - Number(move.left);
  direction.normalize();

  // Move playerModel
  if(playerModel) {
    if(isDashing) {
      playerModel.position.x += direction.x * dashSpeed * delta;
      playerModel.position.z += direction.z * dashSpeed * delta;
    } else {
      playerModel.position.x += direction.x * speed * delta;
      playerModel.position.z += direction.z * speed * delta;
    }

    // Apply vertical velocity
    playerModel.position.y += velocity.y * delta;

    // Prevent going below map floor (assumed y=0)
    if(playerModel.position.y < 0) {
      health = 0;
      die();
    }

    // Simple collision with map bounds (you should do better collision with actual map model)
    if(playerModel.position.x < -50) playerModel.position.x = -50;
    if(playerModel.position.x > 50) playerModel.position.x = 50;
    if(playerModel.position.z < -50) playerModel.position.z = -50;
    if(playerModel.position.z > 50) playerModel.position.z = 50;

    // Reset jump if on ground (y=0)
    if(playerModel.position.y <= 0) {
      canJump = true;
      velocity.y = 0;
      playerModel.position.y = 0;
    }

    // Update camera behind player
    camera.position.lerp(new THREE.Vector3(playerModel.position.x, playerModel.position.y + 5, playerModel.position.z + 10), 0.1);
    camera.lookAt(playerModel.position);
  }

  // Send position to server
  socket.emit('move', {
    x: playerModel.position.x,
    y: playerModel.position.y,
    z: playerModel.position.z,
    rotationY: playerModel.rotation.y,
  });
}

function die() {
  alert('You died!');
  window.location.reload();
}

function updateHealthBar() {
  const healthBar = document.getElementById('healthBar');
  healthBar.style.width = `${(health/maxHealth)*100}%`;
}

function openChat() {
  chatOpen = true;
  chatUI.style.display = 'block';
  chatInput.focus();
}

function closeChat() {
  chatOpen = false;
  chatUI.style.display = 'none';
  chatInput.value = '';
}

function onChatInput(e) {
  if(e.key === 'Enter') {
    if(chatInput.value.trim() !== '') {
      socket.emit('chatMessage', chatInput.value.trim());
      addChatMessage('You: ' + chatInput.value.trim());
      chatInput.value = '';
      closeChat();
    }
  }
}

function addChatMessage(msg) {
  const chatMessagesDiv = document.getElementById('chatMessages');
  const msgElem = document.createElement('div');
  msgElem.textContent = msg;
  chatMessagesDiv.appendChild(msgElem);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function onWindowResize() {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
