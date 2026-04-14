@echo off
setlocal EnableDelayedExpansion
echo ====================================================
echo  Zyro AR Smart Mirror -- Windows Setup
echo ====================================================

REM --- Find a working Python 3.10+ ---
set "PYTHON_EXE="
for %%P in (
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "%USERPROFILE%\AppData\Local\Programs\Python\Python313\python.exe"
    "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe"
    "%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe"
    "%USERPROFILE%\AppData\Local\Programs\Python\Python310\python.exe"
) do (
    if exist %%P (
        set "PYTHON_EXE=%%~P"
        goto :found_python
    )
)

REM Try py launcher as last resort
where py >nul 2>&1
if %errorlevel% equ 0 (
    py --version >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_EXE=py"
        goto :found_python
    )
)

echo.
echo ERROR: Python 3.10+ not found.
echo   Download from: https://www.python.org/downloads/
echo   Make sure to check "Add Python to PATH" during install.
pause
exit /b 1

:found_python
echo   Using Python: %PYTHON_EXE%
echo.

echo [1/6] Creating virtual environment (.venv)...
"%PYTHON_EXE%" -m venv .venv
if %errorlevel% neq 0 (
    echo ERROR: Failed to create virtual environment.
    pause
    exit /b 1
)

echo [2/6] Activating environment and upgrading pip...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet

echo [3/6] Installing dependencies...
pip install -r zyro\requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: pip install failed. Check requirements.txt and your internet connection.
    pause
    exit /b 1
)

echo [4/6] Verifying or creating .env...
if not exist zyro\.env (
    copy zyro\.env.example zyro\.env >nul
    echo     .env created from template. Edit it to change camera/settings.
) else (
    echo     .env already exists — skipping.
)

echo [5/6] Generating assets (glasses, shirts, accessories)...
cd zyro
python generate_assets.py
if %errorlevel% neq 0 (
    echo WARNING: Asset generation failed. Try: python zyro\generate_assets.py manually.
)
cd ..

echo [6/6] Verifying model files...
if not exist zyro\models\face_landmarker.task (
    echo   Models missing — downloading from Google CDN...
    cd zyro
    python -m src.models.download_models
    cd ..
) else (
    echo   Models found. Skipping download.
)

echo.
echo ====================================================
echo  Setup complete!
echo.
echo  To run Zyro AR:
echo    .venv\Scripts\activate
echo    python zyro\main.py
echo.
echo  With debug overlay:
echo    python zyro\main.py --debug
echo.
echo  To run tests:
echo    pytest zyro\tests\ -v
echo ====================================================
pause
