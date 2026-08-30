"""
SIM800 GSM interface.

Architecture:

    Python
      ↓
    /dev/serial0
      ↓
    HW-540
      ↓
    SIM800
      ↓
    Mobile network

The SIM800 can both:
    1. Respond to commands we send.
    2. Spontaneously send events such as RING or NO CARRIER.

This module handles both.
"""

import serial
import threading
import time


class SIM800:

    def __init__(self, port="/dev/serial0", baudrate=9600):

        self.serial = serial.Serial(
            port=port,
            baudrate=baudrate,
            timeout=0.2,
        )

        self.running = True

        # A separate thread continuously watches the modem.
        self.listener = threading.Thread(
            target=self._listen,
            daemon=True,
        )

        self.listener.start()

        time.sleep(0.5)

    # ---------------------------------------------------------
    # MODEM COMMUNICATION
    # ---------------------------------------------------------

    def command(self, command, wait=1):

        self.serial.reset_input_buffer()

        self.serial.write(
            (command + "\r\n").encode()
        )

        time.sleep(wait)

        response = self.serial.read_all().decode(
            "utf-8",
            errors="replace",
        )

        return response

    # ---------------------------------------------------------
    # BACKGROUND EVENT LISTENER
    # ---------------------------------------------------------

    def _listen(self):

        """
        Continuously listen for unsolicited messages.

        These are messages the SIM800 sends without us
        asking for them.

        For example:

            RING

        means an incoming call is happening.

            NO CARRIER

        means the call has ended.
        """

        while self.running:

            try:

                if self.serial.in_waiting:

                    line = self.serial.readline().decode(
                        "utf-8",
                        errors="replace",
                    ).strip()

                    if line:
                        self.handle_event(line)

            except serial.SerialException:
                break

    def handle_event(self, event):

        """
        Handle an unsolicited SIM800 event.

        This is deliberately simple for now.

        Later this becomes the bridge between the GSM
        hardware and the rest of the Gateway system.
        """

        if event == "RING":

            print("[GSM] Incoming call!")

        elif event == "NO CARRIER":

            print("[GSM] Call ended.")

        else:

            print(f"[GSM EVENT] {event}")

    # ---------------------------------------------------------
    # PHONE OPERATIONS
    # ---------------------------------------------------------

    def test(self):
        return self.command("AT")

    def information(self):
        return self.command("ATI")

    def signal(self):
        return self.command("AT+CSQ")

    def network(self):
        return self.command("AT+COPS?")

    def dial(self, number):

        return self.command(
            f"ATD{number};",
            wait=2,
        )

    def answer(self):

        return self.command("ATA")

    def hangup(self):

        return self.command("ATH")

    # ---------------------------------------------------------
    # CLEAN SHUTDOWN
    # ---------------------------------------------------------

    def close(self):

        self.running = False

        if self.listener.is_alive():
            self.listener.join(timeout=1)

        self.serial.close()


# -------------------------------------------------------------
# TEST PROGRAM
# -------------------------------------------------------------

if __name__ == "__main__":

    gsm = SIM800()

    try:

        print("=== SIM800 EVENT TEST ===")
        print(gsm.test())

        print("\nWaiting for GSM events...")
        print("Call this SIM from another phone.")

        # Keep the program alive so the listener can receive
        # unsolicited SIM800 messages.
        while True:
            time.sleep(1)

    except KeyboardInterrupt:

        print("\nStopping...")

    finally:

        gsm.close()