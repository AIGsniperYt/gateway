from a7670g import A7670G

NUMBER = input("Phone number to call: ").strip()

modem = A7670G()

print("\n--- Dialling ---")
print(modem.dial(NUMBER))

try:
    input("\nPress ENTER when you want to hang up...")
finally:
    print("\n--- Hanging up ---")
    print(modem.hangup())
    modem.close()