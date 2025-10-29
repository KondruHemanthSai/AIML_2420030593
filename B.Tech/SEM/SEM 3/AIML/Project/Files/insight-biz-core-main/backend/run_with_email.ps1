# PowerShell script to run Flask backend with SMTP email configuration
# Edit the values below with your email credentials

$env:SMTP_SERVER = "smtp.gmail.com"
$env:SMTP_PORT = "587"
$env:SMTP_USER = "your-email@gmail.com"
$env:SMTP_PASSWORD = "your-app-password-here"
$env:FROM_EMAIL = "your-email@gmail.com"

Write-Host "Starting Flask backend with email configuration..." -ForegroundColor Green
Write-Host "Make sure you've updated the SMTP credentials in this file!" -ForegroundColor Yellow

python app.py

