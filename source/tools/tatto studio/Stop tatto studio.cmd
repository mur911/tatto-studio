@echo off
setlocal
chcp 65001 >nul
if not exist "%~dp0runtime\python\pythonw.exe" (
 echo [zh-CN] 缺少随包 Python 运行库，请重新解压完整安装包。
 echo [en] The bundled Python runtime is missing. Extract the complete release ZIP.
 echo [fr] Le runtime Python fourni est absent. Extrayez l’archive complète.
 echo [it] Il runtime Python incluso è mancante. Estrai lo ZIP completo.
 echo [ja] 同梱のPythonランタイムがありません。完全なZIPを再展開してください。
 echo [de] Die mitgelieferte Python-Laufzeit fehlt. Das vollständige ZIP entpacken.
 echo [es] Falta el entorno Python incluido. Extrae el ZIP completo.
 echo [pt-BR] O runtime Python incluído está ausente. Extraia o ZIP completo.
 echo [ru] Отсутствует встроенная среда Python. Распакуйте полный ZIP релиза.
 pause
 exit /b 1
)
start "" "%~dp0runtime\python\pythonw.exe" -B "%~dp0launcher.py" stop
exit /b
