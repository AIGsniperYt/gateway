import serial
import time
import threading


PORT = "/dev/ttyUSB2"
BAUD = 115200


def reader(modem):
    """Continuously print anything the modem sends asynchronously."""
    while modem.is_open:
        data = modem.read(modem.in_waiting or 1)

        if data:
            print("\nMODEM:", repr(data.decode(errors="replace")))


modem = serial.Serial(PORT, BAUD, timeout=0.2)

thread = threading.Thread(target=reader, args=(modem,), daemon=True)
thread.start()

print("Checking modem...")
modem.write(b"AT\r\n")
time.sleep(1)

print("Checking registration...")
modem.write(b"AT+CEREG?\r\n")
time.sleep(1)

print("Checking signal...")
modem.write(b"AT+CSQ\r\n")
time.sleep(1)

number = input("\nNumber to call: ").strip()

print(f"\nDialling {number}...")
modem.write(f"ATD{number};\r\n".encode())

print("\nListening for modem responses.")
print("Press ENTER to hang up.")

input()

print("\nHanging up...")
modem.write(b"ATH\r\n")

time.sleep(2)
modem.close()