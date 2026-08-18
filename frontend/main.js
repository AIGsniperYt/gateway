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
const smsPanel = document.getElementById("sms-panel");
const smsNumber = document.getElementById("smsNumber");
const smsText = document.getElementById("smsText");
const smsSendBtn = document.getElementById("smsSendBtn");
const smsStatus = document.getElementById("smsStatus");
const smsRefreshBtn = document.getElementById("smsRefreshBtn");
const smsList = document.getElementById("smsList");
const smsReadPane = document.getElementById("smsReadPane");

input.value = "AT"; // most commands start with AT

// CHANGE THIS TO YOUR ESP IP
const ws = new WebSocket("ws://192.168.1.165/ws");

ws.onopen = () => {
    append("Connected to ESP WebSocket");
    setStatus("connected");
};
ws.onmessage = (msg) => {
    append(msg.data);
    feedCommand(msg.data);
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

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ---------- tabs ----------

function switchTab(name) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    terminalPanel.hidden = name !== "terminal";
    dashboardPanel.hidden = name !== "dashboard";
    smsPanel.hidden = name !== "sms";
}

tabs.forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

// ---------- serialized command queue ----------
// every AT command that goes over the ws waits its turn so responses
// never get interleaved between the dashboard, SMS, and other flows.

const cmdQueue = [];
let cmdActive = null;

function sendCommand(cmd, opts = {}) {
    return new Promise((resolve) => {
        cmdQueue.push({ cmd, opts, resolve });
        pumpQueue();
    });
}

function pumpQueue() {
    if (cmdActive || !cmdQueue.length) return;
    if (ws.readyState !== WebSocket.OPEN) {
        const job = cmdQueue.shift();
        job.resolve({ buffer: "", match: null, error: "ws not open" });
        pumpQueue();
        return;
    }
    const job = cmdQueue.shift();
    cmdActive = { ...job, buffer: "" };
    const timeout = setTimeout(() => {
        if (cmdActive) {
            const j = cmdActive;
            cmdActive = null;
            j.resolve({ buffer: j.buffer, match: null, error: "timeout" });
            pumpQueue();
        }
    }, job.opts.timeout || 4000);
    cmdActive.timeout = timeout;
    ws.send(job.cmd);
}

function feedCommand(line) {
    if (!cmdActive) return;
    cmdActive.buffer += line;
    const match = cmdActive.buffer.match(cmdActive.opts.regex);
    const done =
        (cmdActive.opts.done ? cmdActive.opts.done(cmdActive.buffer) : false) ||
        match ||
        /(^|\n)OK(\r?\n|$)/.test(cmdActive.buffer) ||
        /ERROR/.test(cmdActive.buffer);

    if (done) {
        const j = cmdActive;
        cmdActive = null;
        clearTimeout(j.timeout);
        j.resolve({ buffer: j.buffer, match });
        pumpQueue();
    }
}

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

function updateCard(card, r) {
    const el = document.getElementById("card-" + card.id);
    const valEl = el.querySelector(".stat-value");
    const subEl = el.querySelector(".stat-sub");

    el.classList.remove("ok", "error");

    if (r.match && card.format(r.match)) {
        valEl.textContent = card.format(r.match) + (card.unit || "");
        el.classList.add("ok");
        const fill = el.querySelector(".stat-bar-fill");
        if (fill && card.bar) fill.style.width = card.bar(r.match) + "%";
    } else {
        valEl.textContent = r.error === "timeout" ? "timeout" : "--";
        el.classList.add("error");
    }
    subEl.textContent = card.cmd + " · " + new Date().toLocaleTimeString();
}

