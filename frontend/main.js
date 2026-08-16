const input = document.getElementById("cmdInput");
const button = document.getElementById("sendBtn");
const log = document.getElementById("log");

function appendLog(line) {
    log.textContent += line + "\n";
    log.scrollTop = log.scrollHeight;
}

async function sendCmd() {
    const cmd = input.value.trim();
    if (!cmd) return;

    appendLog("> " + cmd);

    try {
        const res = await fetch(`/run?cmd=${encodeURIComponent(cmd)}`);
        const data = await res.json();
        appendLog(data.res || "[no response]");
    } catch (e) {
        appendLog("[error] " + e.message);
    }

    input.value = "";
}

button.addEventListener("click", sendCmd);

input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendCmd();
});
