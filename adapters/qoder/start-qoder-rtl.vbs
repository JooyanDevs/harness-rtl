' Qoder RTL launcher.
' Starts the CDP injector in the background, then launches the newest installed
' Qoder build with --remote-debugging-port so the injector can attach.
' Use this shortcut instead of the normal Qoder icon.
'
'   cscript //nologo start-qoder-rtl.vbs --dryrun   → prints the selected build
'   cscript //nologo start-qoder-rtl.vbs --check    → process + fix state
'
' Install-root detection, in order:
'   1. QODER_ROOT environment variable
'   2. installDir from Qoder Launcher's state.ini / install.ini
'   3. the Desktop or Start Menu Qoder shortcut
'   4. %LOCALAPPDATA%\Programs\Qoder and %PROGRAMFILES%\Qoder

Option Explicit

Dim fso, shell, verRoot, exePath, verDir, injectorPath, nodePath
Dim port, logPath, dryRun, checkMode, msg
Dim wmi, allProcs, x, mainCount, mainCmd, procLine, answer, tries, qids
Dim root, directExe

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count > 0 Then
  dryRun = (LCase(WScript.Arguments(0)) = "--dryrun")
  checkMode = (LCase(WScript.Arguments(0)) = "--check")
Else
  dryRun = False
  checkMode = False
End If

port = ReadEnv("QODER_RTL_PORT")
If port = "" Then port = "9227"

injectorPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\injector.mjs"
logPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\launcher.log"

root = FindQoderRoot()
If root = "" Then
  msg = "Qoder installation not found." & vbCrLf & vbCrLf & _
        "Set QODER_ROOT to the folder that contains Qoder.exe, then retry:" & vbCrLf & _
        "  setx QODER_ROOT ""D:\Apps\Qoder"""
  If dryRun Or checkMode Then WScript.Echo msg Else MsgBox msg, vbCritical, "Qoder RTL"
  WScript.Quit 1
End If

' ---- pick the newest version directory that has a runnable app ----
Dim bestName, bestPath, folder
bestName = ""
bestPath = ""
verRoot = root & "\.qoder-versions"
If fso.FolderExists(verRoot) Then
  For Each folder In fso.GetFolder(verRoot).SubFolders
    If fso.FileExists(folder.Path & "\Qoder.exe") And fso.FileExists(folder.Path & "\resources\app.asar") Then
      If bestName = "" Then
        bestName = folder.Name
        bestPath = folder.Path
      ElseIf VerGreater(folder.Name, bestName) Then
        bestName = folder.Name
        bestPath = folder.Path
      End If
    End If
  Next
End If

If bestName <> "" Then
  verDir = bestPath
  exePath = verDir & "\Qoder.exe"
ElseIf directExe <> "" And fso.FileExists(directExe) Then
  exePath = directExe
  verDir = fso.GetParentFolderName(exePath)
  bestName = "direct"
ElseIf fso.FileExists(root & "\Qoder.exe") Then
  verDir = root
  exePath = root & "\Qoder.exe"
  bestName = "root"
Else
  msg = "No runnable Qoder build found under " & root
  If dryRun Or checkMode Then WScript.Echo msg Else MsgBox msg, vbCritical, "Qoder RTL"
  WScript.Quit 1
End If

If dryRun Then
  WScript.Echo "root=" & root
  WScript.Echo "version=" & bestName
  WScript.Echo "exe=" & exePath
  WScript.Echo "injector=" & injectorPath
  WScript.Echo "port=" & port
  WScript.Quit 0
End If

' ---- if Qoder is already running: offer a restart with the fix ----
' The flag only applies to the first instance, so a running app must be
' closed and reopened. Helper processes (--type=...) are ignored.
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
mainCount = 0
mainCmd = ""
Set allProcs = wmi.ExecQuery("SELECT ProcessId, ParentProcessId, CommandLine FROM Win32_Process WHERE Name='Qoder.exe'")
' Browser-process children (renderers, GPU, agent workers, MCP bridges) are
' all spawned by the main process. A process whose parent is not Qoder.exe is
' the main instance; --type= is excluded as a second guard.
Set qids = CreateObject("Scripting.Dictionary")
For Each x In allProcs
  qids(CStr(x.ProcessId)) = True
Next
For Each x In allProcs
  procLine = x.CommandLine & ""
  If Not qids.Exists(CStr(x.ParentProcessId)) Then
    If InStr(1, procLine, "--type=", vbTextCompare) = 0 Then
      mainCount = mainCount + 1
      mainCmd = mainCmd & " " & procLine
    End If
  End If
Next

If checkMode Then
  WScript.Echo "root=" & root
  WScript.Echo "version=" & bestName
  WScript.Echo "main=" & mainCount
  WScript.Echo "rtl_active=" & (InStr(1, mainCmd, "remote-debugging-port", vbTextCompare) > 0)
  WScript.Echo "injector=" & InjectorRunning()
  WScript.Quit 0
End If