async function dashCycle() {
    if (ws.readyState !== WebSocket.OPEN) {
        setTimeout(dashCycle, 2000);
        return;
    }
    for (const card of DASHBOARD) {
        const r = await sendCommand(card.cmd, { regex: card.regex });
        updateCard(card, r);
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

// ---------- SMS ----------

function setSmsStatus(text) {
    smsStatus.textContent = text;
}

function parseSms(buffer) {
    const lines = buffer.split(/\r?\n/);
    const msgs = [];
    let cur = null;
    for (const line of lines) {
        const m = line.match(/^\+CMGL:\s*(\d+),"([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
        if (m) {
            if (cur) msgs.push(cur);
            cur = { index: m[1], status: m[2], sender: m[3], date: m[5], body: "" };
        } else if (cur && !/^(OK|ERROR)/.test(line.trim())) {
            cur.body += (cur.body ? " " : "") + line.trim();
        }
    }
    if (cur) msgs.push(cur);
    return msgs;
}

function renderInbox(buffer) {
    smsList.innerHTML = "";
    if (/ERROR/.test(buffer)) {
        smsList.innerHTML = '<div class="sms-item">SIM returned an error</div>';
        return;
    }
    const msgs = parseSms(buffer);
    if (!msgs.length) {
        smsList.innerHTML = '<div class="sms-item">No messages</div>';
        return;
    }
    msgs.forEach((m) => {
        const el = document.createElement("div");
        el.className = "sms-item";
        el.innerHTML =
            '<div class="sms-item-head">' +
            '<span class="sms-item-sender">' + escapeHtml(m.sender) + "</span>" +
            "<span>" + escapeHtml(m.date) + "</span></div>" +
            '<div class="sms-item-body">' + escapeHtml(m.body || "(empty)") + "</div>" +
            '<div class="sms-item-actions">' +
            '<button class="btn" data-act="read" data-idx="' + m.index + '">Read</button>' +
            '<button class="btn" data-act="del" data-idx="' + m.index + '">Delete</button>' +
            "</div>";
        smsList.appendChild(el);
    });
    smsList.querySelectorAll("button").forEach((b) => {
        b.addEventListener("click", async () => {
            if (b.dataset.act === "read") await readSms(b.dataset.idx);
            else if (b.dataset.act === "del") await deleteSms(b.dataset.idx);
        });
    });
}

async function refreshInbox() {
    smsReadPane.hidden = true;
    smsRefreshBtn.disabled = true;
    const r = await sendCommand('AT+CMGL="ALL"', { timeout: 6000 });
    renderInbox(r.buffer);
    smsRefreshBtn.disabled = false;
}

async function readSms(index) {
    const r = await sendCommand("AT+CMGR=" + index, { timeout: 5000 });
    smsReadPane.hidden = false;
    smsReadPane.textContent = r.buffer || "no response";
}

async function deleteSms(index) {
    if (!confirm("Delete message #" + index + "?")) return;
    await sendCommand("AT+CMGD=" + index, { timeout: 5000 });
    await refreshInbox();
}

smsRefreshBtn.addEventListener("click", refreshInbox);

async function sendSms() {
    const num = smsNumber.value.trim();
    const text = smsText.value;
    if (!num || !text) {
        setSmsStatus("number and message required");
        return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
        setSmsStatus("not connected");
        return;
    }

    smsSendBtn.disabled = true;
    setSmsStatus("sending...");
    try {
        await sendCommand("AT+CMGF=1", { timeout: 3000 });
        await sendCommand('AT+CMGS="' + num + '"', { timeout: 1000 });
        await sleep(1200); // wait for the "> " prompt
        const r = await sendCommand(text + "\x1a", { timeout: 8000 });
        if (/ERROR/.test(r.buffer) || r.error) {
            setSmsStatus("failed to send");
        } else {
            setSmsStatus("sent");
            smsText.value = "";
        }
    } catch (e) {
        setSmsStatus("send error");
    }
    smsSendBtn.disabled = false;
}

smsSendBtn.addEventListener("click", sendSms);

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
    { cmd: "AT+CBC", desc: "battery / voltage" },
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
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

document.addEventListener("click", (e) => {
    if (e.target.closest("input, textarea, button")) return;
    input.focus();
});

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