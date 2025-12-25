#!/bin/bash

# TuneLLM Setup Script
# This script sets up the development environment

set -e

echo "========================================"
echo "  TuneLLM Development Setup"
echo "========================================"
echo ""

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "Error: $1 is not installed"
        exit 1
    fi
}

echo "Checking prerequisites..."
check_command python3
check_command pip
check_command node
check_command npm
check_command docker

echo "All prerequisites found!"
echo ""

# Create virtual environments
echo "Setting up Python virtual environments..."

# Backend
if [ ! -d "backend/venv" ]; then
    echo "Creating backend virtual environment..."
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    deactivate
    cd ..
fi

# Agent
if [ ! -d "agent/venv" ]; then
    echo "Creating agent virtual environment..."
    cd agent
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    deactivate
    cd ..
fi

# Frontend
echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Copy environment file
if [ ! -f "docker/.env" ]; then
    echo "Creating environment file..."
    cp docker/.env.example docker/.env
    echo "Please edit docker/.env with your configuration"
fi

# Create storage directories
echo "Creating storage directories..."
mkdir -p storage/datasets
mkdir -p storage/models
mkdir -p storage/logs

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Edit docker/.env with your configuration"
echo "2. Run 'make dev' to start the development environment"
echo ""
