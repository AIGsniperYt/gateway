# Gateway Troubleshooting & Known Edge Cases

This document records hardware, Linux, serial, modem and development problems encountered during Gateway development.

The purpose is to preserve fixes for problems that may otherwise look mysterious when the system is rebuilt, moved to another Raspberry Pi, or modified later.

---

## Hardware Platform

Current hardware:

* Raspberry Pi 5
* LilyGO H799T-A7670G-S3-Standard
* SIMCom A7670G-LLSE
* SIM card with active cellular service
* Modem connected through the LilyGO **MODEM USB port**

The old HW-540/SIM800 setup is retired from the production architecture.

---

# 1. LilyGO USB port

## Symptom

Linux does not expose the A7670G modem correctly.

## Cause

The LilyGO board has multiple USB interfaces.

The A7670G must be connected through the **MODEM USB port**.

Do not use the ESP32 development USB port when the goal is to directly control the cellular modem from Linux.

---

# 2. Multiple `/dev/ttyUSB*` devices

The A7670G does not necessarily appear as one serial device.

A normal Linux enumeration can look like:

```text
/dev/ttyUSB0
/dev/ttyUSB1
/dev/ttyUSB2
```

After a modem reset or USB re-enumeration it may instead become:

```text
/dev/ttyUSB0
/dev/ttyUSB1
/dev/ttyUSB3
```

Therefore:

> Never assume that `ttyUSB2` remains `ttyUSB2`.

Use:

```bash
ls -l /dev/serial/by-id/
```

The persistent device identity contains the SIMCom serial number and USB interface number.

The project currently uses the interface corresponding to:

```text
...if04-port0
```

rather than relying on the volatile `ttyUSB*` number.

Example:

```text
/dev/serial/by-id/usb-SIMCom_Wireless_Solution_A76XX_Series_LTE_Module_<SERIAL>-if04-port0
```

---

# 3. Identifying the AT interface

The modem exposes several USB functions.

Do not infer the AT interface solely from the number.

Inspect:

```bash
udevadm info -q property -n /dev/ttyUSB0
udevadm info -q property -n /dev/ttyUSB1
udevadm info -q property -n /dev/ttyUSB2
```

The working AT interface was experimentally identified.

A good direct test is:

```python
import serial

s = serial.Serial("/dev/serial/by-id/...", 115200, timeout=3)
s.write(b"AT\r\n")
print(s.read_all())
s.close()
```

Expected:

```text
b'\r\nOK\r\n'
```

---

# 4. ModemManager interference

## Symptom

Basic commands such as:

```text
AT
ATI
```

worked, but cellular commands such as:

```text
AT+CPIN?
AT+CSQ
AT+CEREG?
```

sometimes produced empty responses or errors.

## Diagnosis

Check which process owns the serial device:

```bash
sudo lsof /dev/ttyUSB0 /dev/ttyUSB1 /dev/ttyUSB2
```

A previous failure showed:

```text
ModemManager ... /dev/ttyUSB1
ModemManager ... /dev/ttyUSB2
```

## Fix

This gateway controls the modem directly, so ModemManager is disabled:

```bash
sudo systemctl disable --now ModemManager
sudo systemctl mask ModemManager
```

Verify:

```bash
systemctl is-active ModemManager
systemctl is-enabled ModemManager
sudo lsof /dev/ttyUSB0 /dev/ttyUSB1 /dev/ttyUSB2
```

Expected:

```text
inactive
masked
```

and no unexpected process holding the AT interface.

---

# 5. `ttyUSB*` disappearing during modem reset

## Symptom

Python reports:

```text
termios.error: (5, 'Input/output error')
```

or:

```text
FileNotFoundError:
No such file or directory: '/dev/ttyUSB2'
```

## Diagnosis

The modem may have reset and Linux may have re-enumerated it.

A useful diagnostic is:

```bash
dmesg | tail -50
```

A previous event showed:

```text
USB disconnect
```

followed by:

```text
Arom Usb Boot Port
```

and then the normal:

