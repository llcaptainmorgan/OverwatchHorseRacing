@echo off
setlocal
cd /d "%~dp0\.."
echo Starting SCSS watcher...
npx sass --watch styles/main.scss:main/styles.css --no-source-map
endlocal
