@echo off
REM OHR Batch TTS Audio Generator
REM This batch file generates all Ana commentary audio files

echo.
echo ========================================
echo   OHR Ana Commentary Audio Generator
echo ========================================
echo.

REM Navigate to this directory
pushd "%~dp0"

REM Get the parent directory (main XTTS project)
for %%I in (.) do set "CURRENT_DIR=%%~fI"
for %%I in ("%CURRENT_DIR%\..") do set "PARENT_DIR=%%~fI"

echo Current directory: %CURRENT_DIR%
echo Parent directory: %PARENT_DIR%

REM Try to activate virtual environment
echo Activating virtual environment...
if exist "%PARENT_DIR%\venv\Scripts\activate.bat" (
    call "%PARENT_DIR%\venv\Scripts\activate.bat"
    echo Virtual environment activated.
) else (
    echo ERROR: Virtual environment not found at %PARENT_DIR%\venv\Scripts\activate.bat
    echo Please ensure you are running this from the OHR_Voicelines folder
    echo and that the virtual environment exists in the parent directory.
    pause
    popd
    exit /b 1
)

REM Verify Python is available
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found even after activating virtual environment.
    echo Please check your virtual environment setup.
    pause
    popd
    exit /b 1
)

echo Python version:
python --version

echo.
echo Starting batch TTS generation...
echo This may take several minutes for all voicelines...
echo.

REM Run the TTS generator
python ohr_voiceline_manager.py generate

echo.
echo Generation complete! Check the category folders for audio files.
echo.
pause

popd