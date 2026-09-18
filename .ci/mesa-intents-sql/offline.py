"""Run Linux application tests without IPv4/IPv6 sockets, including children.

Only local Unix sockets are allowed (PostgreSQL/docker and esbuild). Requires
libseccomp; fails closed. Does not configure or access a production connection.
"""
import ctypes
import ctypes.util
import errno
import os
import sys

if len(sys.argv) < 2:
    raise SystemExit('Usage: python3 offline.py <executable> [args...]')
lib = ctypes.CDLL(ctypes.util.find_library('seccomp') or 'libseccomp.so.2', use_errno=True)
class Comparison(ctypes.Structure):
    _fields_ = [('arg', ctypes.c_uint), ('op', ctypes.c_int), ('datum_a', ctypes.c_uint64), ('datum_b', ctypes.c_uint64)]
lib.seccomp_init.argtypes = [ctypes.c_uint32]
lib.seccomp_init.restype = ctypes.c_void_p
lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
lib.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint, ctypes.POINTER(Comparison)]
lib.seccomp_load.argtypes = [ctypes.c_void_p]
lib.seccomp_release.argtypes = [ctypes.c_void_p]
ctx = lib.seccomp_init(0x7fff0000)  # SCMP_ACT_ALLOW
if not ctx:
    raise SystemExit('Cannot allocate network isolation filter')
try:
    syscall = lib.seccomp_syscall_resolve_name(b'socket')
    if syscall < 0:
        raise SystemExit('Cannot resolve socket syscall')
    for family in (2, 10):  # AF_INET, AF_INET6
        comparison = Comparison(0, 4, family, 0)  # SCMP_CMP_EQ
        if lib.seccomp_rule_add_array(ctx, 0x00050000 | errno.EPERM, syscall, 1, ctypes.byref(comparison)) != 0:
            raise SystemExit('Cannot configure network isolation')
    if lib.seccomp_load(ctx) != 0:
        raise SystemExit('Cannot activate network isolation')
finally:
    lib.seccomp_release(ctx)
os.execvp(sys.argv[1], sys.argv[1:])
