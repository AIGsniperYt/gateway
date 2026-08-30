"""
A7670G cellular modem interface.

This module deliberately keeps modem communication separate from
the web/API layer. The rest of Gateway should ask for actions such
as dial(), answer(), and hangup() rather than constructing AT
commands itself.
"""

import re
import time
import serial


class A7670G:
    """Small synchronous interface to the SIMCom A7670G modem."""

    def __init__(self, port="/dev/ttyUSB2", baudrate=115200):
        self.port = port
        self.baudrate = baudrate

        self.serial = serial.Serial(
            port=self.port,
            baudrate=self.baudrate,
            timeout=3,
        )

    def command(self, command, wait=1):
        """
        Send one AT command and return the modem's response.

        AT commands are terminated with CRLF.
        """
        self.serial.reset_input_buffer()

        self.serial.write((command + "\r\n").encode())

        time.sleep(wait)

        return self.serial.read_all().decode(
            errors="replace"
        )

    def test(self):
        """Check whether the modem is responding."""
        return self.command("AT")

    def information(self):
        """Return modem identification information."""
        return self.command("ATI")

    def sim_status(self):
        """Return SIM readiness."""
        return self.command("AT+CPIN?")

    def signal(self):
        """Return cellular signal strength."""
        return self.command("AT+CSQ")

    def registration(self):
        """Return LTE network registration state."""
        return self.command("AT+CEREG?")

    def operator(self):
        """Return the currently selected network operator."""
        return self.command("AT+COPS?")

    def dial(self, number):
        """
        Start a voice call.

        The semicolon tells the modem this is a voice call rather
        than a data call.
        """
        return self.command(f"ATD{number};")

    def answer(self):
        """Answer the current incoming call."""
        return self.command("ATA")

    def hangup(self):
        """Terminate the current call."""
        return self.command("ATH")

    def calls(self):
        """Return the modem's current call list."""
        return self.command("AT+CLCC")

    def enable_caller_id(self):
        """Enable incoming caller ID reporting."""
        return self.command("AT+CLIP=1")

    def close(self):
        """Close the serial connection."""
        if self.serial.is_open:
            self.serial.close()