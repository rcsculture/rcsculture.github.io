@echo off
echo ------------------------------
echo [     activating project     ]
echo ------------------------------
REM ------------------------------------------------------------
REM Resolve script directory
REM ------------------------------------------------------------
REM Set project root folder = parent folder of script directory

SET SCRIPT_DIR=%~dp0
SET PROJECT_ROOT_FOLDER=%SCRIPT_DIR:~0,-1%

REM ------------------------------------------------------------
REM Create/activate python venv
REM ------------------------------------------------------------
IF NOT EXIST "%PROJECT_ROOT_FOLDER%\venv" (
    echo creating python virtual environment...
    python -m venv "%PROJECT_ROOT_FOLDER%\venv"
)
echo activating python environment...
IF EXIST "%PROJECT_ROOT_FOLDER%\venv\Scripts\activate.bat" (
    call "%PROJECT_ROOT_FOLDER%\venv\Scripts\activate.bat"
) ELSE IF EXIST "%PROJECT_ROOT_FOLDER%\venv\bin\activate.bat" (
    call "%PROJECT_ROOT_FOLDER%\venv\bin\activate.bat"
) ELSE (
    echo could not find venv activation script.
)

echo checking python packages...
python -m pip install -r "%PROJECT_ROOT_FOLDER%\requirements.txt" --disable-pip-version-check -q --index-url https://pypi.org/simple

REM ------------------------------------------------------------
REM Set environment variables
REM ------------------------------------------------------------
echo setting environment variables...
for /f "usebackq tokens=1,* delims==" %%A in ("%PROJECT_ROOT_FOLDER%\planetraves.env") do (
    set "%%A=%%B"
)

REM Read the Supabase access token from the user's token file
IF EXIST "%HOME%\.supabase\planetraves.token" (
    set /p SUPABASE_ACCESS_TOKEN=<"%HOME%\.supabase\planetraves.token"
) ELSE (
    echo WARNING: token file not found: "%HOME%\.supabase\planetraves.token"
)

echo SUCCESS

ENDLOCAL
