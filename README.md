# RESEARCH

below is a list of commands that can be used on serial monitor to send to the sim800

## basic everyday commands

```txt
AT          → test connection (should return OK)
ATE0        → turn echo OFF 
ATE1        → turn echo ON
ATI         → device info
AT+GMR      → firmware version
AT+CSCS?    → check character set
AT+CSCS="GSM" → set character set
```

## network and status

```txt
AT+CPIN?        → SIM status (READY / SIM PIN / SIM PUK)
AT+CSQ          → signal quality (0–31)
AT+CREG?        → network registration status
AT+COPS?        → current operator
AT+COPS=?       → list available operators
AT+CNUM         → show your phone number (if SIM supports it)
AT+CLIP=1       → enable caller ID
```

## calling

```txt
ATD<number>;    → dial voice call (semicolon required)
ATH             → hang up
ATA             → answer incoming call
AT+CLCC         → list current calls

example of calling:
ATD07700900000;
```

## misc

```txt
AT+CSQ            → live signal strength
AT+CENG?          → engineering mode (cell tower info)
AT+CBAND?         → check GSM band
AT+CBAND="EGSM"   → set band
AT+CMTE?          → temperature
AT+CGSN           → IMEI
AT+CPAS           → phone activity status
```

## sms

```txt
AT+CMGF=1  // enable text mode

// send sms
AT+CMGS="07700900000"
> your message here
<Ctrl+Z>

// read sms
AT+CMGL="ALL"     → list all messages
AT+CMGR=1         → read message #1

// delete sms
AT+CMGD=1         → delete message #1
AT+CMGD=1,4       → delete all messages
```

todo: 
add wifi variabling so any network works, via a login page of sorts