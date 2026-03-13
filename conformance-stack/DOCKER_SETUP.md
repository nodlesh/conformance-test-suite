# Docker Compose Setup for CTS Test Verifier

## Summary

I've created a complete Docker Compose setup that adds a separate `test-verifier` service to run the test scripts from the CTS package.json. The key improvements include:

### ✅ **What Was Created**

#### 1. **Updated Docker Compose Configuration** (`docker-compose.yml`)
- Added `test-verifier` service that runs separately from the main server
- All services connected via custom `cts-network` bridge network
- Service-to-service communication using service names (e.g., `server:5005`)
- Health check dependencies ensuring server is ready before tests run

#### 2. **Test Verifier Dockerfile** (`packages/Dockerfile.test-verifier`)
- Based on same Node.js 20 image as server
- Includes all necessary dependencies for running test scripts
- Custom entrypoint script for flexible test execution
- Exposed port range (5008-5020) for multiple test instances

#### 3. **Smart Entrypoint Script** (`packages/docker-entrypoint-test-verifier.sh`)
- **Configurable**: Supports any test script via `TEST_SCRIPT` environment variable
- **Resilient**: Waits for server health checks before starting tests
- **Timeout Support**: Configurable test timeouts with default 5 minutes
- **Enhanced Logging**: Comprehensive logs saved to volumes
- **Error Handling**: Graceful handling of timeouts and failures

#### 4. **Extended Configuration** (`docker-compose.extended.yml`)
- Additional services for `test-holder` and `test-integration`
- Profile-based activation for running specific test combinations
- Parallel test execution capabilities

#### 5. **Helper Script** (`run-tests.sh`)
- Simple CLI interface for running different test configurations
- Built-in help and usage examples
- Colored output for better visibility
- Environment validation and setup assistance

### ✅ **Network Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                     cts-network (bridge)                    │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │     ui      │    │   server    │    │  test-verifier  │ │
│  │ (port 3000) │    │(ports 5005, │    │ (ports 5008-    │ │
│  │             │◄──►│      5006)  │◄──►│        5020)    │ │
│  └─────────────┘    └─────────────┘    └─────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- **Service Resolution**: `test-verifier` can reach server at `http://server:5005`
- **Network Isolation**: All services isolated from other Docker networks
- **Health Dependencies**: Tests only start after server health checks pass
- **Port Management**: No port conflicts between services

### ✅ **Usage Examples**

#### **Basic Test Execution**
```bash
# Set required environment
export NGROK_AUTH_TOKEN=your_token_here

# Run test-verifier (default)
chmod +x run-tests.sh
./run-tests.sh verifier

# Run with custom timeout
./run-tests.sh verifier --timeout=600

# Run test-holder instead
TEST_SCRIPT=test-holder docker-compose up --build test-verifier server
```

#### **Advanced Configurations**
```bash
# Run all tests in parallel
./run-tests.sh all

# Start server only and follow logs
./run-tests.sh up --follow

# Clean up everything
./run-tests.sh clean
```

#### **Direct Docker Compose**
```bash
# Basic test-verifier execution
docker-compose up --build --exit-code-from test-verifier server test-verifier

# Run different test script
TEST_SCRIPT=test-integration docker-compose up --build test-verifier server

# Use extended configuration
docker-compose -f docker-compose.extended.yml --profile testing up --build
```

### ✅ **Environment Variables**

The test-verifier service supports these configurations:

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_SCRIPT` | `test-verifier` | Which npm script to run |
| `TEST_TIMEOUT` | `300` | Test timeout in seconds |
| `SERVER_HOST` | `server` | Hostname of CTS server |
| `SERVER_PORT` | `5005` | Port of CTS server |
| `VERIFIER_PORT` | `5008` | Port for test agent |

### ✅ **File Structure**

```
conformance-stack/
├── docker-compose.yml              # Main compose file
├── docker-compose.extended.yml     # Extended with all test services
├── docker-compose.README.md        # Detailed documentation
├── run-tests.sh                    # Helper script (make executable)
└── packages/
    ├── Dockerfile.test-verifier     # Test service dockerfile
    └── docker-entrypoint-test-verifier.sh  # Smart entrypoint
```

### ✅ **Key Features**

#### **1. Service Resolution**
- ✅ `test-verifier` service can resolve `server` hostname
- ✅ Both services on same `cts-network` bridge network
- ✅ Internal communication via service names

#### **2. Health Dependencies**
- ✅ `test-verifier` waits for `server` health check to pass
- ✅ 30-attempt health monitoring with 10s intervals
- ✅ Graceful failure if server doesn't start

#### **3. Flexible Test Execution**
- ✅ Any test script from package.json can be run
- ✅ Configurable timeouts prevent hanging tests
- ✅ Enhanced logging with timestamp and service info

#### **4. Production Ready**
- ✅ Separate volumes for test data and logs
- ✅ Proper signal handling for graceful shutdown
- ✅ Comprehensive error reporting and debugging

### ✅ **Next Steps**

1. **Make script executable**:
   ```bash
   chmod +x run-tests.sh
   ```

2. **Set environment variables**:
   ```bash
   export NGROK_AUTH_TOKEN=your_token_here
   ```

3. **Run your first test**:
   ```bash
   ./run-tests.sh verifier --build
   ```

4. **Monitor execution**:
   ```bash
   # In another terminal
   docker-compose logs -f test-verifier
   ```

This setup provides a robust, scalable foundation for automated testing while maintaining clear separation between the main CTS server and test execution services.
