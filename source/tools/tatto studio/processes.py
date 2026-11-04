"""Run resource tools without opening transient Windows console windows."""
import subprocess
import os


def run(*args, **kwargs):
    if os.name == 'nt':
        kwargs['creationflags'] = kwargs.get('creationflags', 0) | subprocess.CREATE_NO_WINDOW
    return subprocess.run(*args, **kwargs)
