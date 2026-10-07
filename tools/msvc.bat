@echo off
REM Run one command with the MSVC environment loaded, then exit.
REM Usage: call msvc.bat <logfile>
call "D:\vs 2022\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
if errorlevel 1 (
  echo MSVC environment failed to load
  exit /b 1
)
%*