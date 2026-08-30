@echo off
rem ============================================================
rem  PM-Core - auto transcribe watcher (double-click to start)
rem
rem  Watches the Downloads folder for PM-Core meeting recordings
rem  and converts them to .txt / .srt with Faster-Whisper-XXL.
rem  Everything runs locally - nothing is sent to the network.
rem
rem  Close this window to stop watching.
rem
rem  Compute device and model are decided automatically at start
rem  (NVIDIA GPU with enough VRAM -> cuda + large-v3-turbo,
rem  otherwise cpu + small). There used to be a separate
rem  start-watch-transcribe-cpu.cmd for machines without a usable
rem  GPU; it is gone - picking the wrong one was a real failure
rem  mode (CUDA OOM, nothing transcribed, no useful error).
rem  To override: -Device cpu|cuda  -Model <name>
rem
rem  Not installed yet? Run setup-transcribe.cmd first.
rem
rem  Details -> the transcription benchmark SOP under docs/guides/
rem
rem  NOTE: keep this file ASCII-only. cmd parses .cmd files with the
rem  legacy OEM codepage, so Chinese text here turns into mojibake.
rem  All Chinese output comes from the PowerShell script instead.
rem ============================================================
chcp 65001 >nul
title PM-Core - auto transcribe watcher
rem  Same guard as setup-transcribe.cmd (2026-08-27): five files are one set,
rem  and unpacking only this one leaves it with nothing to run.
if not exist "%~dp0watch-transcribe.ps1" goto :missing

powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0watch-transcribe.ps1" %*
echo.
echo Watcher stopped.
pause
exit /b 0

:missing
echo(
echo   [PM-Core] watch-transcribe.ps1 was NOT found next to this file.
echo(
echo   ---- diagnostics (screenshot this if you need help) ----
echo   This .cmd is running from:
echo     %~dp0
echo   Files sitting next to it right now:
dir /b "%~dp0" 2>nul
echo   ------------------------------------------------------
echo(
echo   You are probably running this from INSIDE the .zip file.
echo   Extract ALL 5 files into one folder first, then run it from there.
echo(
pause
exit /b 1
