"""
setup.py — Zyro AR package setup for pip install -e . support.
"""
from setuptools import setup, find_packages

setup(
    name="zyro-ar",
    version="1.0.0",
    description="AR Smart Mirror with virtual try-on using MediaPipe",
    author="Zyro Team",
    python_requires=">=3.10",
    packages=find_packages(),
    package_data={
        "": [
            "assets/**/*.png",
            "assets/manifest.json",
            "models/*.task",
            ".env.example",
        ]
    },
    install_requires=[
        "opencv-python==4.10.0.84",
        "mediapipe==0.10.14",
        "numpy==1.26.4",
        "Pillow==10.4.0",
        "python-dotenv==1.0.1",
    ],
    entry_points={
        "console_scripts": [
            "zyro=zyro.main:main",
        ]
    },
)
