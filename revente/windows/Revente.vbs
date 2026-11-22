' Ouvre Revente dans sa propre fenetre (comme une application).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
url = "http://localhost:3000"

Function EstLance()
  On Error Resume Next
  Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  x.setTimeouts 1500, 1500, 1500, 1500
  x.Open "GET", url & "/api/me", False
  x.Send
  EstLance = (Err.Number = 0)
End Function

If Not EstLance() Then
  sh.Run "wscript.exe """ & dir & "\windows\serveur.vbs""", 0, False
  For i = 1 To 30
    WScript.Sleep 500
    If EstLance() Then Exit For
  Next
End If

navigateur = ""
For Each p In Array("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe", "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe", "%ProgramFiles%\Google\Chrome\Application\chrome.exe", "%LocalAppData%\Google\Chrome\Application\chrome.exe")
  chemin = sh.ExpandEnvironmentStrings(p)
  If navigateur = "" And fso.FileExists(chemin) Then navigateur = chemin
Next

If navigateur <> "" Then
  sh.Run """" & navigateur & """ --app=" & url & " --window-size=1280,860", 1, False
Else
  sh.Run url, 1, False
End If
