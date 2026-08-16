const log = document.getElementById("log");
const input = document.getElementById("cmdInput");

// CHANGE THIS TO YOUR ESP IP
const ws = new WebSocket("ws://192.168.1.165/ws");

ws.onopen = () => append("Connected to ESP WebSocket");
ws.onmessage = (msg) => append(msg.data);
ws.onerror = (err) => append("WebSocket error: " + err);
ws.onclose = () => append("WebSocket closed");

function append(line) {
    log.textContent += line + "\n";
    log.scrollTop = log.scrollHeight;
}

function sendCmd() {
    const cmd = input.value.trim();
    if (!cmd) return;

    append("> " + cmd);
    ws.send(cmd);   // send raw AT command to ESP
    input.value = "";
}
