#!/bin/bash

# ReviewMind Complete Setup & Deployment Script
# Automates installation and startup of all system components

echo "======================================"
echo "ReviewMind System Setup & Start"
echo "======================================"
echo ""

# Function to check if port is in use
check_port() {
    netstat -ano | findstr ":$1 " > nul
    return $?
}

# Function to start service in new terminal
start_service() {
    local service_name=$1
    local service_path=$2
    local start_command=$3
    
    echo "Starting $service_name..."
    start "" "cmd /k cd $service_path && $start_command"
    echo "✓ $service_name terminal opened"
}

# ============================================
# STEP 1: BACKEND SETUP
# ============================================
echo ""
echo "STEP 1: Installing Backend Dependencies..."
echo "==========================================="
cd D:\ReviewMind\backend

if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
    if [ $? -eq 0 ]; then
        echo "✓ Backend dependencies installed"
    else
        echo "✗ Backend installation failed"
        exit 1
    fi
else
    echo "✓ Backend packages already installed"
fi

# Check for pdfkit
npm list pdfkit > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Installing pdfkit..."
    npm install pdfkit
fi

echo ""

# ============================================
# STEP 2: FRONTEND SETUP
# ============================================
echo ""
echo "STEP 2: Installing Frontend Dependencies..."
echo "============================================"
cd D:\ReviewMind\frontend

if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
    if [ $? -eq 0 ]; then
        echo "✓ Frontend dependencies installed"
    else
        echo "✗ Frontend installation failed"
        exit 1
    fi
else
    echo "✓ Frontend packages already installed"
fi

echo ""

# ============================================
# STEP 3: UPDATE APP.JSX
# ============================================
echo ""
echo "STEP 3: Updating Frontend Components..."
echo "======================================"

# Copy enhanced app
if [ -f "src/App.enhanced.jsx" ]; then
    echo "Backing up current App.jsx..."
    cp src/App.jsx src/App.jsx.backup.$(date +%s)
    
    echo "Deploying enhanced App.jsx..."
    cp src/App.enhanced.jsx src/App.jsx
    
    if [ -f "src/App.jsx" ]; then
        echo "✓ App.jsx updated with interactive features"
    else
        echo "✗ Failed to update App.jsx"
    fi
else
    echo "⚠ App.enhanced.jsx not found - please update manually"
fi

echo ""

# ============================================
# STEP 4: START SERVICES
# ============================================
echo ""
echo "STEP 4: Starting System Services..."
echo "===================================="
echo ""
echo "Starting services in separate terminals..."
echo "This will open 3 new terminal windows:"
echo "  1. Python ML Service (Port 8000)"
echo "  2. Node.js Backend (Port 3000)"
echo "  3. Frontend Vite Dev Server (Port 5173)"
echo ""

# Start Python ML Service
echo "Opening Python ML Service terminal..."
start "" "cmd /k cd D:\ReviewMind\ml_service && uvicorn main:app --reload --port 8000"
sleep 2

# Start Node Backend
echo "Opening Node.js Backend terminal..."
start "" "cmd /k cd D:\ReviewMind\backend && node server.js"
sleep 2

# Start Frontend
echo "Opening Frontend Dev Server terminal..."
start "" "cmd /k cd D:\ReviewMind\frontend && npm run dev"

echo ""
echo "======================================"
echo "✓ All Services Started!"
echo "======================================"
echo ""
echo "EXPECTED OUTPUTS:"
echo ""
echo "Python ML Service (Port 8000):"
echo "  INFO:     Uvicorn running on http://127.0.0.1:8000"
echo ""
echo "Node Backend (Port 3000):"
echo "  🚀 ReviewMind Gateway running on http://localhost:3000"
echo ""
echo "Frontend (Port 5173):"
echo "  ➜  Local:   http://localhost:5173/"
echo ""
echo "======================================"
echo "System Ready for Use!"
echo "======================================"
echo ""
echo "NEXT STEPS:"
echo "1. Wait for all terminals to fully initialize (30-60 seconds)"
echo "2. Open http://localhost:5173 in your browser"
echo "3. Upload a CSV file with review data"
echo "4. Try the chat, blockchain verification, and PDF download features"
echo ""
echo "Troubleshooting:"
echo "- If Python service fails: Check ml_service/main.py imports"
echo "- If Backend fails: Ensure Node.js is installed"
echo "- If Frontend fails: Check Node.js version (14+)"
echo ""
