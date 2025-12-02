// roomA.js － 第一輪公演 前台邏輯（完整版）

const socket = io();
const roomId = "A";

// 給每個裝置一個固定的 ID，用來防止刷新重複投票
const CLIENT_KEY_A = "voteA_clientId";
let clientId = localStorage.getItem(CLIENT_KEY_A);
if (!clientId) {
  clientId = "A_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  try {
    localStorage.setItem(CLIENT_KEY_A, clientId);
  } catch (e) {
    // 有些瀏覽器可能禁止 localStorage，就當成沒有 clientId
  }
}

// 告訴伺服器：我是在 A 房間的使用者
socket.on("connect", () => {
  socket.emit("join", { roomId, role: "user" });
  socket.emit("joinRoom", roomId);
  socket.emit("join-room", roomId);
});

// ---- 狀態 & 資料 ----
let statusNow = "waiting";      // waiting / voting / ending / ended / result
let countdown = 0;
let myChoiceIndex = null;       // 0~3
let hasVoted = false;
let liveItems = [];
let finalItems = [];
let endingTimerId = null;       // 前端自跑最後 6 秒倒數

const optionNames = ["Debut", "After like", "Rebel Heart", "Spinnin’ on it"];

// ---- 抓 DOM ----
const bgMain = document.getElementById("bgMain");

const stateWaiting = document.getElementById("stateWaiting");
const stateVote = document.getElementById("stateVote");
const stateLive = document.getElementById("stateLive");
const stateEnded = document.getElementById("stateEnded");
const stateResult = document.getElementById("stateResult");

const countLabel = document.getElementById("countLabel");
const countNumber = document.getElementById("countNumber");

const optionButtons = document.querySelectorAll(".option-btn");
const liveList = document.getElementById("liveList");
const finalList = document.getElementById("finalList");
const finalTitle = document.getElementById("finalTitle");

const overlayLast5 = document.getElementById("overlayLast5");
const overlaySeconds = document.getElementById("overlaySeconds");
const overlayChoice = document.getElementById("overlayChoice");

// ---- 共用：畫面切換 ----
function renderUI() {
  [stateWaiting, stateVote, stateLive, stateEnded, stateResult].forEach((el) =>
    el.classList.add("hidden")
  );
  overlayLast5.classList.add("hidden");
  finalTitle.style.display = "none";

  // 倒數顯示
  if (statusNow === "voting" || statusNow === "ending") {
    countLabel.style.visibility = "visible";
    countNumber.style.visibility = "visible";
  } else {
    countLabel.style.visibility = "hidden";
    countNumber.style.visibility = "hidden";
  }

  // 背景切換：未開始/已結束 顯示 start.jpg/end.jpg，其餘用 background.jpg
  if (statusNow === "waiting" || statusNow === "ended") {
    bgMain.style.backgroundImage = "none";
  } else {
    bgMain.style.backgroundImage = "url('background.jpg')";
  }

  if (statusNow === "waiting") {
    // 投票未開始：start.jpg
    stateWaiting.classList.remove("hidden");

  } else if (statusNow === "voting") {
    // 投票中
    if (hasVoted) {
      stateLive.classList.remove("hidden");
      renderLive();
    } else {
      stateVote.classList.remove("hidden");
    }

  } else if (statusNow === "ending") {
    // 最後 5 秒
    if (hasVoted) {
      stateLive.classList.remove("hidden");
      renderLive();
      if (countdown > 0) {
        overlaySeconds.textContent = countdown;
        overlayChoice.textContent =
          myChoiceIndex != null ? optionNames[myChoiceIndex] : "";
        overlayLast5.classList.remove("hidden");
      }
    } else {
      stateVote.classList.remove("hidden");
    }

  } else if (statusNow === "ended") {
    // 投票已結束：end.jpg
    stateEnded.classList.remove("hidden");

  } else if (statusNow === "result") {
    // 公布結果
    stateResult.classList.remove("hidden");
    finalTitle.style.display = "block";
    renderFinal();
  }
}

function updateCountdownUI() {
  countNumber.textContent = countdown;
}

