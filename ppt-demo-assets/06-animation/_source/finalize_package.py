"""Refresh the complete asset package using the shared two-format validator."""
from pathlib import Path
import runpy
import sys
shared=Path(__file__).resolve().parents[2]/'07-animation-portrait/_source/finalize_package.py'
sys.path.insert(0,str(shared.parent))
runpy.run_path(str(shared),run_name='__main__')
