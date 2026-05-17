#!/usr/bin/env python3
"""
ReviewMind ML Service Launcher
Run with: python run.py
"""

import subprocess
import sys
import os

def main():
    print("=" * 50)
    print("ReviewMind ML Service v5.1")
    print("=" * 50)
    
    # Create data directory
    os.makedirs("data", exist_ok=True)
    
    # Check numpy version
    try:
        import numpy
        if numpy.__version__.startswith('2.'):
            print("⚠️  Wrong numpy version detected. Reinstalling...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "numpy==1.24.3", "--force-reinstall"])
    except ImportError:
        print("Installing numpy...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "numpy==1.24.3"])
    
    # Install requirements
    print("Checking dependencies...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "--quiet"])
    
    # Run the service
    print("\n🚀 Starting ML Service on http://localhost:8000")
    print("📊 API Docs: http://localhost:8000/docs")
    print("=" * 50)
    
    subprocess.run([
        sys.executable, "-m", "uvicorn",
        "ml_service:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--reload",
        "--workers", "1"
    ])

if __name__ == "__main__":
    main()