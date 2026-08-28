param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$drawingAssembly = Join-Path $env:ProgramFiles "dotnet\shared\Microsoft.NETCore.App\8.0.30\System.Drawing.dll"
[void](Add-Type -AssemblyName System.Drawing -PassThru)
Add-Type -ReferencedAssemblies $drawingAssembly @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class VirgueWindowCapture {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

$target = [IntPtr]::Zero
$title = New-Object System.Text.StringBuilder 512
[VirgueWindowCapture]::EnumWindows({
  param($hWnd, $extraData)
  if (-not [VirgueWindowCapture]::IsWindowVisible($hWnd)) { return $true }
  $text = New-Object System.Text.StringBuilder 512
  [void][VirgueWindowCapture]::GetWindowText($hWnd, $text, $text.Capacity)
  if ($text.ToString() -eq "Virgue's Roblox Account Manager") {
    $script:target = $hWnd
    return $false
  }
  return $true
}, [IntPtr]::Zero)

if ($target -eq [IntPtr]::Zero) { throw "Virgue app window not found." }

$rect = New-Object VirgueWindowCapture+RECT
[void][VirgueWindowCapture]::GetWindowRect($target, [ref]$rect)
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
$bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
$ok = [VirgueWindowCapture]::PrintWindow($target, $hdc, 2)
$graphics.ReleaseHdc($hdc)
$graphics.Dispose()

if (-not $ok) { $bitmap.Dispose(); throw "PrintWindow failed." }

$absolute = [System.IO.Path]::GetFullPath($OutputPath)
$directory = [System.IO.Path]::GetDirectoryName($absolute)
if (-not [System.IO.Directory]::Exists($directory)) { [System.IO.Directory]::CreateDirectory($directory) | Out-Null }
$bitmap.Save($absolute, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
Write-Output $absolute
