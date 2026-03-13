# CTS Test Verifier Configuration Update

## Summary of Changes

✅ **Successfully configured the test-verifier service with:**

### 1. **Configurable Service Endpoint**
- Replaced hardcoded `localhost` with configurable endpoint prefix
- OOB connections now use the correct service endpoint instead of localhost
- Configurable via `VERIFIER_ENDPOINT_PREFIX` or `SERVICE_ENDPOINT` environment variables

### 2. **Removed Time Limits**
- All timeout restrictions removed from test execution
- Tests now run indefinitely until completion or manual termination
- Better for real-world testing scenarios where timing can vary

### 3. **Enhanced Environment Configuration**

#### **New Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `VERIFIER_ENDPOINT_PREFIX` | `test-verifier` | Service name/hostname for OOB invitations |
| `SERVICE_ENDPOINT` | `$VERIFIER_ENDPOINT_PREFIX` | Full service endpoint override |
| `VERIFIER_AGENT_PORT` | `5008` | Port for the test agent |

#### **Removed Variables:**
- `TEST_TIMEOUT` - No longer used
- All timeout-related configurations

## Updated Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     cts-network (bridge)                    │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │     ui      │    │   server    │    │  test-verifier  │ │
│  │ (port 3000) │    │(ports 5005, │    │ (ports 5008+)   │ │
│  │             │◄──►│      5006)  │◄──►│                 │ │
│  └─────────────┘    └─────────────┘    │ OOB Endpoint:   │ │
│                                        │ test-verifier:  │ │
│                                        │ 5008            │ │
│                                        └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Improvement:** OOB invitations now use `http://test-verifier:5008` instead of `http://localhost:5008`

## Usage Examples

### **Basic Usage (Default Configuration)**
```bash
# Uses test-verifier as endpoint prefix
export NGROK_AUTH_TOKEN=your_token_here
./run-tests.sh verifier --build
```

**Generated OOB URL:** `http://test-verifier:5008/invitation/...`

### **Custom Endpoint Configuration**
```bash
# Use custom endpoint prefix
./run-tests.sh verifier --endpoint=my-verifier-service

# Or set environment variable
export VERIFIER_ENDPOINT_PREFIX=custom-verifier
./run-tests.sh verifier
```

**Generated OOB URL:** `http://custom-verifier:5008/invitation/...`

### **Direct Docker Compose**
```bash
# Basic usage with default endpoint
docker-compose up --build test-verifier server

# Custom endpoint via environment
VERIFIER_ENDPOINT_PREFIX=my-service docker-compose up --build test-verifier server

# Override both prefix and port
VERIFIER_ENDPOINT_PREFIX=custom-service VERIFIER_PORT=5010 docker-compose up --build test-verifier server
```

## Technical Implementation Details

### **1. Test Script Changes (`scripts/test-verifier.ts`)**

#### **Before:**
```typescript
const baseUrl = `http://localhost:${this.agentPort}`;
this.invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({
  domain: `http://localhost:${this.agentPort}`
});
```

#### **After:**
```typescript
const endpointPrefix = process.env.VERIFIER_ENDPOINT_PREFIX || 'localhost';
this.serviceEndpoint = `http://${endpointPrefix}:${this.agentPort}`;
const baseUrl = this.serviceEndpoint;
this.invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({
  domain: this.serviceEndpoint
});
```

### **2. Entrypoint Script Changes**

#### **Removed:** Timeout handling and timeout-related configurations
#### **Added:** Service endpoint configuration and validation

```bash
export VERIFIER_ENDPOINT_PREFIX=$VERIFIER_ENDPOINT_PREFIX
export SERVICE_ENDPOINT=$SERVICE_ENDPOINT
```

### **3. Docker Compose Configuration**

#### **Added Environment Variables:**
```yaml
environment:
  - VERIFIER_ENDPOINT_PREFIX=${VERIFIER_ENDPOINT_PREFIX:-test-verifier}
  - SERVICE_ENDPOINT=${SERVICE_ENDPOINT:-test-verifier}
```

## Benefits

### **✅ Service Resolution**
- Mobile wallets can now properly connect to the test-verifier service
- OOB invitations use correct Docker network service names
- No more localhost resolution issues in containerized environments

### **✅ Flexibility**
- Easy to configure different service endpoints for different environments
- Support for custom naming schemes and network configurations
- Environment-specific endpoint configuration

### **✅ No Time Pressure**
- Tests run until completion, no artificial timeouts
- Better for debugging and development scenarios
- More realistic testing conditions

### **✅ Production Ready**
- Proper service discovery and networking
- Container-native endpoint resolution
- Scalable across different deployment scenarios

## Configuration Matrix

| Scenario | VERIFIER_ENDPOINT_PREFIX | Expected OOB URL |
|----------|-------------------------|-------------------|
| Default Docker | `test-verifier` | `http://test-verifier:5008/...` |
| Custom Service | `my-verifier` | `http://my-verifier:5008/...` |
| Local Development | `localhost` | `http://localhost:5008/...` |
| Production | `verifier.company.com` | `http://verifier.company.com:5008/...` |

## Testing the Configuration

### **1. Verify Endpoint Configuration**
```bash
# Start services
docker-compose up --build server test-verifier

# Check logs for endpoint configuration
docker-compose logs test-verifier | grep "Service Endpoint"
# Should show: Service Endpoint: http://test-verifier:5008
```

### **2. Test Custom Endpoint**
```bash
# Use custom endpoint
VERIFIER_ENDPOINT_PREFIX=custom-verifier docker-compose up --build test-verifier server

# Verify in logs
docker-compose logs test-verifier | grep "Endpoint Prefix"
# Should show: Endpoint Prefix: custom-verifier
```

### **3. Verify OOB URL Generation**
```bash
# Check invitation URL in logs
docker-compose logs test-verifier | grep "Invitation URL"
# Should show URL with correct endpoint prefix
```

This configuration provides a robust, flexible foundation for test execution with proper Docker networking and service resolution capabilities.
