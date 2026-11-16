"""Copy access metadata between descriptors held open by the calling Node process."""
import os
import re
import stat
import sys

if len(sys.argv) != 3 or any(not re.fullmatch(r'/proc/[0-9]+/fd/[0-9]+', arg) for arg in sys.argv[1:]):
    raise SystemExit('Expected retained file descriptors')

source = os.open(sys.argv[1], os.O_RDONLY)
destination = os.open(sys.argv[2], os.O_RDONLY)
try:
    metadata = os.fstat(source)
    if not stat.S_ISREG(metadata.st_mode) or not stat.S_ISREG(os.fstat(destination).st_mode):
        raise SystemExit('Metadata copy requires regular files')
    os.fchown(destination, metadata.st_uid, metadata.st_gid)
    os.fchmod(destination, stat.S_IMODE(metadata.st_mode) & 0o777)
    allowed = lambda name: name.startswith('user.') or name in ('system.posix_acl_access', 'security.selinux')
    names = {name for name in os.listxattr(source) if allowed(name)}
    for name in os.listxattr(destination):
        if allowed(name) and name not in names:
            os.removexattr(destination, name)
    for name in names:
        os.setxattr(destination, name, os.getxattr(source, name))
finally:
    os.close(destination)
    os.close(source)
