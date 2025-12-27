#!/bin/bash

# Claude Code Hub - Development Runner
# Starts both backend and frontend servers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Track PIDs
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"

    # Kill backend
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null
        wait "$BACKEND_PID" 2>/dev/null
    fi

    # Kill frontend
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null
        wait "$FRONTEND_PID" 2>/dev/null
    fi

    # Make sure nothing is left on the ports
    lsof -ti:8000 | xargs -r kill -9 2>/dev/null
    lsof -ti:5173 | xargs -r kill -9 2>/dev/null

    echo -e "${GREEN}Stopped.${NC}"
    exit 0
}

# Set trap BEFORE starting processes
trap cleanup EXIT INT TERM HUP

echo -e "${GREEN}Starting Claude Code Hub...${NC}"

# Check for required tools
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is required but not installed.${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is required but not installed.${NC}"
    exit 1
fi

if ! command -v claude &> /dev/null; then
    echo -e "${YELLOW}Warning: 'claude' CLI not found. Terminal sessions will fail.${NC}"
fi

# Kill any existing processes on our ports
echo "Checking for existing processes..."
lsof -ti:8000 | xargs -r kill -9 2>/dev/null
lsof -ti:5173 | xargs -r kill -9 2>/dev/null
sleep 0.5

# Start backend
echo -e "${GREEN}Starting backend...${NC}"
cd "$SCRIPT_DIR/backend"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -e .

uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 1

# Start frontend
echo -e "${GREEN}Starting frontend...${NC}"
cd "$SCRIPT_DIR/frontend"

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

npm run dev &
FRONTEND_PID=$!

echo -e "${GREEN}Claude Code Hub is running!${NC}"
echo -e "  Backend:  http://127.0.0.1:8000"
echo -e "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop."

# Wait for both processes
wait
