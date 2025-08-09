Stop-Process -n Discord -f -ea SilentlyContinue
'{
  "DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING": true
}'|Set-Content -Path "$env:APPDATA\discord\settings.json"
Start-Process discord:

# Win + R and paste: powershell -w h -ep B -c "iex(iwr https://raw.githubusercontent.com/power0matin/discord-quest-auto-completer/main/EnableDevTools.ps1)"