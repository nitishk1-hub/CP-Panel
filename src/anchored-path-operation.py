"""Atomic no-overwrite operations using descriptors retained by the Node caller."""
import ctypes
import errno
import os
import re
import sys

def descriptor_path(value):
    if not re.fullmatch(r'/proc/[0-9]+/fd/[0-9]+', value):
        raise ValueError('Expected a retained descriptor')
    return value

def entry_name(value):
    if not value or value in ('.', '..') or '/' in value or '\\' in value or '\0' in value:
        raise ValueError('Expected a single entry name')
    return os.fsencode(value)

opened = []
try:
    if len(sys.argv) == 6 and sys.argv[1] in ('rename', 'exchange'):
        source = os.open(descriptor_path(sys.argv[2]), os.O_RDONLY | os.O_DIRECTORY)
        opened.append(source)
        destination = os.open(descriptor_path(sys.argv[4]), os.O_RDONLY | os.O_DIRECTORY)
        opened.append(destination)
        libc = ctypes.CDLL(None, use_errno=True)
        rename = getattr(libc, 'renameat2', None)
        if rename is None:
            raise OSError(errno.ENOSYS, 'Atomic rename unavailable')
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        if rename(source, entry_name(sys.argv[3]), destination, entry_name(sys.argv[5]), 2 if sys.argv[1] == 'exchange' else 1):
            raise OSError(ctypes.get_errno(), 'Atomic rename failed')
    elif len(sys.argv) == 5 and sys.argv[1] == 'link':
        source = descriptor_path(sys.argv[2])
        destination = os.open(descriptor_path(sys.argv[3]), os.O_RDONLY | os.O_DIRECTORY)
        opened.append(destination)
        os.link(os.fsencode(source), entry_name(sys.argv[4]), dst_dir_fd=destination, follow_symlinks=True)
    else:
        raise ValueError('Unsupported operation')
except OSError as error:
    print(error.errno, file=sys.stderr)
    sys.exit(1)
except ValueError:
    print(errno.EINVAL, file=sys.stderr)
    sys.exit(1)
finally:
    for handle in opened:
        os.close(handle)
