"""Send one checksum-valid UDP probe on loopback only; never use a real application endpoint."""
import socket
import struct
import sys
import secrets

port = int(sys.argv[1]) if len(sys.argv) > 1 else 28446
if not 1024 <= port <= 65535:
    raise ValueError('Invalid local probe port')


def checksum(data):
    if len(data) % 2:
        data += b'\x00'
    total = sum(struct.unpack('!%dH' % (len(data) // 2), data))
    while total >> 16:
        total = (total & 0xffff) + (total >> 16)
    return (~total) & 0xffff


# Fixed loopback endpoints prevent this probe from being routed to another machine.
address = socket.inet_aton('127.0.0.1')
payload = b'PANEL_IDS_PROBE:' + secrets.token_hex(12).encode('ascii')
source_port = 40000 + secrets.randbelow(20000)
udp = struct.pack('!HHHH', source_port, port, 8 + len(payload), 0)
pseudo = address + address + struct.pack('!BBH', 0, 17, len(udp) + len(payload))
value = checksum(pseudo + udp + payload) or 0xffff
udp = udp[:6] + struct.pack('!H', value)
ip = struct.pack('!BBHHHBBH4s4s', 0x45, 0, 20 + len(udp) + len(payload), 1, 0, 64, 17, 0, address, address)
ip = ip[:10] + struct.pack('!H', checksum(ip)) + ip[12:]
frame = b'\x00' * 12 + b'\x08\x00' + ip + udp + payload
with socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.htons(0x0800)) as sender:
    sender.bind(('lo', 0))
    sender.send(frame)
