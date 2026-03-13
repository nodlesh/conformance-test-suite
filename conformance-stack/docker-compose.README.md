# CTS Docker Compose Setup

This directory contains Docker Compose configuration for running the Conformance Test Suite (CTS) with automated testing capabilities.

## Services

### 1. **ui** (Port 3000)
- Next.js frontend application
- Web interface for test management and monitoring

### 2. **server** (Ports 5005, 5006) 
- Main CTS server with Express.js API
- Agent services and test orchestration
- WebSocket server for real-time updates

### 3. **test-verifier** (Ports 5008-5020)
- Automated test runner service
- Runs the `test-verifier` script from package.json
- Waits for server readiness before execution
- Connected to same network for service resolution

## Network Architecture

All services are connected via a custom bridge network `cts-network`, enabling:
- Service-to-service communication using service names
- Network isolation from other Docker environments
- DNS resolution between containers

```
┌─────────────────────────────────────────────────────────────┐
│                     cts-network (bridge)                    │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │     ui      │    │   server    │    │  test-verifier  │ │
│  │ (port 3000) │    │(ports 5005, │    │ (ports 5008-    │ │
│  │             │    │      5006)  │    │        5020)    │ │
│  └─────────────┘    └─────────────┘    └─────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Quick Start
```bash
# Start all services
export NGROK_AUTH_TOKEN=your_token_here
docker-compose up --build

# Start specific services
docker-compose up server test-verifier --build

# View logs
docker-compose logs -f test-verifier
```

### Environment Variables

Required:
```bash
NGROK_AUTH_TOKEN=your_ngrok_token_here
```

Optional:
```bash
USE_NGROK=true                    # Enable NGROK tunneling
NODE_ENV=production               # Environment mode
SERVER_PORT=5005                  # Main server port
AGENT_PORT=5006                   # Agent service port
VERIFIER_PORT=5008               # Test verifier port
```

### Test Execution Flow

1. **Server Startup**: Main CTS server initializes and starts health checks
2. **Health Monitoring**: test-verifier waits for server health endpoint
3. **Test Execution**: Automated test-verifier script runs
4. **Network Communication**: Services communicate via service names
5. **Result Collection**: Test results logged and available in volumes

### Service Dependencies

The test-verifier service includes:
- **Health Check Dependency**: Waits for server health endpoint
- **Network Connectivity**: Can resolve `server:5005` internally
- **Graceful Startup**: 30-attempt health check with 10s intervals
- **Enhanced Logging**: Comprehensive execution logs

### Volumes

- `wallet_data`: Main server wallet storage
- `logs_data`: Main server logs
- `test_wallet_data`: Test verifier wallet storage  
- `test_logs`: Test execution logs

### Testing Network Connectivity

```bash
# Enter test-verifier container
docker-compose exec test-verifier bash

# Test server connectivity
curl http://server:5005/api/health

# Check DNS resolution
nslookup server
```

### Customization

To run different test scripts, modify the entrypoint in `docker-entrypoint-test-verifier.sh`:

```bash
# Change from test-verifier to test-holder
npm run test-holder

# Or test-integration
npm run test-integration
```

### Troubleshooting

**Service Resolution Issues:**
```bash
# Check network
docker network ls
docker network inspect conformance-stack_cts-network

# Check service logs
docker-compose logs server
docker-compose logs test-verifier
```

**Port Conflicts:**
```bash
# Check port usage
netstat -tulpn | grep :5005
netstat -tulpn | grep :5008
```

**Health Check Failures:**
```bash
# Manual health check
curl http://localhost:5005/api/health

# Check server startup logs
docker-compose logs server | grep health
```
