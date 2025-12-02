// roomB.js － 建築小姐（24 選，每人 3 票，照片小卡版）

const socketB = io();
const roomIdB = "B";

// 每個裝置一個固定 ID，防刷新灌票
const CLIENT_KEY_B = "voteB_clientId";
let clientIdB = localStorage.getItem(CLIENT_KEY_B);
if (!clientIdB) {
  clientIdB = "B_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  try {
    localStorage.setItem(CLIENT_KEY_B, clientIdB);
  } catch (e) {}
}

// 24 張照片檔名（依字母＋中文排序）
const photoFilesB = [
  "Aina.jpg",
  "Andry.jpg",
  "Angelababy.jpg",
  "Benny.jpg",
  "Choi.jpg",
  "Eliya.jpg",
  "Isa.jpg",
  "Kitty.jpg",
  "Kuwa.jpg",
  "Lynna.jpg",
  "Maureen.jpg",
  "Megan.jpg",
  "Olivia.jpg",
  "Rainy.jpg",
  "Recolia.jpg",
  "Ryana.jpg",
  "Smart.jpg",
  "Umi.jpg",
  "Windy.jpg",
  "Yinna.jpg",
  "小蛋糕.jpg",
  "狂犀.jpg",
  "紅姐.jpg",
  "超甲.jpg"
];

// 顯示名稱：檔名去掉副檔名
const optionNamesB = photoFilesB.map((file) =>
  file.replace(/\.[^.]+$/, "")
);

// 狀態
let statusNowB = "waiting";              // waiting / voting / ending / ended / result
let countdownB = 0;
let hasVotedB = false;
let myChoicesB = [];                     // [index1, index2, index3]
let liveVotesB = new Array(photoFilesB.length).fill(0);
let finalVotesB = new Array(photoFilesB.length).fill(0);
let endingTimerIdB = null;

// DOM
const bgMainB = document.getElementById("bgMainB");
const stateWaitingB = document.getElementById("stateWaitingB");
const stateVoteB = document.getElementById("stateVoteB");
const stateLiveB = document.getElementById("stateLiveB");
const stateEndedB = document.getElementById("stateEndedB");
const stateResultB = document.getElementById("stateResultB");

const countLabelB = document.getElementById("countLabelB");
const countNumberB = document.getElementById("countNumberB");

const cardsGridB = document.getElementById("cardsGridB");
const selectedCountB = document.getElementById("selectedCountB");
const submitB = document.getElementById("submitB");

const liveListB = document.getElementById("liveListB");
const finalListB = document.getElementById("finalListB");
const finalTitleB = document.getElementById("finalTitleB");

const overlayLast5B = document.getElementById("overlayLast5B");
const overlaySecondsB = document.getElementById("overlaySecondsB");
const overlayChoiceB = document.getElementById("overlayChoiceB");

// 加入 B 房
socketB.on("connect", () => {
  socketB.emit("join", { roomId: roomIdB, role: "user" });
  socketB.emit("joinRoom", roomIdB);
  socketB.emit("join-room", roomIdB);
});

// 建立 24 張照片小卡
function buildCards() {
  cardsGridB.innerHTML = "";
  optionNamesB.forEach((name, index) => {
    const btn = document.createElement("button");
    btn.className = "card-btn";
    btn.dataset.index = index;

    const img = document.createElement("img");
    img.className = "card-thumb";
    img.src = "roomB/" + photoFilesB[index]; // 對應 public/roomB/xxx.jpg
    img.alt = name;

    const label = document.createElement("div");
    label.className = "card-name";
    label.textContent = name; // 不含 .jpg

    btn.appendChild(img);
    btn.appendChild(label);

    btn.addEventListener("click", () => {
      if (hasVotedB) return;
      toggleSelect(index, btn);
    });

    cardsGridB.appendChild(btn);
  });
}

function toggleSelect(index, btn) {
  const pos = myChoicesB.indexOf(index);
  if (pos >= 0) {
    myChoicesB.splice(pos, 1);
    btn.classList.remove("selected");
  } else {
    if (myChoicesB.length >= 3) return;
    myChoicesB.push(index);
    btn.classList.add("selected");
  }
  selectedCountB.textContent = `已選擇 ${myChoicesB.length} / 3`;
  submitB.disabled = myChoicesB.length === 0;
}

// 送出投票（一次送 3 票）
submitB.addEventListener("click", () => {
  if (hasVotedB || myChoicesB.length === 0) return;

  socketB.emit("vote", {
    roomId: roomIdB,
    indices: myChoicesB,
    clientId: clientIdB
  });

  hasVotedB = true;
  statusNowB = "voting";
  renderUIB();
});

