"""
SIM800 GSM interface.

This is the lowest-level software layer of the Gateway project.

The Pi talks to the SIM800 using UART:

    Python
      ↓
    /dev/serial0
      ↓
    HW-540
      ↓
    SIM800
      ↓
    Mobile network

Everything here ultimately becomes an AT command.
"""

import serial
import time


class SIM800:
    """
    A small interface around the SIM800 AT command interface.

    The class deliberately stays fairly thin:
    we send commands to the modem and interpret the responses.
    """

    def __init__(self, port="/dev/serial0", baudrate=9600):
        # The Raspberry Pi's serial0 is connected to the HW-540's TTL UART.
        self.serial = serial.Serial(
            port=port,
            baudrate=baudrate,
            timeout=2,
        )

        # Give the modem a moment after opening the serial connection.
        time.sleep(0.5)

    def command(self, command, wait=1):
        """
        Send an AT command and return the modem's response.

        AT commands are terminated with carriage return + newline.
        For example:

            AT
            ↓
            AT\\r\\n
            ↓
            OK
        """

        # Discard anything left over from a previous command.
        self.serial.reset_input_buffer()

        # Send the command to the SIM800.
        self.serial.write((command + "\r\n").encode())

        # Give the SIM800 time to process it.
        time.sleep(wait)

        # Read whatever the modem sent back.
        response = self.serial.read_all().decode(
            "utf-8",
            errors="replace",
        )

        return response

    def test(self):
        """Check that the SIM800 is responding."""

        return self.command("AT")

    def information(self):
        """Return SIM800 firmware/device information."""

        return self.command("ATI")

    def signal(self):
        """
        Return signal quality.

        Example:

            +CSQ: 17,0

        The first number is the received signal strength.
        """

        return self.command("AT+CSQ")

    def network(self):
        """Return the network/operator currently being used."""

        return self.command("AT+COPS?")

    def dial(self, number):
        """
        Start a phone call.

        SIM800 uses:

            ATD<number>;

        The semicolon tells it this is a voice call.
        """

        return self.command(f"ATD{number};", wait=2)

    def answer(self):
        """Answer an incoming call."""

        return self.command("ATA")

    def hangup(self):
        """Terminate the current call."""

        return self.command("ATH")

    def close(self):
        """Close the serial connection cleanly."""

        self.serial.close()


if __name__ == "__main__":
    # This section only runs when we execute:
    #
    #     python3 gsm/gsm.py
    #
    # It doesn't run when another Python program imports SIM800.

    gsm = SIM800()

    try:
        print("=== SIM800 TEST ===")

        print("\n[Connection]")
        print(gsm.test())

        print("\n[Information]")
        print(gsm.information())

        print("\n[Signal]")
        print(gsm.signal())

        print("\n[Network]")
        print(gsm.network())

    finally:
        gsm.close()