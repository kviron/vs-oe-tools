# Скрипт для запуска VS Code с установленной переменной окружения VC_VE_USER_ID

# Замените 3130673 на реальный UserID из БД Восточного Экспресса
$env:VC_VE_USER_ID = "3130673"

# Проверьте, что переменная установлена
Write-Host "✅ Переменная окружения установлена:" -ForegroundColor Green
Write-Host "   VC_VE_USER_ID = $env:VC_VE_USER_ID" -ForegroundColor Cyan

# Запустить VS Code
code
