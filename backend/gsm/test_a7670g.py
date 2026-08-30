from a7670g import A7670G


modem = A7670G()

print("=== MODEM ===")
print(modem.information())

print("=== SIM ===")
print(modem.sim_status())

print("=== SIGNAL ===")
print(modem.signal())

print("=== NETWORK ===")
print(modem.registration())

modem.close()