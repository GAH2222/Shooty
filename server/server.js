const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'docs')));

let players = {};

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('joinGame', ({ skin }) => {
    players[socket.id] = {
      id: socket.id,
      position: { x: 0, y: 5, z: 0 },
      rotationY: 0,
      health: 100,
      skin: skin || 'Shawty1.glb',
      name: `Player_${socket.id.substring(0, 4)}`
    };

    // Send initial game data to this player
    socket.emit('gameData', { players });

    // Notify all players about new player
    socket.broadcast.emit('gameData', { players });
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].position = {
        x: data.x,
        y: data.y,
        z: data.z
      };
      players[socket.id].rotationY = data.rotationY;
    }
    io.emit('gameData', { players });
  });

  socket.on('shoot', ({ damage }) => {
    // For simplicity, just broadcast a hit event with damage to all players except shooter
    // You could improve this by raycasting / collision detection on server

    // Example: randomly pick a player to damage (not shooter)
    const otherIds = Object.keys(players).filter(id => id !== socket.id);
    if (damage > 0 && otherIds.length > 0) {
      const victimId = otherIds[Math.floor(Math.random() * otherIds.length)];
      players[victimId].health -= damage;
      if (players[victimId].health < 0) players[victimId].health = 0;

      io.to(victimId).emit('playerHit', { id: victimId, damage });
    }
  });

  socket.on('chatMessage', (msg) => {
    const playerName = players[socket.id]?.name || 'Unknown';
    io.emit('chatMessage', { playerName, message: msg });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('gameData', { players });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
