const log = document.getElementById("log");
const input = document.getElementById("cmdInput");
const dropdown = document.getElementById("dropdown");
const hint = document.getElementById("hint");

input.value = "AT"; // most commands start with AT

// CHANGE THIS TO YOUR ESP IP
const ws = new WebSocket("ws://192.168.1.165/ws");

ws.onopen = () => append("Connected to ESP WebSocket");
ws.onmessage = (msg) => append(msg.data);
ws.onerror = (err) => append("WebSocket error: " + err);
ws.onclose = () => append("WebSocket closed");

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