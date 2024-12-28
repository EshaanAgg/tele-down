#!/bin/bash

# Function to check and set up the Telegram Bot API server
setup_server() {
    sudo apt-get install make git zlib1g-dev libssl-dev gperf cmake g++
    git clone --recursive https://github.com/tdlib/telegram-bot-api.git
    cd telegram-bot-api
    rm -rf build
    mkdir build
    cd build
    cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX:PATH=.. ..
    cmake --build . --target install
    cd ../..
    mkdir server
    mv telegram-bot-api/bin/telgram-bot-api server/
    # rm -rf telegram-bot-api
}

# Check if the server executable exists
if [[ ! -f "server/server" ]]; then
    echo "Server executable not found."
    setup_server
else
    echo "Server executable found."
fi

# Check for .env file
if [[ ! -f .env ]]; then
    echo ".env file not found. Please create one with TELEGRAM_API_ID and TELEGRAM_API_HASH."
    exit 1
fi

# Check for TELEGRAM_API_ID and TELEGRAM_API_HASH in the .env file
if ! grep -q "TELEGRAM_API_ID=" .env || ! grep -q "TELEGRAM_API_HASH=" .env; then
    echo "TELEGRAM_API_ID or TELEGRAM_API_HASH is missing in the .env file. Please set them."
    exit 1
fi

# Load environment variables from .env
export $(grep -v '^#' .env | xargs)

# Ensure TELEGRAM_API_ID and TELEGRAM_API_HASH are set
if [[ -z "$TELEGRAM_API_ID" || -z "$TELEGRAM_API_HASH" ]]; then
    echo "TELEGRAM_API_ID or TELEGRAM_API_HASH is not set. Please update the .env file."
    exit 1
fi

echo "Starting the server..."
./server/server --local
