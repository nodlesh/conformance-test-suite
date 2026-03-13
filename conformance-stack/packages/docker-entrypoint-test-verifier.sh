#!/bin/bash

# docker-entrypoint-test-verifier.sh
# Entrypoint script for the test-verifier service

set -e

echo "🐳 Starting CTS Test Verifier Service"
echo "═══════════════════════════════════════"

# Environment variables with defaults
SERVER_HOST=${SERVER_HOST:-server}
SERVER_PORT=${SERVER_PORT:-5005}
VERIFIER_PORT=${VERIFIER_PORT:-5008}
TEST_SCRIPT=${TEST_SCRIPT:-test-verifier}
VERIFIER_ENDPOINT_PREFIX=${VERIFIER_ENDPOINT_PREFIX:-test-verifier}
SERVICE_ENDPOINT=${SERVICE_ENDPOINT:-$VERIFIER_ENDPOINT_PREFIX}

echo "📋 Configuration:"
echo "   • Server Host: $SERVER_HOST"
echo "   • Server Port: $SERVER_PORT"
echo "   • Verifier Port: $VERIFIER_PORT"
echo "   • Test Script: $TEST_SCRIPT"
echo "   • Verifier Endpoint Prefix: $VERIFIER_ENDPOINT_PREFIX"
echo "   • Service Endpoint: $SERVICE_ENDPOINT"
echo "   • Node Environment: $NODE_ENV"
echo "   • No Timeout: Tests will run indefinitely until completion"
echo ""

# Function to check if server is ready
wait_for_server() {
    echo "⏳ Waiting for CTS server to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z "$SERVER_HOST" "$SERVER_PORT"; then
            echo "✅ CTS server is ready at $SERVER_HOST:$SERVER_PORT"
            return 0
        fi
        
        echo "   🔄 Attempt $attempt/$max_attempts - Server not ready, waiting 10s..."
        sleep 10
        attempt=$((attempt + 1))
    done
    
    echo "❌ Timeout: CTS server not ready after $((max_attempts * 10)) seconds"
    exit 1
}

# Function to check server health endpoint
check_server_health() {
    echo "🏥 Checking server health endpoint..."
    
    if curl -f "http://$SERVER_HOST:$SERVER_PORT/api/health" > /dev/null 2>&1; then
        echo "✅ Server health check passed"
        return 0
    else
        echo "❌ Server health check failed"
        return 1
    fi
}

# Function to run the specified test script
run_test_script() {
    echo "🧪 Starting Test Script: $TEST_SCRIPT"
    echo "═══════════════════════════════════════"
    
    cd packages/cts
    
    # Set environment variables for the test
    export VERIFIER_AGENT_PORT=$VERIFIER_PORT
    export CTS_SERVER_URL="http://$SERVER_HOST:$SERVER_PORT"
    export VERIFIER_ENDPOINT_PREFIX=$VERIFIER_ENDPOINT_PREFIX
    export SERVICE_ENDPOINT=$SERVICE_ENDPOINT
    
    # Validate test script exists
    if ! npm run | grep -q "$TEST_SCRIPT"; then
        echo "❌ Test script '$TEST_SCRIPT' not found in package.json"
        echo "📋 Available scripts:"
        npm run | grep "test-" || echo "   No test scripts found"
        return 1
    fi
    
    echo "🚀 Running test script: npm run $TEST_SCRIPT"
    echo "   • Working directory: $(pwd)"
    echo "   • Script: $TEST_SCRIPT"
    echo "   • Service Endpoint: $SERVICE_ENDPOINT"
    echo "   • No Timeout: Will run until completion or manual termination"
    echo ""
    
    # Run the test script without timeout and with enhanced logging
    npm run "$TEST_SCRIPT" 2>&1 | tee "/app/logs/${TEST_SCRIPT}.log"
    
    local exit_code=${PIPESTATUS[0]}
    
    if [ $exit_code -eq 0 ]; then
        echo ""
        echo "✅ Test '$TEST_SCRIPT' completed successfully!"
        echo "═══════════════════════════════════════"
    else
        echo ""
        echo "❌ Test '$TEST_SCRIPT' failed with exit code: $exit_code"
        echo "═══════════════════════════════════════"
        echo "📝 Check logs at /app/logs/${TEST_SCRIPT}.log for details"
    fi
    
    return $exit_code
}

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🧹 Cleaning up Test Verifier service..."
    echo "   • Shutting down gracefully"
    exit 0
}

# Set up signal handlers for graceful shutdown
trap cleanup SIGTERM SIGINT

# Main execution flow
main() {
    echo "🔧 Initializing Test Verifier service..."
    
    # Create logs directory
    mkdir -p /app/logs /app/data/test-wallets
    
    # Wait for the main CTS server to be ready
    wait_for_server
    
    # Additional health check
    sleep 5  # Give server a moment to fully initialize
    if ! check_server_health; then
        echo "⚠️  Server health check failed, but proceeding with test..."
    fi
    
    echo ""
    echo "🎯 Server is ready, starting test execution..."
    echo ""
    
    # Run the specified test script
    if run_test_script; then
        echo "🎉 Test service completed successfully"
        exit 0
    else
        echo "💥 Test service failed"
        exit 1
    fi
}

# Execute main function
main "$@"
