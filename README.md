# Gateway

A self-hosted cellular telephone gateway built around a Raspberry Pi, Asterisk, and a SIMCom A7670G LTE modem.

The long-term goal is to provide an authenticated web interface through which authorised users can access a telephone system located at home, regardless of the network they are currently using.

## Architecture

```text
                         Internet
                            │
                            ▼
                    Authenticated Portal
                            │
                            ▼
                       Gateway API
                            │
                    Secure connection
                            │
                            ▼
                     Raspberry Pi 5
                       │         │
                       │         └── Asterisk
                       │
                       ▼
                  A7670G service
                       │
                       ▼
                 SIMCom A7670G
                       │
                       ▼
                  Cellular network
                       │
                       ▼
                     Telephone
```

The project is deliberately being built from the bottom up:

1. Establish reliable communication with the modem.
2. Build a Python modem abstraction.
3. Make and receive calls directly through the modem.
4. Integrate the modem with Asterisk.
5. Build the gateway service around Asterisk.
6. Add authentication and authorisation.
7. Expose the system securely over the Internet.
8. Add rate limiting, logging, monitoring and other production safeguards.

## Hardware

### Raspberry Pi

The current gateway runs on a Raspberry Pi 5 using Raspberry Pi OS / Raspbian Bookworm.

The Raspberry Pi acts as the main gateway computer.

### Cellular modem

The current modem is:

**LilyGO H799T-A7670G-S3-Standard**

with:

**SIMCom A7670G-LLSE**

The A7670G-LLSE supports LTE connectivity, voice calls and SMS.

See the manufacturer's documentation for hardware-specific information:

* [LilyGO A7670X documentation](https://github.com/Xinyuan-LilyGO/LilyGo-Modem-Series/tree/main/docs/en/esp32/a7670-esp32)

## Physical setup

The modem is connected to the Raspberry Pi using USB.

```text
LilyGO MODEM USB port
        │
        │ USB-A → USB-C
        ▼
Raspberry Pi
```

**Use the MODEM USB port on the LilyGO board, not the ESP32 USB port.**

No Raspberry Pi GPIO UART wiring is required for the current setup.

The modem exposes several USB serial interfaces to Linux. The AT command interface is currently `/dev/ttyUSB2`, although production configuration should use a stable device path rather than relying on the enumeration order.

## Linux setup

Check that the modem is detected:

```bash
ls -l /dev/ttyUSB*
```

The A7670G should appear as several serial interfaces.

Check the USB device:

```bash
lsusb
```

The Linux `option` driver should create the modem serial interfaces.

## ModemManager

This project communicates directly with the modem through its serial interface.

ModemManager can probe and control the same serial ports, which interferes with direct AT command communication.

For the dedicated gateway installation, ModemManager is disabled:

```bash
sudo systemctl disable --now ModemManager
sudo systemctl mask ModemManager
```

Verify:

```bash
systemctl is-active ModemManager
sudo lsof /dev/ttyUSB0 /dev/ttyUSB1 /dev/ttyUSB2
```

No other process should be using the AT command interface while the Gateway modem service is running.

## Python

The modem interface uses Python and PySerial.

Install the dependency:

```bash
python3 -m pip install pyserial
```

The modem is currently accessed at:

```text
/dev/ttyUSB2
```

with:

```text
115200 baud
```

The modem interface is implemented separately from the web application so that the rest of the system does not need to know about raw AT commands.

Conceptually:

```text
Web/API
   │
   ▼
Gateway service
   │
   ▼
A7670G Python driver
   │
   ▼
Serial / AT commands
   │
   ▼
A7670G
```

## Basic modem test

A minimal test can be performed with Python:

```python
import serial

modem = serial.Serial(
    "/dev/ttyUSB2",
    115200,
    timeout=3,
)

modem.write(b"AT\r\n")

print(modem.read_all().decode(errors="replace"))

modem.close()
```

A healthy modem should respond:

```text
OK
```

## Useful diagnostic commands

### Modem information

```text
ATI
```

### SIM status

```text
AT+CPIN?
```

Expected when the SIM is ready:

```text
+CPIN: READY
```

### Signal strength

```text
AT+CSQ
```

### LTE registration

```text
AT+CEREG?
```

A registration result containing `1` indicates the modem is registered on the network.

### Operator

```text
AT+COPS?
```

## Voice calls

The A7670G can place voice calls using the modem's AT interface.

Dial:

```text
ATD<number>;
```

The semicolon is important for a voice call.

Hang up:

```text
ATH
```

Answer:

```text
ATA
```

Inspect active calls:

```text
AT+CLCC
```

Incoming calls can be detected from unsolicited modem messages such as:

```text
RING
```

The Python service will eventually convert these low-level modem events into application-level call events.

## Asterisk

Asterisk is the planned telephony layer.

The intended relationship is:

```text
                    Asterisk
                       │
                 call control
                       │
                       ▼
                 GSM service
                       │
                       ▼
                   A7670G
```

Asterisk is installed separately from the modem driver.

FreePBX is not currently required. The project is intentionally using Asterisk directly while the underlying system is being developed and understood.

## Configuration

Private configuration should **never be committed to this repository**.

Examples of information that should remain private:

* SIM credentials
* Phone numbers
* API keys
* Passwords
* Session secrets
* Wi-Fi credentials
* Private IP addresses
* VPN credentials
* Modem identifiers such as IMEI
* Production authentication secrets

Use environment variables or a local configuration file excluded by `.gitignore`.

Example:

```text
.env
```

Example structure:

```text
MODEM_DEVICE=/dev/ttyUSB2
MODEM_BAUD=115200
```

Do not commit the actual `.env` file.

A safe example configuration can instead be committed as:

```text
.env.example
```

## Development

The project is developed on a Linux desktop and deployed to the Raspberry Pi.

Typical workflow:

```text
Kubuntu
   │
   ▼
Edit code
   │
   ▼
Git commit
   │
   ▼
GitHub
   │
   ▼
git pull on Raspberry Pi
```

Run tests locally where possible before deploying to the gateway.

## Project structure

The project is currently divided into frontend and backend components.

The modem integration belongs in the backend rather than in the frontend.

A planned structure is:

```text
gateway/
├── backend/
│   └── gsm/
│       ├── a7670g.py
│       └── test_a7670g.py
│
├── frontend/
│
├── .gitignore
└── README.md
```

The exact structure may evolve as the gateway develops.

## Security model

The eventual public-facing service must not expose the modem or Asterisk directly to the Internet.

The intended architecture is:

```text
Untrusted Internet
        │
        ▼
Public gateway
        │
        ├── Authentication
        ├── Authorisation
        ├── Rate limiting
        ├── Request validation
        └── Logging
        │
        ▼
Private gateway connection
        │
        ▼
Home Raspberry Pi
        │
        ▼
Asterisk / A7670G
```

The cellular modem should therefore never be directly reachable from an arbitrary Internet client.

## Project status

### Complete

* Raspberry Pi 5 gateway environment
* Asterisk installation
* LilyGO A7670G hardware
* USB modem communication
* A7670G AT interface
* SIM detection
* Signal detection
* LTE network registration
* Python serial communication
* ModemManager conflict identified and resolved

### In progress

* A7670G Python driver
* Outgoing voice calls
* Incoming call handling
* Asterisk integration

### Planned

* Call state management
* Web/API integration
* Authentication
* Authorisation
* Secure remote connectivity
* Rate limiting and abuse prevention
* Logging and monitoring
* Reliable deployment
* Remote access from arbitrary Internet connections

## Status

This is an active personal project and its architecture is expected to evolve as the individual components are implemented and tested.