```text
A76XX Series LTE Module
```

with a different `ttyUSB*` number.

This proves that a disappearing `ttyUSB2` does not necessarily mean the modem has physically failed.

Use `/dev/serial/by-id/` rather than a hard-coded `ttyUSB2`.

---

# 6. Pi 3 UART confusion — retired setup

The original HW-540/SIM800 experiments were performed on a Raspberry Pi 3B.

The Pi 3 initially exposed:

```text
/dev/serial0 -> ttyS0
```

This was the mini UART.

The correct configuration eventually became:

```text
enable_uart=1
dtoverlay=pi3-disable-bt
```

in:

```text
/boot/firmware/config.txt
```

After reboot:

```text
/dev/serial0 -> ttyAMA0
```

and:

```text
GPIO14 = TXD0
GPIO15 = RXD0
```

This setup is no longer part of the current A7670G architecture because the LilyGO modem now uses USB rather than Pi GPIO UART.

---

# 7. Physical UART orientation lesson

The old HW-540 debugging contained a major wiring mistake caused by misinterpreting the Pi header orientation.

For future GPIO work:

* Physical pin numbers are not GPIO numbers.
* Always establish board orientation first.
* Confirm pins using `pinctrl` rather than relying solely on memory.

For a conventional 40-pin Pi header:

```text
odd-numbered pins = left column
even-numbered pins = right column
```

when viewed from above in the standard orientation.

This issue cost substantial debugging time and should never be repeated.

---

# 8. Arduino Uno serial pins

When using an Arduino Uno:

```text
0 = RX
1 = TX
```

These pins are shared with the USB serial interface.

If a modem is connected directly to pins 0/1, it can interfere with sketch uploads.

Typical symptom:

```text
programmer is not responding
not in sync: resp=0x00
```

## Fix

Disconnect the modem from pins 0/1 while uploading.

Alternatively use `SoftwareSerial` on other pins.

Example:

```python
# Conceptual mapping:
# SoftwareSerial RX = Arduino pin 2
# SoftwareSerial TX = Arduino pin 3
```

This separates modem communication from the USB bootloader connection.

---

# 9. Serial echo confusion

Seeing typed characters in a terminal does not prove that the modem replied.

For example, in minicom, local echo can make:

```text
AT
```

visible even if the modem sends nothing.

Always distinguish:

```text
local echo
```

from:

```text
actual serial response
```

Programmatic tests are preferable when determining whether data was actually returned.

---

# 10. Baud-rate mismatch

A modem can return apparently random characters when the baud rate is wrong.

For the current A7670G setup:

```text
115200 baud
```

is the verified working rate.

The old HW-540/SIM800 setup used:

```text
9600 baud
```

Do not mix those configurations.

---

# 11. A7670G cellular state

The current verified healthy state is:

```text
AT
→ OK
```

```text
ATI
→ A7670G-LLSE
```

```text
AT+CPIN?
→ +CPIN: READY
```

```text
AT+CSQ
→ +CSQ: 23,99
```

```text
AT+CEREG?
→ +CEREG: 0,1
```

```text
AT+CFUN?
→ +CFUN: 1
```

These establish:

* modem responds
* SIM is available
* signal is usable
* modem is registered
* modem is in full-function mode

---

# 12. `AT+CBAND?`

On the current A7670G firmware:

```text
AT+CBAND?
```

returned:

```text
ERROR
```

This command should not automatically be interpreted as a modem failure.

Unsupported or variant-specific AT commands can return `ERROR`.

Do not change random modem settings solely because this command fails.

---

# 13. `AT+CFUN?` temporarily timing out

During early experiments:

```text
AT+CFUN?
```

sometimes produced:

```text
+CME ERROR: AT command timeout
```

while:

```text
AT
ATI
```

continued to work.

A power/USB reset restored normal operation.

When this occurs:

1. Stop sending repeated commands.
2. Check USB/kernel state.
3. Check `dmesg`.
4. Reconnect/reset the modem cleanly.
5. Retest basic commands first.

