@echo off
rem ============================================================
rem  PM-Core - one-click setup for meeting-recording transcription
rem
rem  Downloads Faster-Whisper-XXL, extracts it to the Desktop,
rem  figures out whether this machine should use the GPU or the
rem  CPU, pre-fetches the matching model, creates a Desktop
rem  shortcut and starts the watcher. No commands to type, no
rem  options to pick.
rem
rem  NOTE: this is the ONLY script in the set that touches the
rem  network - it downloads ~1.4 GB from GitHub. Once installed,
rem  transcription runs fully offline.
rem
rem  Keep all of these in the same folder:
rem    setup-transcribe.cmd / setup-transcribe.ps1
rem    start-watch-transcribe.cmd / watch-transcribe.ps1
rem    transcribe-lib.ps1
rem
rem  NOTE: keep this file ASCII-only. cmd parses .cmd files with the
rem  legacy OEM codepage, so Chinese text here turns into mojibake.
rem  All Chinese output comes from the PowerShell script instead.
rem ============================================================
chcp 65001 >nul
title PM-Core - transcription setup
rem  Guard added 2026-08-27 (Paul: "clicked it, the window vanished instantly").
rem  If the .ps1 is not next to this file, powershell -File fails and the console
rem  closes before anything can be read - it looks exactly like a crash.
rem  By far the most common cause: running this straight from INSIDE the .zip,
rem  because Windows only unpacks the single file you double-clicked.
rem  So: check first, say why in plain words, and pause so it can be read.
if not exist "%~dp0setup-transcribe.ps1" goto :missing

powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0setup-transcribe.ps1" %*
if errorlevel 1 goto :failed
exit /b 0

:missing
echo(
echo   [PM-Core] setup-transcribe.ps1 was NOT found next to this file.
echo(
echo   ---- diagnostics (screenshot this if you need help) ----
echo   This .cmd is running from:
echo     %~dp0
echo   Files sitting next to it right now:
dir /b "%~dp0" 2>nul
echo   ------------------------------------------------------
echo(
echo(
echo   You are probably running this from INSIDE the .zip file.
echo   Windows only unpacks the one file you double-clicked, so the rest are missing.
echo(
echo   How to fix:
echo     1. Right-click the .zip  -^>  "Extract All..."   (all 5 files)
echo     2. Open the unpacked folder
echo     3. Double-click setup-transcribe.cmd in THAT folder
echo(
pause
exit /b 1

:failed
echo(
echo   [PM-Core] Setup did not finish. The reason is in the messages above.
echo(
pause
exit /b 1
