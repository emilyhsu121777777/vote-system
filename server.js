// server.js － A 房 + B 房 即時投票系統

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

// ----- 房間資料 -----
const rooms = {
  A: {
    title: "第一輪公演",
    duration: 30,          // 秒
    status: "waiting",     // waiting / voting / ending / ended
    countdown: 30,
    votes: [0, 0, 0, 0],   // 4 個選項
    timer: null,
    clients: {},           // { clientId: { index, indices: [...] } }
  },
  B: {
    title: "建築小姐",
    duration: 90,                     // Room B：90 秒
    status: "waiting",
    countdown: 90,
    votes: new Array(24).fill(0),      // 24 個選項
    timer: null,
    clients: {},                       // 每個 client 3 票
  },
};

function broadcastRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  io.to(roomId).emit("status", room.status);
  io.to(roomId).emit("countdown", room.countdown);
  io.to(roomId).emit("live", { votes: room.votes });
}

// ----- Socket.io -----
io.on("connection", (socket) => {
  console.log("a user connected:", socket.id);

  function joinRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  socket.join(roomId);

  socket.emit("init", {
    status: room.status,
    countdown: room.countdown,
    votes: room.votes,
  });

  // ✅ 如果現在已經在「公布結果」階段，剛進來的人也要看到結果
  if (room.status === "result") {
    socket.emit("final", { votes: room.votes });
  }
}


  socket.on("join", ({ roomId }) => {
    joinRoom(roomId);
  });

  socket.on("joinRoom", (roomId) => {
    joinRoom(roomId);
  });

  socket.on("join-room", (roomId) => {
    joinRoom(roomId);
  });

  // 使用者投票
  socket.on("vote", ({ roomId, index, indices, clientId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!room.clients) room.clients = {};
    const key = clientId || socket.id;
    const existing = room.clients[key];

    // 這個 client 在這一輪已經投過票
    if (existing) {
      if (roomId === "A" && typeof existing.index === "number") {
        socket.emit("yourChoice", existing.index);
      } else if (roomId === "B" && Array.isArray(existing.indices)) {
        socket.emit("yourChoice", existing.indices);
      }
      return;
    }

    // A 房：單選一票
    if (roomId === "A") {
      const i = Number(index);
      if (isNaN(i) || i < 0 || i >= room.votes.length) return;

      room.votes[i] += 1;
      room.clients[key] = { index: i, indices: [i] };

      socket.emit("yourChoice", i);
      io.to(roomId).emit("live", { votes: room.votes });
      return;
    }

    // B 房：最多 3 票，不同選項
    if (roomId === "B") {
      let arr = [];

      if (Array.isArray(indices)) {
        arr = indices.map((n) => Number(n));
      } else if (index !== undefined) {
        arr = [Number(index)];
      }

      // 過濾非法 & 重複
      const seen = new Set();
      arr = arr.filter((i) => {
        if (isNaN(i)) return false;
        if (i < 0 || i >= room.votes.length) return false;
        if (seen.has(i)) return false;
        seen.add(i);
        return true;
      });

      // 最多 3 個
      arr = arr.slice(0, 3);

      if (!arr.length) return;

      arr.forEach((i) => {
        room.votes[i] += 1;
      });

      room.clients[key] = { indices: arr };

      socket.emit("yourChoice", arr);
      io.to(roomId).emit("live", { votes: room.votes });
      return;
    }
  });

  // 後台：開始投票（重置票數 & client 紀錄）
  socket.on("adminStart", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    console.log(`Room ${roomId} start voting`);

    room.status = "voting";
    room.countdown = room.duration;
    room.votes = new Array(room.votes.length).fill(0);
    room.clients = {};

    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }

    broadcastRoomState(roomId);

    room.timer = setInterval(() => {
      room.countdown -= 1;

      if (room.countdown === 5) {
        room.status = "ending";
        io.to(roomId).emit("status", room.status);
      }

      io.to(roomId).emit("countdown", room.countdown);

      if (room.countdown <= 0) {
        room.status = "ended";
        io.to(roomId).emit("status", room.status);

        clearInterval(room.timer);
        room.timer = null;
      }
    }, 1000);
  });

// 後台：公布結果
socket.on("adminShowResult", (roomId) => {
  const room = rooms[roomId];
  if (!room) return;

  console.log(`Room ${roomId} show final result`);

  // ✅ 1) 狀態改成 result（表示現在是「公布結果」階段）
  room.status = "result";
  io.to(roomId).emit("status", room.status);

  // ✅ 2) 把最終票數丟給所有前台
  io.to(roomId).emit("final", { votes: room.votes });
});



  // 🔄 後台：重置房間
  socket.on("adminReset", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    console.log(`Room ${roomId} RESET`);

    // 停止計時器
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }

    // 回到初始狀態
    room.status = "waiting";          // 顯示 start.jpg 用的狀態
    room.countdown = room.duration;   // 重設倒數秒數
    room.votes = new Array(room.votes.length).fill(0);
    room.clients = {};                // 清空該輪已投票紀錄

    // 通知前台
    io.to(roomId).emit("reset", {
      status: room.status,
      countdown: room.countdown,
      votes: room.votes
    });

    // 通知後台（可有可無）
    io.to(`admin-${roomId}`).emit("resetDone", roomId);
  });


  socket.on("disconnect", () => {
    console.log("user disconnected:", socket.id);
  });
});

// Railway / 本地皆可運作的啟動方式
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