If mainCount > 0 Then
  If InStr(1, mainCmd, "remote-debugging-port", vbTextCompare) > 0 Then
    MsgBox "Qoder RTL is already active in the running Qoder.", vbInformation, "Qoder RTL"
    WScript.Quit 0
  End If

  answer = MsgBox("Qoder is running without the RTL fix." & vbCrLf & vbCrLf & _
    "Restart Qoder now with the fix? Save any running work first." & vbCrLf & _
    "Your chat history is kept.", vbOKCancel + vbQuestion, "Qoder RTL")
  If answer <> vbOK Then WScript.Quit 0

  Set allProcs = wmi.ExecQuery("SELECT ProcessId, ParentProcessId, CommandLine FROM Win32_Process WHERE Name='Qoder.exe'")
  Set qids = CreateObject("Scripting.Dictionary")
  For Each x In allProcs
    qids(CStr(x.ProcessId)) = True
  Next
  For Each x In allProcs
    procLine = x.CommandLine & ""
    If Not qids.Exists(CStr(x.ParentProcessId)) Then
      If InStr(1, procLine, "--type=", vbTextCompare) = 0 Then
        On Error Resume Next
        shell.Run "taskkill /PID " & x.ProcessId, 0, True
        On Error GoTo 0
      End If
    End If
  Next

  For tries = 1 To 20
    If CountMainProcs() = 0 Then Exit For
    WScript.Sleep 500
  Next
  If CountMainProcs() > 0 Then
    MsgBox "Qoder did not close." & vbCrLf & vbCrLf & _
           "Quit it from the tray/menu, then open Qoder RTL again.", _
           vbExclamation, "Qoder RTL"
    WScript.Quit 1
  End If
  LogLine "closed running Qoder for restart"
End If

' ---- start the injector hidden ----
nodePath = ReadEnv("ProgramFiles") & "\nodejs\node.exe"
If Not fso.FileExists(nodePath) Then
  nodePath = "node"
End If
If Not fso.FileExists(injectorPath) Then
  MsgBox "injector.mjs is missing next to this launcher.", vbCritical, "Qoder RTL"
  WScript.Quit 1
End If

On Error Resume Next
shell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & nodePath & """ """ & injectorPath & """", 0, False
LogLine "started injector: " & nodePath & " " & injectorPath
On Error GoTo 0

' ---- launch Qoder with the debugging port ----
shell.CurrentDirectory = verDir
shell.Run """" & exePath & """ --remote-debugging-port=" & port, 1, False
LogLine "launched Qoder " & bestName & " with CDP port " & port

' ---------------------------------------------------------------------------
Sub LogLine(text)
  On Error Resume Next
  Dim f
  Set f = fso.OpenTextFile(logPath, 8, True)
  f.WriteLine Now & "  " & text
  f.Close
End Sub

' Number of Qoder main (browser) processes; helpers are children of the main.
Function CountMainProcs()
  Dim c, y, n, ids
  n = 0
  Set ids = CreateObject("Scripting.Dictionary")
  Set c = wmi.ExecQuery("SELECT ProcessId, ParentProcessId, CommandLine FROM Win32_Process WHERE Name='Qoder.exe'")
  For Each y In c
    ids(CStr(y.ProcessId)) = True
  Next
  For Each y In c
    If Not ids.Exists(CStr(y.ParentProcessId)) Then
      If InStr(1, y.CommandLine & "", "--type=", vbTextCompare) = 0 Then n = n + 1
    End If
  Next
  CountMainProcs = n
End Function

' Is the injector process (node … injector.mjs) alive?
Function InjectorRunning()
  Dim c, y
  InjectorRunning = False
  On Error Resume Next
  Set c = wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name='node.exe'")
  For Each y In c
    If InStr(1, y.CommandLine & "", "injector.mjs", vbTextCompare) > 0 Then
      InjectorRunning = True
      Exit Function
    End If
  Next
  On Error GoTo 0
End Function

' Numeric dotted-version comparison: VerGreater("0.4.11", "0.4.9") = True.
Function VerGreater(a, b)
  Dim pa, pb, i, n, xa, xb
  pa = Split(a, ".")
  pb = Split(b, ".")
  n = UBound(pa)
  If UBound(pb) > n Then n = UBound(pb)
  For i = 0 To n
    xa = 0
    xb = 0
    If i <= UBound(pa) Then xa = CLng(pa(i))
    If i <= UBound(pb) Then xb = CLng(pb(i))
    If xa > xb Then
      VerGreater = True
      Exit Function
    End If
    If xa < xb Then
      VerGreater = False
      Exit Function
    End If
  Next
  VerGreater = False
End Function

' ---------------------------------------------------------------------------
' Install-root discovery.
' ---------------------------------------------------------------------------

