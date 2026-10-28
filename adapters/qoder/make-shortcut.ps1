# Creates "Qoder RTL" shortcuts (Desktop + this folder) that launch Qoder with
# the Persian RTL injector. Re-run after moving the repo or reinstalling Qoder.
#
#   powershell -ExecutionPolicy Bypass -File .\make-shortcut.ps1
$ErrorActionPreference = 'Stop'

$base = $PSScriptRoot
$vbs = Join-Path $base 'start-qoder-rtl.vbs'
if (-not (Test-Path -LiteralPath $vbs)) {
  throw 'start-qoder-rtl.vbs not found next to this script.'
}

function Get-QoderExe {
  $root = $env:QODER_ROOT
  if (-not $root) {
    $state = Join-Path $env:LOCALAPPDATA 'Qoder\Qoder Launcher\state.ini'
    if (Test-Path -LiteralPath $state) {
      $match = Select-String -LiteralPath $state -Pattern '^\s*installDir\s*=\s*(.+?)\s*$' |
        Select-Object -First 1
      if ($match) { $root = $match.Matches[0].Groups[1].Value.Trim() }
    }
  }
  if (-not $root) { return $null }

  $versions = Join-Path $root '.qoder-versions'
  if (Test-Path -LiteralPath $versions) {
    $newest = Get-ChildItem -LiteralPath $versions -Directory |
      Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'Qoder.exe') } |
      Sort-Object { try { [version]$_.Name } catch { [version]'0.0.0' } } |
      Select-Object -Last 1
    if ($newest) { return (Join-Path $newest.FullName 'Qoder.exe') }
  }

  $exe = Join-Path $root 'Qoder.exe'
  if (Test-Path -LiteralPath $exe) { return $exe }
  return $null
}

$exe = Get-QoderExe
$ws = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path $base 'Qoder RTL.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Qoder RTL.lnk')
)

foreach ($dest in $targets) {
  $s = $ws.CreateShortcut($dest)
  $s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $s.Arguments = '"' + $vbs + '"'
  $s.WorkingDirectory = $base
  if ($exe) { $s.IconLocation = $exe + ',0' }
  $s.Description = 'Launch Qoder with the Persian RTL fix'
  $s.Save()
  Write-Output ('created: ' + $dest)
}

if (-not $exe) {
  Write-Warning 'Qoder.exe not found for the icon. The shortcut still works; set QODER_ROOT if the launcher cannot find Qoder.'
}
