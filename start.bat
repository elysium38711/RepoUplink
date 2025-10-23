@echo off
echo Starting GitHub RepoUplink...
echo.
echo Installing dependencies (if needed)...
pip install -r requirements.txt
echo.
echo Starting web server...
echo Open your browser to: http://127.0.0.1:5000
echo.
echo Press Ctrl+C to stop the server
echo.
python app.py
