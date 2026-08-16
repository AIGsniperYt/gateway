#include <SoftwareSerial.h> // this lets us use non UART pins via software
// to leave the hardware default ones open for serial monitor 
// basically enable fake serial ports so we can talk to sim800 on other pins

#include <ESP8266WiFi.h>  // apparently the compiler errored because WIFI needs this header to work

#include <ESP8266WebServer.h>
// this lets us utilise the sep's wifi capabilities and host a web server

// create a softwareserial object called sim800, this tells the esp8266:
// listen for incoming sim800 data on gpio4, and send outgoing to gpio5
SoftwareSerial sim800(4, 5); // RX=D2, TX=D1

// create a web server object called 'server'
// this will listen on port 80 (default http port)
// we can later attach endpoints to it like /run
// and then call server.begin() to actually start it
ESP8266WebServer server(80);

// im not about to leak my wifi credentials onto github bro, almost did lol
const char* SSID = "ssid";
const char* PASSW = "passw";

void sync_with_sim() {
    // is there data available from the serial monitor on your computer?
    // (basically, did you type and submit a command?)
    while (Serial.available()) {
        // send available data to the sim after reading it
        sim800.write(Serial.read());
    }

    // did sim send any data back?
    while (sim800.available()) {
        // write incoming data to serial monitor
        Serial.write(sim800.read());
    }

    // if statements were replaced by while 
    // this is because read only reads ONE byte
    // problem: >1 byte responses could be missed
    // solution: while is an infinite if statement anyways,
    // replace if with while: if there is data, read until there is none left to read
}

// this is a backend function meant to be hit as an api
// it will return a response as a string as you can see
String send_cmd(String cmd, uint16_t timeout = 2000) {
    String response = ""; // build the response string byte by byte
    // cus remember, .read() only does one byte at a time
    // so we need somewhere to store this data while its being build

    Serial.println(cmd); // i want to see both the command and output in serial monitor
    sim800.println(cmd);   // run the command
    unsigned long start = millis(); // basically in short, store current time

    // wait for response boilerplate logic
    while (millis() - start < timeout) { // ensure ALL data is read, not one byte with a naive if statement
        while (sim800.available()) {
            response += (char)sim800.read();
        }
        yield(); // keep ESP8266 alive, or watchdog timer resets chip apparently
    }

    Serial.println(response); // i want to see both the command and output in serial monitor
    return response;
}

// i cba to explain this, the func name is self explanatory
void connect_to_wifi() {
    WiFi.begin(SSID, PASSW); // seriously!? the compiler errored because i said "WIFI" instead of "WiFi" sigh
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nConnected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
}


// to avoid compile error, we gotta wrap this in a func and run it apparently - so we can just use the setup()
void init_run_api() {
    // now we define our first api! :D this is the fun bit
    // register a new HTTP route, with path "/run"
    server.on("/run", []() {
        // syntax explaineD: [] means this is a nameless inline func
        // () means it takes no parameters obviously, and yeah, basic ik, but whatever

        // check if a "cmd" param given, if not, error early and stop
        if (!server.hasArg("cmd")) {
            // error 400 - bad request
            // syntax: (status code, content type, content)
            server.send(400, "text/plain", "Missing cmd parameter");
            return;
        }

        // there is a cmd, great! - lets extract and run
        String cmd = server.arg("cmd"); // take the value of the "cmd" arg

        // this is so i can have clean readable urls like "AT+CSQ" without errors 
        // because the browser converts the + into a space, and sim errors at "AT CSQ"
        cmd.replace("\"", ""); // strip double quotes
        cmd.replace(" ", "+"); // unconvert browser + -> space
        cmd.replace("'", ""); // strip single quotes

        String res = send_cmd(cmd); // send it using our earlier helper function
        // and remember, we receive a response from the sim, store that in "res"
        
        // return ok, txt, the response
        server.send(200, "text/plain", res);
    });
}


// this function sets up once when the esp boots
void setup() {
    // set baud rates here
    Serial.begin(115200); // nice and obvious, set baud rate to this for serial monitor from esp
    sim800.begin(9600); // use this baud rate to talk to the sim800
    
    connect_to_wifi(); // start wifi
    init_run_api(); // we should declare the endpoint beforehand i think
    server.begin(); // crap i forgot to actually start the server
}


// this is the function that runs continously
void loop() {
    // abstract the bare bones translation syncer to keep loop clean
    sync_with_sim();
    server.handleClient(); // apparently, pretty obviously - we need to explicitly declare this loop
    // so it constantly actually checks and responds to requests, i forgot to add this too
}