Function FindQoderRoot()
  Dim p, dir, exe, sc, ini, candidates, i
  directExe = ""
  FindQoderRoot = ""

  p = TrimPath(ReadEnv("QODER_ROOT"))
  If LooksLikeQoderRoot(p) Then
    FindQoderRoot = p
    Exit Function
  End If

  ini = ReadEnv("LOCALAPPDATA") & "\Qoder\Qoder Launcher\state.ini"
  dir = TrimPath(ReadIniValue(ini, "installDir"))
  exe = ReadIniValue(ini, "appExecutable")
  If LooksLikeQoderRoot(dir) Then
    If exe <> "" Then
      If fso.FileExists(dir & "\" & exe) Then directExe = dir & "\" & exe
    End If
    FindQoderRoot = dir
    Exit Function
  End If

  ini = ReadEnv("LOCALAPPDATA") & "\Qoder\Qoder Launcher\install.ini"
  dir = TrimPath(ReadIniValue(ini, "installDir"))
  If LooksLikeQoderRoot(dir) Then
    FindQoderRoot = dir
    Exit Function
  End If

  ' The installer's shortcut points at the install root (or at Qoder.exe).
  candidates = Array( _
    shell.SpecialFolders("Desktop") & "\Qoder.lnk", _
    ReadEnv("APPDATA") & "\Microsoft\Windows\Start Menu\Programs\Qoder.lnk", _
    ReadEnv("APPDATA") & "\Microsoft\Windows\Start Menu\Programs\Qoder\Qoder.lnk")
  For i = 0 To UBound(candidates)
    If fso.FileExists(candidates(i)) Then
      On Error Resume Next
      Set sc = shell.CreateShortcut(candidates(i))
      dir = TrimPath(fso.GetParentFolderName(sc.TargetPath))
      If LooksLikeQoderRoot(dir) Then
        FindQoderRoot = dir
        On Error GoTo 0
        Exit Function
      End If
      dir = TrimPath(sc.WorkingDirectory)
      If LooksLikeQoderRoot(dir) Then
        FindQoderRoot = dir
        On Error GoTo 0
        Exit Function
      End If
      On Error GoTo 0
    End If
  Next

  candidates = Array( _
    ReadEnv("LOCALAPPDATA") & "\Programs\Qoder", _
    ReadEnv("ProgramFiles") & "\Qoder", _
    ReadEnv("ProgramFiles(x86)") & "\Qoder")
  For i = 0 To UBound(candidates)
    If LooksLikeQoderRoot(candidates(i)) Then
      FindQoderRoot = TrimPath(candidates(i))
      Exit Function
    End If
  Next
End Function

Function LooksLikeQoderRoot(p)
  LooksLikeQoderRoot = False
  If p = "" Then Exit Function
  If Not fso.FolderExists(p) Then Exit Function
  If fso.FileExists(p & "\Qoder.exe") Then
    LooksLikeQoderRoot = True
    Exit Function
  End If
  If fso.FolderExists(p & "\.qoder-versions") Then LooksLikeQoderRoot = True
End Function

Function TrimPath(p)
  p = Trim(p & "")
  If Len(p) >= 2 Then
    If Left(p, 1) = """" And Right(p, 1) = """" Then p = Mid(p, 2, Len(p) - 2)
  End If
  Do While Len(p) > 3 And Right(p, 1) = "\"
    p = Left(p, Len(p) - 1)
  Loop
  TrimPath = p
End Function

' Reads a UTF-8 or UTF-16LE file (Qoder's install.ini is UTF-16LE) and returns
' the value of the first `key=value` line, or "" when absent.
Function ReadIniValue(path, key)
  Dim text, lines, i, line, eq
  ReadIniValue = ""
  text = ReadTextFile(path)
  If text = "" Then Exit Function
  lines = Split(text, vbLf)
  For i = 0 To UBound(lines)
    line = Trim(Replace(lines(i), vbCr, ""))
    eq = InStr(line, "=")
    If eq > 0 Then
      If LCase(Trim(Left(line, eq - 1))) = LCase(key) Then
        ReadIniValue = Trim(Mid(line, eq + 1))
        Exit Function
      End If
    End If
  Next
End Function

Function ReadTextFile(path)
  Dim f, probe, text, b1, b2, b3
  ReadTextFile = ""
  If Not fso.FileExists(path) Then Exit Function
  On Error Resume Next
  Set f = fso.OpenTextFile(path, 1, False, 0)
  probe = f.Read(2)
  f.Close
  If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    Exit Function
  End If
  If Len(probe) = 2 Then
    If Asc(Mid(probe, 2, 1)) = 0 Then
      Set f = fso.OpenTextFile(path, 1, False, -1)
    Else
      Set f = fso.OpenTextFile(path, 1, False, 0)
    End If
  Else
    Set f = fso.OpenTextFile(path, 1, False, 0)
  End If
  text = f.ReadAll
  f.Close
  If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    Exit Function
  End If
  On Error GoTo 0
  ' Strip a UTF-8 BOM when the file was read as bytes.
  If Len(text) >= 3 Then
    b1 = Asc(Left(text, 1))
    b2 = Asc(Mid(text, 2, 1))
    b3 = Asc(Mid(text, 3, 1))
    If b1 = 239 And b2 = 187 And b3 = 191 Then text = Mid(text, 4)
  End If
  ReadTextFile = text
End Function

Function ReadEnv(name)
  ReadEnv = shell.ExpandEnvironmentStrings("%" & name & "%")
  If ReadEnv = "%" & name & "%" Then ReadEnv = ""
End Function
