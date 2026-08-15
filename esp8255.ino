#include <SoftwareSerial.h> // this lets us use non UART pins via software
// to leave the hardware default ones open for serial monitor 
// basically enable fake serial ports so we can talk to sim800 on other pins

// create a softwareserial object called sim800, this tells the esp8266:
// listen for incoming sim800 data on gpio4, and send outgoing to gpio5
SoftwareSerial sim800(4, 5); // RX=D2, TX=D1


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

    sim800.println(cmd);   // send the command
    unsigned long start = millis(); // basically in short, store current time

    // wait for response boilerplate logic
    while (millis() - start < timeout) { // ensure ALL data is read, not one byte with a naive if statement
        while (sim800.available()) {
            response += (char)sim800.read();
        }
        yield(); // keep ESP8266 alive, or watchdog timer resets chip apparently
    }

    return response;
}


// this function sets up once when the esp boots
void setup() {
    // set baud rates here
    Serial.begin(115200); // nice and obvious, set baud rate to this for serial monitor from esp
    sim800.begin(9600); // use this baud rate to talk to the sim800
    send_cmd("AT");
}


// this is the function that runs continously
void loop() {
    // abstract the bare bones translation syncer to keep loop clean
    sync_with_sim();
}
