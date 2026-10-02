# Builds the latest Crest desktop installer.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-desktop.ps1
#
# Loads the MSVC environment (the Rust linker needs it), runs the full desktop
# build, then prints the exact path and size of the fresh installer.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo

# --- locate vcvars64.bat ---------------------------------------------------
$vcvars = $null
$known = 'D:\vs 2022\VC\Auxiliary\Build\vcvars64.bat'
if (Test-Path $known) {
    $vcvars = $known
} else {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path $vswhere) {
        $install = & $vswhere -latest -products * `
            -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
            -property installationPath
        if ($install) {
            $candidate = Join-Path $install 'VC\Auxiliary\Build\vcvars64.bat'
            if (Test-Path $candidate) { $vcvars = $candidate }
        }
    }
}

if ($vcvars) {
    Write-Host "Using MSVC env: $vcvars" -ForegroundColor DarkGray
    $cmd = 'call "' + $vcvars + '" >nul && npm run desktop:build'
} else {
    Write-Warning 'vcvars64.bat not found; relying on a PATH that already has the MSVC tools.'
    $cmd = 'npm run desktop:build'
}

Write-Host 'Building Crest. This takes a few minutes...' -ForegroundColor Cyan
cmd /c $cmd
$exit = $LASTEXITCODE
Pop-Location

if ($exit -ne 0) {
    Write-Host "Build FAILED (exit $exit)." -ForegroundColor Red
    exit $exit
}

# --- report what we produced ----------------------------------------------
$bundle = Join-Path $repo 'src-tauri\target\release\bundle\nsis'
$setup = Get-ChildItem -Path $bundle -Filter '*setup.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

$exe = Join-Path $repo 'src-tauri\target\release\crest.exe'

Write-Host ''
if (Test-Path $exe) {
    $f = Get-Item $exe
    Write-Host ("Crest.exe     {0:N0} bytes  {1}" -f $f.Length, $f.LastWriteTime) -ForegroundColor Green
}
if ($setup) {
    Write-Host ("Installer     {0}" -f $setup.FullName) -ForegroundColor Green
    Write-Host ("              {0:N0} bytes  {1}" -f $setup.Length, $setup.LastWriteTime) -ForegroundColor Green
} else {
    Write-Warning "No installer found in $bundle"
}
Write-Host ''
Write-Host 'Run the installer to install it.' -ForegroundColor Cyan
