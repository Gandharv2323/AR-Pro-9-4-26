@echo off
echo ╔═══════════════════════════════════╗
echo ║   Zyro AR Web — Local Server      ║
echo ╚═══════════════════════════════════╝
echo.
echo Starting local server on http://localhost:8080
echo Press Ctrl+C to stop.
echo.

:: Try Python 3 (conda zyro env first, then system)
where python >nul 2>&1
if %errorlevel%==0 (
  python -m http.server 8080
  goto :done
)

:: Fallback: try py launcher
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 -m http.server 8080
  goto :done
)

:: Fallback: Node.js npx serve
where npx >nul 2>&1
if %errorlevel%==0 (
  npx -y serve -p 8080 .
  goto :done
)

echo ERROR: No Python or Node.js found.
echo Install Python from https://python.org or Node.js from https://nodejs.org
echo Then re-run this script.
pause

:done
