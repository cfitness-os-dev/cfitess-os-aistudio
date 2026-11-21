$wscript = New-Object -ComObject WScript.Shell
$shortcut = $wscript.CreateShortcut("C:\Users\FP123\Desktop\Claude Code Local.lnk")
$shortcut.TargetPath = "E:\cfitess-os-aistudio\scripts\launch_claude_local.bat"
$shortcut.WorkingDirectory = "E:\cfitess-os-aistudio"
$shortcut.Description = "Claude Code 100% Local (LiteLLM / Ollama / LM Studio)"
$shortcut.Save()
Write-Host "Raccourci Claude Code Local cree sur le Bureau avec succes."
