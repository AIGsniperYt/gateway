import serial
import time


class SIM800:
    def __init__(self, port="/dev/serial0", baudrate=9600):
        self.serial = serial.Serial(
            port=port,
            baudrate=baudrate,
            timeout=2,
        )

    def command(self, command, wait=1):
        """Send an AT command and return the modem's response."""
        self.serial.reset_input_buffer()

        self.serial.write((command + "\r\n").encode())

        time.sleep(wait)

        response = self.serial.read_all().decode(
            "utf-8",
            errors="replace",
        )

        return response

    def close(self):
        self.serial.close()


if __name__ == "__main__":
    gsm = SIM800()

    try:
        print("Testing SIM800...")

        print("\n--- AT ---")
        print(gsm.command("AT"))

        print("\n--- IDENTIFICATION ---")
        print(gsm.command("ATI"))

        print("\n--- SIGNAL ---")
        print(gsm.command("AT+CSQ"))

        print("\n--- NETWORK ---")
        print(gsm.command("AT+COPS?"))

    finally:
        gsm.close()