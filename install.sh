#!/usr/bin/env bash
set -e

echo "===================================================="
echo " Zyro AR Smart Mirror -- Linux/macOS Setup"
echo "===================================================="

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found. Install Python 3.10+."
    exit 1
fi

echo ""
echo "[1/5] Creating virtual environment..."
python3 -m venv .venv

echo "[2/5] Activating and upgrading pip..."
source .venv/bin/activate
pip install --upgrade pip

echo "[3/5] Installing dependencies..."
pip install -r zyro/requirements.txt

echo "[4/5] Copying .env.example to .env..."
if [ ! -f zyro/.env ]; then
    cp zyro/.env.example zyro/.env
    echo "    .env created. Edit it to set your CAMERA_INDEX."
else
    echo "    .env already exists. Skipping."
fi

echo "[5/5] Generating assets..."
cd zyro && python generate_assets.py && cd ..

echo ""
echo "===================================================="
echo " Setup complete!"
echo " Run:  source .venv/bin/activate && python zyro/main.py"
echo "===================================================="
