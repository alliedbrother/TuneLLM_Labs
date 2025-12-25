#!/bin/bash

# TuneLLM Development Runner
# This script runs individual services for development

set -e

SERVICE=$1

show_help() {
    echo "TuneLLM Development Runner"
    echo ""
    echo "Usage: ./scripts/dev.sh <service>"
    echo ""
    echo "Services:"
    echo "  backend     - Run FastAPI backend"
    echo "  frontend    - Run React frontend"
    echo "  agent       - Run node agent"
    echo "  db          - Run PostgreSQL database"
    echo "  all         - Run all services with docker-compose"
    echo ""
}

run_backend() {
    echo "Starting backend..."
    cd backend
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
}

run_frontend() {
    echo "Starting frontend..."
    cd frontend
    npm run dev
}

run_agent() {
    echo "Starting agent..."
    cd agent
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    python -m agent.main
}

run_db() {
    echo "Starting PostgreSQL..."
    docker run --rm \
        --name tunellm-postgres \
        -e POSTGRES_USER=tunellm \
        -e POSTGRES_PASSWORD=tunellm \
        -e POSTGRES_DB=tunellm \
        -p 5432:5432 \
        postgres:15
}

run_all() {
    echo "Starting all services..."
    docker compose -f docker/docker-compose.yml up --build
}

case $SERVICE in
    backend)
        run_backend
        ;;
    frontend)
        run_frontend
        ;;
    agent)
        run_agent
        ;;
    db)
        run_db
        ;;
    all)
        run_all
        ;;
    *)
        show_help
        ;;
esac
