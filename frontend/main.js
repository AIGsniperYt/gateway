const log = document.getElementById("log");
const input = document.getElementById("cmdInput");
const dropdown = document.getElementById("dropdown");
const hint = document.getElementById("hint");
const statusEl = document.getElementById("status");
const tabs = document.querySelectorAll(".tab");
const terminalPanel = document.getElementById("terminal-panel");
const dashboardPanel = document.getElementById("dashboard-panel");
const dashGrid = document.getElementById("dash-grid");
const refreshBtn = document.getElementById("refreshBtn");

input.value = "AT"; // most commands start with AT

// CHANGE THIS TO YOUR ESP IP
const ws = new WebSocket("ws://192.168.1.165/ws");

ws.onopen = () => {
    append("Connected to ESP WebSocket");
    setStatus("connected");
};
ws.onmessage = (msg) => {
    append(msg.data);
    feedDashboard(msg.data);
};
ws.onerror = (err) => append("WebSocket error: " + err);
ws.onclose = () => {
    append("WebSocket closed");
    setStatus("disconnected");
};

function setStatus(state) {
    statusEl.textContent = state;
    statusEl.className = "status " + state;
}

// ---------- tabs ----------

function switchTab(name) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    terminalPanel.hidden = name !== "terminal";
    dashboardPanel.hidden = name !== "dashboard";
}

tabs.forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

// ---------- dashboard ----------

const DASHBOARD = [
    {
        id: "temp",
        title: "Temperature",
        cmd: "AT+CMTE?",
        unit: "°C",
        regex: /\+CMTE:\s*\d,\s*(-?[\d.]+)/,
        format: (m) => m[1],
    },
    {
        id: "signal",
        title: "Signal Quality",
        cmd: "AT+CSQ",
        regex: /\+CSQ:\s*(\d+),\s*(\d+)/,
        format: (m) => m[1] + "/31",
        bar: (m) => Math.round((parseInt(m[1], 10) / 31) * 100),
    },
    {
        id: "sim",
        title: "SIM Status",
        cmd: "AT+CPIN?",
        regex: /\+CPIN:\s*(\w+)/,
        format: (m) => m[1],
    },
    {
        id: "battery",
        title: "Battery",
        cmd: "AT+CBC",
        regex: /\+CBC:\s*\d,\s*(\d+),\s*(\d+)/,
        format: (m) => m[1] + "% · " + (parseInt(m[2], 10) / 1000).toFixed(2) + "V",
        bar: (m) => parseInt(m[1], 10),
    },
    {
        id: "operator",
        title: "Network Operator",
        cmd: "AT+COPS?",
        regex: /\+COPS:\s*\d,\s*\d,\s*"([^"]*)"/,
        format: (m) => m[1] || "unknown",
    },
];

let dashCurrent = null;
let dashRunning = false;
let refreshQueued = false;

function buildDashboard() {
    DASHBOARD.forEach((card) => {
        const el = document.createElement("div");
        el.className = "stat-card";
        el.id = "card-" + card.id;

        let barHtml = "";
        if (card.bar) {
            barHtml = '<div class="stat-bar"><div class="stat-bar-fill"></div></div>';
        }

        el.innerHTML =
            '<div class="stat-title">' + card.title + "</div>" +
            '<div class="stat-value">--</div>' +
            barHtml +
            '<div class="stat-sub">' + card.cmd + "</div>";

        dashGrid.appendChild(el);
    });
}

function updateCard(card, m, err) {
    const el = document.getElementById("card-" + card.id);
    const valEl = el.querySelector(".stat-value");
    const subEl = el.querySelector(".stat-sub");

    el.classList.remove("ok", "error");

    if (m && card.format(m)) {
        valEl.textContent = card.format(m) + (card.unit || "");
        el.classList.add("ok");
        const fill = el.querySelector(".stat-bar-fill");
        if (fill && card.bar) fill.style.width = card.bar(m) + "%";
    } else {
        valEl.textContent = err || "--";
        el.classList.add("error");
    }
    subEl.textContent = card.cmd + " · " + new Date().toLocaleTimeString();
}

// send one dashboard command over the ws and wait for its response
function sendDashboard(card) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            if (dashCurrent && dashCurrent.card.id === card.id) {
                const cur = dashCurrent;
                dashCurrent = null;
                updateCard(cur.card, null, "timeout");
                cur.resolve();
            }
        }, 4000);

        dashCurrent = { card, buffer: "", resolve, timeout };
        ws.send(card.cmd);
    });
}

