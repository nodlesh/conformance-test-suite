#!/bin/bash

# run-tests.sh
# Helper script for running different CTS test configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    echo -e "${2}${1}${NC}"
}

print_usage() {
    print_color "CTS Docker Test Runner" "$BLUE"
    print_color "=====================" "$BLUE"
    echo ""
    print_color "Usage: $0 [COMMAND] [OPTIONS]" "$YELLOW"
    echo ""
    print_color "COMMANDS:" "$YELLOW"
    echo "  verifier     Run test-verifier (default)"
    echo "  holder       Run test-holder" 
    echo "  integration  Run test-integration"
    echo "  all          Run all tests in parallel"
    echo "  up           Start server and UI only"
    echo "  down         Stop all services"
    echo "  logs         Show logs for all services"
    echo "  clean        Clean up volumes and containers"
    echo ""
    print_color "OPTIONS:" "$YELLOW"
    echo "  --endpoint=PREFIX    Set service endpoint prefix (default: test-verifier)"
    echo "  --build              Force rebuild of containers"
    echo "  --follow             Follow logs after starting"
    echo ""
    print_color "EXAMPLES:" "$YELLOW"
    echo "  $0 verifier --build     # Build and run verifier test"
    echo "  $0 verifier --endpoint=test-verifier  # Run with custom endpoint"
    echo "  $0 up --follow          # Start server and follow logs"
    echo ""
    print_color "ENVIRONMENT:" "$YELLOW"
    echo "  NGROK_AUTH_TOKEN=your_token_here  # Required for external connectivity"
    echo ""
}

# Parse command line arguments
COMMAND=${1:-verifier}
shift || true

BUILD_FLAG=""
FOLLOW_LOGS=false
ENDPOINT_PREFIX=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            BUILD_FLAG="--build"
            shift
            ;;
        --follow)
            FOLLOW_LOGS=true
            shift
            ;;
        --endpoint=*)
            ENDPOINT_PREFIX="${1#*=}"
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            print_color "Unknown option: $1" "$RED"
            print_usage
            exit 1
            ;;
    esac
done

# Check required environment variables
check_env() {
    if [ -z "$NGROK_AUTH_TOKEN" ]; then
        print_color "⚠️  Warning: NGROK_AUTH_TOKEN not set" "$YELLOW"
        print_color "   Some external connectivity features may not work" "$YELLOW"
        echo ""
    fi
}

# Function to run a specific test
run_test() {
    local test_name=$1
    print_color "🚀 Running $test_name test..." "$GREEN"
    
    export TEST_SCRIPT="test-$test_name"
    if [ -n "$ENDPOINT_PREFIX" ]; then
        export VERIFIER_ENDPOINT_PREFIX="$ENDPOINT_PREFIX"
        export SERVICE_ENDPOINT="$ENDPOINT_PREFIX"
        print_color "📡 Using endpoint prefix: $ENDPOINT_PREFIX" "$BLUE"
    fi
    
    docker-compose up $BUILD_FLAG --exit-code-from test-verifier server test-verifier
}

# Function to run all tests
run_all_tests() {
    print_color "🚀 Running all tests in parallel..." "$GREEN"
    
    if [ -n "$ENDPOINT_PREFIX" ]; then
        export VERIFIER_ENDPOINT_PREFIX="$ENDPOINT_PREFIX"
        export SERVICE_ENDPOINT="$ENDPOINT_PREFIX"
        print_color "📡 Using endpoint prefix: $ENDPOINT_PREFIX" "$BLUE"
    fi
    
    # Use extended compose file with all test services
    docker-compose -f docker-compose.extended.yml --profile testing up $BUILD_FLAG \
        --exit-code-from test-integration \
        server test-verifier test-holder test-integration
}

# Function to start services only
start_services() {
    print_color "🚀 Starting CTS server and UI..." "$GREEN"
    
    docker-compose up $BUILD_FLAG server ui
}

# Function to show logs
show_logs() {
    print_color "📝 Showing logs for all services..." "$BLUE"
    docker-compose logs -f
}

# Function to clean up
cleanup() {
    print_color "🧹 Cleaning up Docker resources..." "$YELLOW"
    
    # Stop and remove containers
    docker-compose down --volumes --remove-orphans
    
    # Remove images if they exist
    docker rmi conformance-stack_server conformance-stack_ui conformance-stack_test-verifier 2>/dev/null || true
    
    print_color "✅ Cleanup completed" "$GREEN"
}

# Main execution
main() {
    check_env
    
    case $COMMAND in
        verifier)
            run_test verifier
            ;;
        holder)
            run_test holder
            ;;
        integration)
            run_test integration
            ;;
        all)
            run_all_tests
            ;;
        up)
            start_services
            if [ "$FOLLOW_LOGS" = true ]; then
                show_logs
            fi
            ;;
        down)
            print_color "🛑 Stopping all services..." "$YELLOW"
            docker-compose down
            ;;
        logs)
            show_logs
            ;;
        clean)
            cleanup
            ;;
        *)
            print_color "Unknown command: $COMMAND" "$RED"
            print_usage
            exit 1
            ;;
    esac
}

# Execute main function
main
