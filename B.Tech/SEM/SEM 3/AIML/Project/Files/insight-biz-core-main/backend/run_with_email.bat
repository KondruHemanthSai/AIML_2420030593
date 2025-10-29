@echo off
REM Script to run Flask backend with SMTP email configuration
REM Edit the values below with your email credentials

set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=your-email@gmail.com
set SMTP_PASSWORD=your-app-password-here
set FROM_EMAIL=your-email@gmail.com

echo Starting Flask backend with email configuration...
echo Make sure you've updated the SMTP credentials in this file!

python app.py

