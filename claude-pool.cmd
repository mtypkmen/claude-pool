@echo off
setlocal
curl -s -o nul http://127.0.0.1:8787/_s || (start "claude-pool" /min node "%~dp0server.js" & timeout /t 2 /nobreak >nul)
set ANTHROPIC_BASE_URL=http://127.0.0.1:8787
claude %*
