#include <SoftwareSerial.h> // this lets us use non UART pins via software
// to leave the hardware default ones open for serial monitor 
// basically enable fake serial ports so we can talk to sim800 on other pins


// create a softwareserial object called sim800, this tells the esp8266:
// listen for incoming sim800 data on gpio4, and send outgoing to gpio5
SoftwareSerial sim800(4, 5); // RX=D2, TX=D1

// this function sets up once when the esp boots
void setup() {
  Serial.begin(115200); // nice and obvious, set baud rate to this for serial monitor from esp
  sim800.begin(9600); // use this baud rate to talk to the sim800
}

// this is the function that runs continously
void loop() {
    // is there data available from the serial monitor on your computer?
    // (basically, did you type and submit a command?)
    if (Serial.available()) {
        // send available data to the sim after reading it
        sim800.write(Serial.read());
    }

    // did sim send any data back?
    if (sim800.available()) {
        // write incoming data to serial monitor
        Serial.write(sim800.read());
    }
}
