const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let players = {};

io.on("connection", socket => {
    console.log("Player connected:", socket.id);

    players[socket.id] = {
        id: socket.id,
        x: 0, y: 0, z: 0,
        rotY: 0,
        skin: 0,
        score: 0
    };

    socket.emit("currentPlayers", players);
    socket.broadcast.emit("newPlayer", players[socket.id]);

    socket.on("move", data => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].rotY = data.rotY;
            io.emit("playerMoved", players[socket.id]);
        }
    });

    socket.on("shoot", data => {
        io.emit("playerShot", { id: socket.id, ...data });
    });

    socket.on("chatMessage", msg => {
        io.emit("chatMessage", { id: socket.id, msg });
    });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
        delete players[socket.id];
        io.emit("playerDisconnected", socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
