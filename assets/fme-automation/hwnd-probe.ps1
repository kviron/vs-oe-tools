param(
    [Parameter(Mandatory=$true)][int]$TargetProcessId,
    [long]$WindowHandle = 0,
    [string]$ScreenshotPath = '',
    [switch]$ListElements,
    [long]$ClickChildHandle = 0,
    [int]$ClickX = 0,
    [int]$ClickY = 0,
    [switch]$AsyncClick,
    [switch]$DoubleClick,
    [int]$WheelNotches = 0,
    [int[]]$VirtualKeys = @(),
    [string]$InputText = ''
)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$process = Get-Process -Id $TargetProcessId -ErrorAction Stop
if ($process.ProcessName -ine 'FME') { throw 'Target process is not FME.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class FmeProbe {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder text, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint command);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent, IntPtr child);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageTimeoutW(IntPtr h, uint message, IntPtr wp, IntPtr lp, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessageW(IntPtr h, uint message, IntPtr wp, IntPtr lp);
}
'@
if ($WindowHandle -eq 0) {
    $items = [System.Collections.Generic.List[object]]::new()
    [FmeProbe]::EnumWindows({ param($h, $unused)
        [uint32]$pidValue = 0
        [void][FmeProbe]::GetWindowThreadProcessId($h, [ref]$pidValue)
        if ($pidValue -eq $TargetProcessId -and [FmeProbe]::IsWindowVisible($h)) {
            $title = [System.Text.StringBuilder]::new(512); $cls = [System.Text.StringBuilder]::new(256)
            [void][FmeProbe]::GetWindowText($h, $title, $title.Capacity)
            [void][FmeProbe]::GetClassName($h, $cls, $cls.Capacity)
            $rect = [FmeProbe+Rect]::new(); [void][FmeProbe]::GetWindowRect($h, [ref]$rect)
            $items.Add([pscustomobject]@{ hwnd=$h.ToInt64(); class=$cls.ToString(); title=$title.ToString(); owner=[FmeProbe]::GetWindow($h,4).ToInt64(); width=$rect.right-$rect.left; height=$rect.bottom-$rect.top })
        }
        return $true
    }, [IntPtr]::Zero) | Out-Null
    ConvertTo-Json -InputObject @($items) -Depth 4
    exit
}
$hwnd = [IntPtr]$WindowHandle; [uint32]$actualPid = 0
[void][FmeProbe]::GetWindowThreadProcessId($hwnd, [ref]$actualPid)
if ($actualPid -ne $TargetProcessId -or -not [FmeProbe]::IsWindowVisible($hwnd)) { throw 'Window is absent, hidden, or belongs to another process.' }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
$rect = [FmeProbe+Rect]::new(); if (-not [FmeProbe]::GetWindowRect($hwnd, [ref]$rect)) { throw 'Cannot read window bounds.' }
$width=$rect.right-$rect.left; $height=$rect.bottom-$rect.top
if ($width -le 0 -or $height -le 0 -or $width -gt 10000 -or $height -gt 10000) { throw 'Invalid window bounds.' }
if ($ClickChildHandle -ne 0) {
    $child=[IntPtr]$ClickChildHandle; [uint32]$childPid=0
    [void][FmeProbe]::GetWindowThreadProcessId($child,[ref]$childPid)
    if ($childPid -ne $TargetProcessId -or -not [FmeProbe]::IsChild($hwnd,$child)) { throw 'Click target is not a child of the selected window.' }
    $client=[FmeProbe+Rect]::new()
    if (-not [FmeProbe]::GetClientRect($child,[ref]$client) -or $ClickX -lt 0 -or $ClickY -lt 0 -or $ClickX -ge $client.right -or $ClickY -ge $client.bottom) { throw 'Click is outside the child client area.' }
    $point=[IntPtr](($ClickY -shl 16) -bor $ClickX); $messageResult=[IntPtr]::Zero
    if ($InputText.Length -gt 0) {
        if ($InputText.Length -gt 1000) { throw 'Text exceeds safety limit.' }
        foreach ($ch in $InputText.ToCharArray()) { if (-not [FmeProbe]::PostMessageW($child,0x102,[IntPtr][int][char]$ch,[IntPtr]1)) { throw 'Text input was not queued.' } }
    } elseif ($VirtualKeys.Count -gt 0) {
        foreach ($key in $VirtualKeys) {
            if ($key -lt 1 -or $key -gt 255) { throw 'Invalid virtual key.' }
            if (-not [FmeProbe]::PostMessageW($child,0x100,[IntPtr]$key,[IntPtr]1)) { throw 'Key-down was not queued.' }
            if (-not [FmeProbe]::PostMessageW($child,0x101,[IntPtr]$key,[IntPtr]0)) { throw 'Key-up was not queued.' }
        }
    } elseif ($WheelNotches -ne 0) {
        if ([Math]::Abs($WheelNotches) -gt 100) { throw 'Wheel notches exceed safety limit.' }
        $delta=if ($WheelNotches -gt 0) { 7864320 } else { -7864320 }
        for ($i=0; $i -lt [Math]::Abs($WheelNotches); $i++) { if (-not [FmeProbe]::PostMessageW($child,0x20a,[IntPtr]$delta,[IntPtr]0)) { throw 'Mouse wheel event was not queued.' } }
    } elseif ($AsyncClick) {
        if (-not [FmeProbe]::PostMessageW($child,0x201,[IntPtr]1,$point)) { throw 'Mouse-down was not queued.' }
        if (-not [FmeProbe]::PostMessageW($child,0x202,[IntPtr]0,$point)) { throw 'Mouse-up was not queued; inspect the window before retrying.' }
        if ($DoubleClick) {
            if (-not [FmeProbe]::PostMessageW($child,0x203,[IntPtr]1,$point)) { throw 'Double-click was not queued.' }
            if (-not [FmeProbe]::PostMessageW($child,0x202,[IntPtr]0,$point)) { throw 'Double-click release was not queued.' }
        }
    } else {
        if ([FmeProbe]::SendMessageTimeoutW($child,0x201,[IntPtr]1,$point,2,3000,[ref]$messageResult) -eq [IntPtr]::Zero) { throw 'Mouse-down did not complete; inspect the window before retrying.' }
        if ([FmeProbe]::SendMessageTimeoutW($child,0x202,[IntPtr]0,$point,2,3000,[ref]$messageResult) -eq [IntPtr]::Zero) { throw 'Mouse-up did not complete; inspect the window before retrying.' }
        if ($DoubleClick) {
            if ([FmeProbe]::SendMessageTimeoutW($child,0x203,[IntPtr]1,$point,2,3000,[ref]$messageResult) -eq [IntPtr]::Zero) { throw 'Double-click did not complete.' }
            if ([FmeProbe]::SendMessageTimeoutW($child,0x202,[IntPtr]0,$point,2,3000,[ref]$messageResult) -eq [IntPtr]::Zero) { throw 'Double-click release did not complete.' }
        }
    }
}
if ($ScreenshotPath) {
    $bitmap = [System.Drawing.Bitmap]::new($width,$height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $dc=$graphics.GetHdc()
        try { if (-not [FmeProbe]::PrintWindow($hwnd,$dc,2)) { throw 'PrintWindow failed.' } }
        finally { $graphics.ReleaseHdc($dc) }
        $bitmap.Save($ScreenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
$nodes = @()
if ($ListElements) {
    $all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    $nodes=@(foreach($item in $all) { $v=$item.Current; [pscustomobject]@{ name=$v.Name; class=$v.ClassName; hwnd=$v.NativeWindowHandle; bounds=$v.BoundingRectangle.ToString() } })
}
[pscustomobject]@{ hwnd=$WindowHandle; pid=$actualPid; name=$root.Current.Name; width=$width; height=$height; screenshot=$ScreenshotPath; clickSent=($ClickChildHandle -ne 0); nodes=$nodes } | ConvertTo-Json -Depth 5
