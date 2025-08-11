// server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PLAYER_MAX_HEALTH = 100;
const RESPAWN_Y = 5;
const FALL_DEATH_Y = -20;

let players = {}; // id -> {id, x,y,z, rotY, skin, health, alive, vx, vy, vz }

function createPlayer(id) {
  return {
    id,
    x: 0,
    y: 5,
    z: 0,
    rotY: 0,
    skin: 0,
    health: PLAYER_MAX_HEALTH,
    alive: true,
    vx: 0,
    vy: 0,
    vz: 0,
    score: 0
  };
}

io.on("connection", socket => {
  console.log("connect", socket.id);
  players[socket.id] = createPlayer(socket.id);

  // send current players to new client
  socket.emit("currentPlayers", players);

  // announce new player
  socket.broadcast.emit("newPlayer", players[socket.id]);

  socket.on("move", data => {
    const p = players[socket.id];
    if (!p) return;
    // update position + rotation client authoritative but server stores it
    p.x = data.x;
    p.y = data.y;
    p.z = data.z;
    p.rotY = data.rotY || p.rotY;
    p.skin = typeof data.skin === "number" ? data.skin : p.skin;
    // velocities can be sent occasionally for smoother server-side effects
    if (data.vx !== undefined) p.vx = data.vx;
    if (data.vy !== undefined) p.vy = data.vy;
    if (data.vz !== undefined) p.vz = data.vz;

    // kill if fell off map
    if (p.y < FALL_DEATH_Y && p.alive) {
      p.alive = false;
      p.health = 0;
      io.emit("playerDied", { id: p.id, reason: "fell" });
      // schedule respawn after short delay
      setTimeout(() => {
        p.x = (Math.random() - 0.5) * 10;
        p.y = RESPAWN_Y;
        p.z = (Math.random() - 0.5) * 10;
        p.health = PLAYER_MAX_HEALTH;
        p.alive = true;
        io.emit("playerRespawn", { id: p.id, x: p.x, y: p.y, z: p.z, health: p.health });
      }, 1500);
    }

    io.emit("playerMoved", { id: p.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY, skin: p.skin });
  });

  socket.on("shoot", data => {
    // data: {origin: {x,y,z}, dir: {x,y,z}, isBoost: bool, range: number}
    const shooter = players[socket.id];
    if (!shooter || !shooter.alive) return;

    const origin = data.origin;
    const dir = data.dir;
    const range = data.range || 50;
    const isBoost = !!data.isBoost;

    // emit shot playback to all clients (for sounds/visuals)
    io.emit("playerShot", { id: socket.id, origin, dir, isBoost });

    if (isBoost) {
      // For boost shots, no damage, apply knockback to shooter (server not simulating velocities long-term).
      // send knockback impulse to the shooter client
      const impulse = {
        ix: -dir.x * 8,
        iy: -dir.y * 8 + 2,
        iz: -dir.z * 8
      };
      io.to(socket.id).emit("applyImpulse", { id: socket.id, impulse });
      return;
    }

    // For normal shots, do simple hit detection: check distance from line segment to each player's position
    const hitPlayers = [];
    const hitRadius = 1.2; // how close to the ray the player must be
    for (const otherId in players) {
      if (otherId === socket.id) continue;
      const p = players[otherId];
      if (!p.alive) continue;
      // vector from origin to player
      const ox = p.x - origin.x;
      const oy = p.y - origin.y;
      const oz = p.z - origin.z;
      // project onto dir: t = dot(ox,dir)
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > range) continue; // outside segment
      // closest point
      const cx = origin.x + dir.x * t;
      const cy = origin.y + dir.y * t;
      const cz = origin.z + dir.z * t;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dz = p.z - cz;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 <= hitRadius * hitRadius) {
        hitPlayers.push({ id: otherId, dist2 });
      }
    }

    if (hitPlayers.length > 0) {
      // pick nearest hit
      hitPlayers.sort((a, b) => a.dist2 - b.dist2);
      const hit = players[hitPlayers[0].id];
      const damage = data.damage || 25;
      hit.health -= damage;
      if (hit.health <= 0) {
        hit.health = 0;
        hit.alive = false;
        players[socket.id].score = (players[socket.id].score || 0) + 1;
        io.emit("playerDied", { id: hit.id, killer: socket.id, reason: "shot" });
        // respawn after short delay
        setTimeout(() => {
          hit.x = (Math.random() - 0.5) * 10;
          hit.y = RESPAWN_Y;
          hit.z = (Math.random() - 0.5) * 10;
          hit.health = PLAYER_MAX_HEALTH;
          hit.alive = true;
          io.emit("playerRespawn", { id: hit.id, x: hit.x, y: hit.y, z: hit.z, health: hit.health });
        }, 1500);
      } else {
        // if still alive, send damage event
        io.emit("playerHit", { id: hit.id, health: hit.health, from: socket.id });
      }
    }
  });

  socket.on("chatMessage", msg => {
    io.emit("chatMessage", { id: socket.id, msg });
  });

  socket.on("disconnect", () => {
    console.log("disconnect", socket.id);
    delete players[socket.id];
    io.emit("playerDisconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
