@echo off
setlocal
if exist "%~dp0.tools\node_modules\node\bin\node.exe" (
  set "PATH=%~dp0.tools\node_modules\node\bin;%PATH%"
  "%~dp0.tools\node_modules\node\bin\node.exe" "%~dp0.yarn\releases\yarn-3.8.1.cjs" %*
) else (
  node "%~dp0.yarn\releases\yarn-3.8.1.cjs" %*
)
exit /b %errorlevel%