// UI 切換
function renderUIB() {
  [stateWaitingB, stateVoteB, stateLiveB, stateEndedB, stateResultB].forEach((el) =>
    el.classList.add("hidden")
  );
  overlayLast5B.classList.add("hidden");
  finalTitleB.style.display = "none";

  if (statusNowB === "waiting" || statusNowB === "ended") {
    bgMainB.style.backgroundImage = "none";
  } else {
    bgMainB.style.backgroundImage = "url('background.jpg')";
  }

  if (statusNowB === "voting" || statusNowB === "ending") {
    countLabelB.style.visibility = "visible";
    countNumberB.style.visibility = "visible";
  } else {
    countLabelB.style.visibility = "hidden";
    countNumberB.style.visibility = "hidden";
  }

  if (statusNowB === "waiting") {
    stateWaitingB.classList.remove("hidden");
  } else if (statusNowB === "voting") {
    if (hasVotedB) {
      stateLiveB.classList.remove("hidden");
      renderLiveB();
    } else {
      stateVoteB.classList.remove("hidden");
    }
  } else if (statusNowB === "ending") {
    if (hasVotedB) {
      stateLiveB.classList.remove("hidden");
      renderLiveB();
      if (countdownB > 0) {
        overlaySecondsB.textContent = countdownB;
        overlayChoiceB.textContent = myChoicesB
          .map((i) => optionNamesB[i])
          .join("\n");
        overlayLast5B.classList.remove("hidden");
      }
    } else {
      stateVoteB.classList.remove("hidden");
    }
  } else if (statusNowB === "ended") {
    stateEndedB.classList.remove("hidden");
  } else if (statusNowB === "result") {
    stateResultB.classList.remove("hidden");
    finalTitleB.style.display = "block";
    renderFinalB();
  }
}

function updateCountdownUIB() {
  countNumberB.textContent = countdownB;
}

// 即時前五名長條圖
function renderLiveB() {
  liveListB.innerHTML = "";

  const items = optionNamesB.map((name, index) => ({
    name,
    index,
    count: liveVotesB[index] || 0
  }));

  items.sort((a, b) => (b.count || 0) - (a.count || 0));
  const top5 = items.slice(0, 5);
  const total = top5.reduce((s, it) => s + (it.count || 0), 0) || 1;

  top5.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "live-item";
    if (myChoicesB.includes(item.index)) wrapper.classList.add("mine");

    const title = document.createElement("div");
    title.className = "live-title";
    title.textContent = item.name;

    const barBg = document.createElement("div");
    barBg.className = "bar-bg";

    const barFill = document.createElement("div");
    barFill.className = "bar-fill";

    const ratio = (item.count || 0) / total;
    const widthPercent = 20 + ratio * 80;
    barFill.style.width = widthPercent + "%";

    barBg.appendChild(barFill);

    const countText = document.createElement("div");
    countText.className = "live-count";
    countText.textContent = `${item.count || 0} 票`;

    wrapper.appendChild(title);
    wrapper.appendChild(barBg);
    wrapper.appendChild(countText);

    liveListB.appendChild(wrapper);
  });
}

// 最終結果（全部 24 名）
function renderFinalB() {
  finalListB.innerHTML = "";

  const items = optionNamesB.map((name, index) => ({
    name,
    index,
    count: finalVotesB[index] || 0
  }));

  items.sort((a, b) => (b.count || 0) - (a.count || 0));

  items.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "final-item";
    if (myChoicesB.includes(item.index)) row.classList.add("final-mine");

    const rank = document.createElement("div");
    rank.className = "final-rank";
    rank.textContent = idx + 1;

    const nameDiv = document.createElement("div");
    nameDiv.className = "final-name";
    nameDiv.textContent = item.name;

    const countDiv = document.createElement("div");
    countDiv.className = "final-count";
    countDiv.textContent = item.count || 0;

    row.appendChild(rank);
    row.appendChild(nameDiv);
    row.appendChild(countDiv);
    finalListB.appendChild(row);
  });
}

// 收伺服器事件
socketB.on("init", (data) => {
  if (!data) return;
  statusNowB = data.status || "waiting";
  countdownB = data.countdown ?? 120;
  liveVotesB =
    (data.votes && data.votes.slice()) ||
    new Array(photoFilesB.length).fill(0);
  updateCountdownUIB();
  renderUIB();
});

socketB.on("status", (s) => {
  statusNowB = s;

  if (s === "ending") {
    if (endingTimerIdB) clearInterval(endingTimerIdB);
    if (countdownB > 6 || countdownB <= 0) countdownB = 6;
    updateCountdownUIB();

    endingTimerIdB = setInterval(() => {
      countdownB -= 1;
      if (countdownB <= 0) {
        countdownB = 0;
        clearInterval(endingTimerIdB);
        endingTimerIdB = null;
        statusNowB = "ended";
      }
      updateCountdownUIB();
      renderUIB();
    }, 1000);
  }

  renderUIB();
});

socketB.on("countdown", (n) => {
  if (statusNowB === "ending" && endingTimerIdB) return;
  countdownB = Number(n) || 0;
  updateCountdownUIB();
});

// 若伺服器回傳自己的選擇（重新整理後）
socketB.on("yourChoice", (indices) => {
  if (Array.isArray(indices)) {
    myChoicesB = indices;
    hasVotedB = true;
  }
});

// 即時票數
socketB.on("live", (payload) => {
  if (!payload || !Array.isArray(payload.votes)) return;
  liveVotesB = payload.votes.slice();
  if (hasVotedB && (statusNowB === "voting" || statusNowB === "ending")) {
    renderLiveB();
  }
});

// 最終結果
socketB.on("final", (payload) => {
  if (!payload || !Array.isArray(payload.votes)) return;
  finalVotesB = payload.votes.slice();
  statusNowB = "result";
  renderUIB();
});

// 初始化
buildCards();
renderUIB();