// feed incoming ws lines to the pending dashboard command
function feedDashboard(line) {
    if (!dashCurrent) return;
    dashCurrent.buffer += line;
    const m = dashCurrent.buffer.match(dashCurrent.card.regex);
    const done = m || /(^|\n)OK(\r?\n|$)/.test(dashCurrent.buffer) || /ERROR/.test(dashCurrent.buffer);

    if (done) {
        const cur = dashCurrent;
        dashCurrent = null;
        clearTimeout(cur.timeout);
        updateCard(cur.card, m);
        cur.resolve();
    }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function dashCycle() {
    if (ws.readyState !== WebSocket.OPEN) {
        setTimeout(dashCycle, 2000);
        return;
    }
    for (const card of DASHBOARD) {
        await sendDashboard(card);
        await sleep(500);
    }
    dashRunning = false;
    if (refreshQueued) {
        refreshQueued = false;
        dashRunning = true;
        dashCycle();
    }
}

function pollDashboard() {
    if (dashRunning) {
        refreshQueued = true;
        return;
    }
    dashRunning = true;
    dashCycle();
}

buildDashboard();
pollDashboard();

refreshBtn.addEventListener("click", pollDashboard);

// ---------- terminal autocomplete ----------

const COMMANDS = [
    { cmd: "AT", desc: "test connection (should return OK)" },
    { cmd: "ATE0", desc: "turn echo OFF" },
    { cmd: "ATE1", desc: "turn echo ON" },
    { cmd: "ATI", desc: "device info" },
    { cmd: "AT+GMR", desc: "firmware version" },
    { cmd: "AT+CSCS?", desc: "check character set" },
    { cmd: 'AT+CSCS="GSM"', desc: "set character set" },
    { cmd: "AT+CPIN?", desc: "SIM status (READY / SIM PIN / SIM PUK)" },
    { cmd: "AT+CSQ", desc: "signal quality (0-31)" },
    { cmd: "AT+CREG?", desc: "network registration status" },
    { cmd: "AT+COPS?", desc: "current operator" },
    { cmd: "AT+COPS=?", desc: "list available operators" },
    { cmd: "AT+CNUM", desc: "show your phone number (if SIM supports it)" },
    { cmd: "AT+CLIP=1", desc: "enable caller ID" },
    { cmd: "ATD<number>;", desc: "dial voice call (semicolon required)" },
    { cmd: "ATH", desc: "hang up" },
    { cmd: "ATA", desc: "answer incoming call" },
    { cmd: "AT+CLCC", desc: "list current calls" },
    { cmd: "AT+CENG?", desc: "engineering mode (cell tower info)" },
    { cmd: "AT+CBAND?", desc: "check GSM band" },
    { cmd: 'AT+CBAND="EGSM"', desc: "set band" },
    { cmd: "AT+CMTE?", desc: "temperature" },
    { cmd: "AT+CGSN", desc: "IMEI" },
    { cmd: "AT+CPAS", desc: "phone activity status" },
    { cmd: "AT+CMGF=1", desc: "enable text mode" },
    { cmd: 'AT+CMGS="<number>"', desc: "send SMS" },
    { cmd: 'AT+CMGL="ALL"', desc: "list all messages" },
    { cmd: "AT+CMGR=1", desc: "read message #1" },
    { cmd: "AT+CMGD=1", desc: "delete message #1" },
    { cmd: "AT+CMGD=1,4", desc: "delete all messages" },
    { cmd: "/clear", desc: "clear the terminal" },
];

let matches = [];
let selected = -1;

function matchCommands(value) {
    const v = value.toUpperCase();
    if (!v) return [];
    return COMMANDS.filter((c) => c.cmd.toUpperCase().startsWith(v));
}

function renderDropdown() {
    dropdown.innerHTML = "";
    if (!matches.length) {
        dropdown.style.display = "none";
        hint.textContent = "";
        return;
    }
    dropdown.style.display = "block";
    matches.forEach((c, i) => {
        const el = document.createElement("div");
        el.className = "item" + (i === selected ? " selected" : "");
        const prefix = input.value.length;
        el.innerHTML =
            '<span class="cmd"><span class="match">' + escapeHtml(c.cmd.slice(0, prefix)) + "</span>" +
            escapeHtml(c.cmd.slice(prefix)) + "</span>" +
            '<span class="desc">— ' + escapeHtml(c.desc) + "</span>";
        el.onmousedown = (e) => {
            e.preventDefault();
            choose(i);
        };
        dropdown.appendChild(el);
    });
    if (selected >= 0 && dropdown.children[selected]) {
        dropdown.children[selected].scrollIntoView({ block: "nearest" });
    }
    updateHint();
}

function updateHint() {
    if (selected >= 0 && matches[selected]) {
        hint.textContent = matches[selected].desc;
    } else if (matches.length === 1) {
        hint.textContent = matches[0].desc;
    } else {
        hint.textContent = "tab to autocomplete, arrows to browse";
    }
}

function choose(i) {
    input.value = matches[i].cmd;
    selected = -1;
    matches = [];
    renderDropdown();
    input.focus();
}

function update(value) {
    matches = matchCommands(value);
    selected = matches.length === 1 ? 0 : -1;
    renderDropdown();
}

function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

input.addEventListener("input", () => update(input.value));

input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        if (selected >= 0 && matches[selected]) choose(selected);
        else sendCmd();
    } else if (e.key === "Tab") {
        e.preventDefault();
        if (matches.length) choose(selected >= 0 ? selected : 0);
    } else if (e.key === "ArrowDown") {
        if (!matches.length) return;
        e.preventDefault();
        selected = (selected + 1) % matches.length;
        renderDropdown();
    } else if (e.key === "ArrowUp") {
        if (!matches.length) return;
        e.preventDefault();
        selected = (selected - 1 + matches.length) % matches.length;
        renderDropdown();
    } else if (e.key === "Escape") {
        matches = [];
        selected = -1;
        renderDropdown();
    }
});

input.addEventListener("blur", () => {
    dropdown.style.display = "none";
    hint.textContent = "";
});

document.addEventListener("click", () => input.focus());

function append(line) {
    log.textContent += line + "\n";
    log.scrollTop = log.scrollHeight;
}

function sendCmd() {
    const cmd = input.value.trim();
    if (!cmd) return;

    if (cmd === "/clear" || cmd === "clear") {
        log.textContent = "";
        input.value = "";
        input.focus();
        return;
    }

    append("> " + cmd);
    ws.send(cmd);   // send raw AT command to ESP
    input.value = "";
    matches = [];
    selected = -1;
    renderDropdown();
    input.focus();
}