---

# 14. Python serial reader race condition

Do not have multiple parts of a Python program independently consume the same serial stream.

A previous call test contained:

* a background reader thread
* synchronous command handling
* both attempting to read from the same serial port

This can produce:

* missing responses
* empty responses
* apparently inconsistent modem behaviour
* impossible-to-reproduce call results

The serial port should have **one owner** responsible for reading from it.

Higher-level code should receive parsed events from that owner.

---

# 15. Reading too early

Some modem operations take longer than a simple `AT`.

Do not assume:

```python
time.sleep(1)
```

is universally sufficient.

For modem operations:

* allow for command-specific response time
* read asynchronously when appropriate
* distinguish final responses from unsolicited events
* do not use arbitrary sleeps as the primary state-management mechanism

---

# 16. Call command syntax

For a voice call:

```text
ATD<number>;
```

The terminating semicolon is significant.

Example:

```text
ATD+447XXXXXXXXXX;
```

Without the semicolon, the modem interprets the operation differently.

The project has successfully placed an actual cellular voice call from the Raspberry Pi through the A7670G.

This proves:

```text
Pi
→ A7670G
→ cellular network
→ destination phone
```

is functioning.

---

# 17. `NO CARRIER`

`NO CARRIER` does not inherently mean the modem is broken.

It means the call attempt ended without a maintained connected call.

Possible causes include:

* destination did not answer
* network rejected the call
* carrier voice restrictions
* call setup failure
* transient radio conditions

Diagnose the call state and network state rather than interpreting `NO CARRIER` as hardware failure.

---

# 18. Modem USB reset during voice call testing

A previous experimental call script caused the modem USB interface to disappear and reappear.

Kernel output showed:

```text
USB disconnect
```

followed by:

```text
Arom Usb Boot Port
```

then the modem returning as an A76XX LTE device.

When reproducing such a fault:

1. Check `dmesg`.
2. Determine whether the modem rebooted.
3. Wait for USB re-enumeration.
4. Use `/dev/serial/by-id/`.
5. Do not continue calling the old `ttyUSB*` path.

A reproduced USB reset during voice setup should be treated as a modem/voice-path issue, not a Python file-path issue.

---

# 19. Public repository hygiene

This repository is public.

Never commit:

* real phone numbers
* SIM PINs
* SIM identifiers
* IMEI values
* API keys
* passwords
* session secrets
* private IP addresses
* Wi-Fi credentials
* VPN credentials
* production tokens

Use:

```text
.env
```

for private local configuration and exclude it through `.gitignore`.

Commit:

```text
.env.example
```

with placeholder values instead.

---

# 20. Development principle

The Gateway should be developed bottom-up.

Correct dependency order:

```text
Cellular hardware
        ↓
Modem control
        ↓
Call state
        ↓
Audio transport
        ↓
Asterisk
        ↓
SIP/WebRTC
        ↓
Gateway API
        ↓
Authentication
        ↓
Remote access
        ↓
Public portal
```

Do not build a higher layer while a lower layer is unverified.

---

# 21. Current known-good modem stack

```text
Raspberry Pi 5
      │
      │ USB
      ▼
LilyGO H799T-A7670G-S3-Standard
      │
      ▼
SIMCom A7670G-LLSE
      │
      ▼
Mobile network
```

Current serial interface:

```text
stable `/dev/serial/by-id/` interface
```

Current baud:

```text
115200
```

Current verified capabilities:

```text
AT communication       ✓
SIM detection          ✓
Signal reading         ✓
LTE registration       ✓
Voice dialling         ✓
```

---

# 22. The biggest debugging lesson

When a system contains many layers, isolate them.

For this project:

```text
USB
 ↓
serial
 ↓
AT command
 ↓
SIM
 ↓
network
 ↓
voice call
 ↓
audio
 ↓
Asterisk
 ↓
SIP/WebRTC
 ↓
Internet authentication
```

A failure should be diagnosed at the lowest unverified layer rather than changing several layers simultaneously.
