' Lance le serveur Revente en arriere-plan, sans fenetre.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = dir
If Not fso.FolderExists(dir & "\data") Then fso.CreateFolder(dir & "\data")

node = "node"
pf = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
If fso.FileExists(pf) Then node = """" & pf & """"

sh.Run "cmd /c " & node & " --no-warnings server.js >> ""data\serveur.log"" 2>&1", 0, False
