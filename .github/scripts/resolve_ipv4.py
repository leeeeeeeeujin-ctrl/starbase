#!/usr/bin/env python3
"""
Resolve the first IPv4 address for a host and print it.
Usage: python3 resolve_ipv4.py <host>
"""
import sys
import socket

def main():
    if len(sys.argv) < 2:
        return
    host = sys.argv[1]
    if not host:
        return
    try:
        addrs = socket.getaddrinfo(host, None, family=socket.AF_INET)
        if addrs:
            print(addrs[0][4][0])
    except Exception:
        # suppress errors; caller will handle empty output
        return

if __name__ == '__main__':
    main()
