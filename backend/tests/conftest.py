"""Pytest configuration and fixtures for backend tests."""

import pytest
import sys
from pathlib import Path

# Add the app directory to the path so we can import from it
sys.path.insert(0, str(Path(__file__).parent.parent))
