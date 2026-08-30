// im not about to leak my wifi credentials onto github bro, almost did lol
const char* SSID = "ssid";
const char* PASSW = "passw";

#include <SoftwareSerial.h> // this lets us use non UART pins via software
// to leave the hardware default ones open for serial monitor 
// basically enable fake serial ports so we can talk to sim800 on other pins

#include <ESP8266WiFi.h>  // apparently the compiler errored because WIFI needs this header to work

#include <ESPAsyncWebServer.h> // async server lib, supports websockets
#include <ESPAsyncTCP.h>       // required dependency for async server


// create a softwareserial object called sim800, this tells the esp8266:
// listen for incoming sim800 data on gpio4, and send outgoing to gpio5
SoftwareSerial sim800(4, 5); // RX=D2, TX=D1

// create a web server object called 'server'
// this will listen on port 80 (default http port)
// we can later attach endpoints to it like /run and /ws
AsyncWebServer server(80);
AsyncWebSocket ws("/ws"); // websocket endpoint at /ws

String wsBuffer = ""; // accumulates sim800 chars until a full line is received

// send_cmd: helper to send AT command and collect response
// returns the full response string
String send_cmd(String cmd, uint16_t timeout = 2000) {
    String response = "";
    sim800.println(cmd);       // send command to sim800
    unsigned long start = millis();

    while (millis() - start < timeout) {
        while (sim800.available()) {
            char c = sim800.read();
            Serial.write(c);   // raw echo to serial monitor
            response += c;     // also build response string
        }
        yield(); // keep ESP8266 alive, avoid watchdog reset
    }

    return response;
}


// onWsEvent: websocket event handler
// handles connect and incoming messages
void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client,
               AwsEventType type, void *arg, uint8_t *data, size_t len) {
    if (type == WS_EVT_CONNECT) {
        client->text("{\"type\":\"system\",\"data\":\"connected\"}");
    } else if (type == WS_EVT_DATA) {
        // incoming message from frontend
        String msg = String((char*)data).substring(0, len);
        sim800.println(msg); // forward AT command to sim800
    }
}


// connect_to_wifi: obvious, connects to WiFi and prints IP
void connect_to_wifi() {
    WiFi.begin(SSID, PASSW);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nConnected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
}


// init_run_api: defines /run endpoint for HTTP GET
// lets you hit /run?cmd=AT+CSQ and get JSON back
void init_run_api() {
    server.on("/run", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (!request->hasParam("cmd")) {
            request->send(400, "application/json", "{\"error\":\"Missing cmd parameter\"}");
            return;
        }

        String cmd = request->getParam("cmd")->value();
        cmd.replace("\"", "");
        cmd.replace(" ", "+");
        cmd.replace("'", "");

        String res = send_cmd(cmd);
        String json = "{\"cmd\":\"" + cmd + "\",\"res\":\"" + res + "\"}";

        request->send(200, "application/json", json);

        // also broadcast to websocket clients for live terminal
        ws.textAll(json);
    });
}


// setup: runs once at boot
void setup() {
    Serial.begin(115200); // serial monitor baud
    sim800.begin(9600);   // sim800 baud

    connect_to_wifi();    // connect WiFi
    init_run_api();       // register /run endpoint

    ws.onEvent(onWsEvent); // attach websocket handler
    server.addHandler(&ws);
    server.begin();       // start server
}


// loop: runs continuously
void loop() {
    // broadcast any sim800 output to websocket clients in real time
    while (sim800.available()) {
        char c = sim800.read();
        Serial.write(c);          // show raw output in Serial Monitor
        wsBuffer += c;            // buffer until full line
        if (c == '\n') {          // then send the whole line as one message
            ws.textAll(wsBuffer);
            wsBuffer = "";
        }
    }
}