// ---- 即時票數：長條圖 ----
function renderLive() {
  if (!liveList) return;
  liveList.innerHTML = "";

  let items = liveItems;
  if (!items || !items.length) {
    items = optionNames.map((name, index) => ({
      name,
      count: 0,
      index,
    }));
  }

  // 票數高到低排序
  items = [...items].sort((a, b) => (b.count || 0) - (a.count || 0));

  const total = items.reduce((sum, it) => sum + (it.count || 0), 0) || 1;

  items.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "live-item";
    if (item.index === myChoiceIndex) wrapper.classList.add("mine");

    const title = document.createElement("div");
    title.className = "live-title";
    title.textContent = item.name;

    const barBg = document.createElement("div");
    barBg.className = "bar-bg";

    const barFill = document.createElement("div");
    barFill.className = "bar-fill";

    const ratio = (item.count || 0) / total;
    const widthPercent = 20 + ratio * 80; // 至少 20%
    barFill.style.width = widthPercent + "%";

    barBg.appendChild(barFill);

    const countText = document.createElement("div");
    countText.className = "live-count";
    countText.textContent = `${item.count || 0} 票`;

    wrapper.appendChild(title);
    wrapper.appendChild(barBg);
    wrapper.appendChild(countText);
    liveList.appendChild(wrapper);
  });
}

// ---- 最終結果 ----
function renderFinal() {
  if (!finalList) return;
  finalList.innerHTML = "";

  let items = finalItems;
  if (!items || !items.length) {
    items = optionNames.map((name, index) => ({
      name,
      count: 0,
      index,
    }));
  }

  items.forEach((item) => {
    const block = document.createElement("div");
    block.className = "final-item";
    if (item.index === myChoiceIndex) block.classList.add("final-mine");

    const nameDiv = document.createElement("div");
    nameDiv.className = "final-name";
    nameDiv.textContent = item.name;

    const countDiv = document.createElement("div");
    countDiv.className = "final-count";
    countDiv.textContent = `${item.count || 0} 票`;

    block.appendChild(nameDiv);
    block.appendChild(countDiv);
    finalList.appendChild(block);
  });
}

// ---- 投票按鈕 ----
optionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (hasVoted) return;
    const idx = Number(btn.dataset.index || "0");
    myChoiceIndex = idx;
    hasVoted = true;

        socket.emit("vote", { roomId, index: idx, clientId });

    // 立刻切到即時票數畫面
    statusNow = "voting";
    renderUI();
  });
});

// ---- 解析伺服器傳來的票數格式 ----
function normalizeItems(payload) {
  if (!payload) return [];

  // { items: [...] }
  if (Array.isArray(payload.items)) return payload.items;

  // { votes: [..] }
  if (Array.isArray(payload.votes)) {
    return optionNames.map((name, index) => ({
      name,
      count: payload.votes[index] || 0,
      index,
    }));
  }

  // 直接是陣列 [..]
  if (Array.isArray(payload)) {
    return optionNames.map((name, index) => ({
      name,
      count: payload[index] || 0,
      index,
    }));
  }

  return [];
}

// ---- 處理即時票數 ----
function handleLive(payload) {
  const items = normalizeItems(payload);
  if (!items.length) return;
  liveItems = items;
  if (hasVoted && (statusNow === "voting" || statusNow === "ending")) {
    renderLive();
  }
}

// ---- 處理最終結果 ----
function handleFinal(payload) {
  let items = normalizeItems(payload);
  if (!items.length) return;
  items = [...items].sort((a, b) => (b.count || 0) - (a.count || 0));
  finalItems = items;
  statusNow = "result";
  renderUI();
}

// ---- 收伺服器事件 ----
socket.on("init", (data) => {
  if (!data) return;
  statusNow = data.status || "waiting";
  countdown = data.countdown ?? 60;

  const items = normalizeItems(data);
  if (items.length) liveItems = items;

  updateCountdownUI();
  renderUI();
});

// 狀態：waiting / voting / ending / ended / result
socket.on("status", (s) => {
  statusNow = s;

  // 進入最後 5 秒：前端自己跑 6→0，避免伺服器不同步
  if (s === "ending") {
    if (endingTimerId) clearInterval(endingTimerId);
    if (countdown > 6 || countdown <= 0) countdown = 6;
    updateCountdownUI();

    endingTimerId = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        countdown = 0;
        clearInterval(endingTimerId);
        endingTimerId = null;
        statusNow = "ended";
      }
      updateCountdownUI();
      renderUI();
    }, 1000);
  }

  renderUI();
});

// 倒數（非最後 5 秒時才用伺服器的數字）
socket.on("countdown", (num) => {
  if (statusNow === "ending" && endingTimerId) return;
  countdown = Number(num) || 0;
  updateCountdownUI();
});

// 伺服器回傳自己的選擇（如果有）
socket.on("yourChoice", (idx) => {
  if (typeof idx === "number") {
    myChoiceIndex = idx;
    hasVoted = true;
  }
});

// 多種事件名都視為即時票數更新
["live", "liveVotes", "votes", "update", "liveUpdate"].forEach((ev) => {
  socket.on(ev, handleLive);
});

// 多種事件名都視為最終結果
["final", "result", "finalVotes", "finalResult"].forEach((ev) => {
  socket.on(ev, handleFinal);
});

// 頁面載入先畫一次
renderUI();
