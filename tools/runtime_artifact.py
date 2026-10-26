"""Bind a local runtime to verified, immutable JAR bytes; never overwrite an old artifact."""
import hashlib
import os
from pathlib import Path
import re
import tempfile


def stage_runtime_artifact(source: Path, runtime: Path, expected_sha256=None):
    source, runtime = Path(source), Path(runtime)
    if source.is_symlink() or not source.is_file():
        raise ValueError('JAR must be an existing regular file, not a symbolic link')
    if expected_sha256 is not None and not re.fullmatch(r'[a-fA-F0-9]{64}', expected_sha256):
        raise ValueError('Expected SHA-256 must contain all 64 hexadecimal characters')
    data = source.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if expected_sha256 is not None and digest != expected_sha256.lower():
        raise ValueError('JAR SHA-256 mismatch; no runtime started')
    if runtime.is_symlink():
        raise ValueError('Runtime directory must not be a symbolic link')
    runtime.mkdir(mode=0o700, parents=True, exist_ok=True)
    immutable = runtime / f'campus-ai-timetable-{digest[:16]}.jar'

    def verify_existing():
        if immutable.is_symlink() or not immutable.is_file():
            raise ValueError('Existing runtime artifact is not a regular file; left unchanged')
        if hashlib.sha256(immutable.read_bytes()).hexdigest() != digest:
            raise ValueError('Existing runtime artifact has different bytes; left unchanged')

    if immutable.exists() or immutable.is_symlink():
        verify_existing()
        return immutable, digest
    # Publish a fully written file without a replace/overwrite race.
    with tempfile.NamedTemporaryFile(prefix='.runtime-jar-', dir=runtime, delete=False) as staging:
        temporary = Path(staging.name)
        try:
            os.chmod(temporary, 0o600)
            staging.write(data)
            staging.flush()
            os.fsync(staging.fileno())
            try:
                os.link(temporary, immutable)
            except FileExistsError:
                verify_existing()
        finally:
            temporary.unlink()  # Only this call's freshly created staging file.
    return immutable, digest
