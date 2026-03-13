# Conformance Test Scripts

This directory contains automated test scripts to validate the conformance test suite functionality.

## Available Scripts

### 🧪 Individual Tests

#### `npm run test-holder`
Tests the **HolderTest pipeline** which acts as a **verifier**:
- ✅ Creates connection invitations
- ✅ Generates QR codes  
- ✅ Sends presentation requests
- ✅ Handles responses

**Expected Flow:**
```
Setup Connection → Request Proof → Evaluate → Complete
```

#### `npm run test-verifier` 
Tests with a **real Credo agent** acting as a **holder**:
- ✅ Initializes real Credo agent with wallet
- ✅ Receives invitation URLs from verifiers
- ✅ Establishes real DIDComm connections
- ✅ Responds to actual proof requests  
- ✅ Sends credential presentations

**Expected Flow:**
```
Initialize Agent → Accept Invitation → Wait for Proof Request → Send Presentation
```

### 🔄 Integration Test

#### `npm run test-integration` or `npm run test-all`
Runs both tests in sequence to validate the complete system:
1. Tests HolderTest pipeline (verifier role)
2. Tests real Credo agent as holder 
3. Provides comprehensive summary

### 🛂 Ayra Card Schema/Context Validation

#### `npm run validate:ayra-card-context`
Validates the Ayra Card JSON Schema, JSON-LD context, and (optionally) a sample credential:
- Defaults target the files dropped from `ayracardprotocol-concept/technical/schema`: `schema/ayra-card-business-card-schema.json` and `schema/example-ayra-card.json`.
- Provide a JSON-LD context file if you have it (e.g., `schema/AyraBusinessCardV1R0.jsonld` or serve it from `public/contexts/`).
- Set `--context-url` if you want the sample `@context` array checked (for example `https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld` or your local host path).

Example:
```bash
npm run validate:ayra-card-context -- --context schema/AyraBusinessCardV1R0.jsonld --context-url https://schema.affinidi.io/AyraBusinessCardV1R0.jsonld --sample schema/example-ayra-card.json
```

## Prerequisites

1. **Server Running**: Start the server first:
   ```bash
   npm run start:server
   ```

2. **Dependencies**: Ensure all dependencies are installed:
   ```bash
   npm install
   ```

## Usage Examples

### Quick Full Test
```bash
# Start server in one terminal
npm run start:server

# Run integration test in another terminal  
npm run test-all
```

### Individual Testing
```bash
# Test only the HolderTest (verifier role)
npm run test-holder

# Test only the VerifierTest (holder role) 
npm run test-verifier
```

### Manual Testing Flow
```bash
# Terminal 1: Start server
npm run start:server

# Terminal 2: Run HolderTest to generate QR code
npm run test-holder

# Terminal 3: Use the QR code URL for VerifierTest
npm run test-verifier
# (Script will prompt for invitation URL)
```

## What Each Test Validates

### HolderTest Validation ✅
- [ ] Server connectivity
- [ ] Socket connection establishment
- [ ] Pipeline selection (HOLDER_TEST)
- [ ] Connection setup task execution
- [ ] QR code/invitation generation
- [ ] Proof request task execution
- [ ] DAG state updates
- [ ] Task completion status

### VerifierTest Validation ✅
- [ ] Real Credo agent initialization
- [ ] Wallet creation and management
- [ ] Invitation URL parsing and validation
- [ ] Connection establishment via DIDComm
- [ ] Proof request reception and processing
- [ ] Credential selection and presentation
- [ ] Agent cleanup and wallet deletion

## Expected Output

### ✅ Success Output
```
🚀 Starting HolderTest Validation...

📡 Checking server health...
✅ Server is healthy

🔌 Connecting to WebSocket...
✅ Socket connected

🧪 Testing HolderTest pipeline...

1️⃣ Selecting HOLDER_TEST pipeline...
✅ Pipeline selected successfully

2️⃣ Starting pipeline execution...
✅ Pipeline execution started

3️⃣ Waiting for invitation generation...
✅ Invitation generated successfully!

4️⃣ Waiting for pipeline completion...
✅ All tasks completed!

📊 Test Results Summary:
========================
⏱️ Total execution time: 15234ms
📨 DAG updates received: 12
🔗 Invitation generated: ✅ Yes

✅ Critical Checks:
   ✅ Socket Connection
   ✅ DAG Updates Received
   ✅ Invitation Generated
   ✅ Valid Invitation Format

✅ HolderTest validation completed successfully!
```

### ❌ Failure Output
```
❌ HolderTest validation failed: Server is not running. Please start with: npm run start:server
```

## Troubleshooting

### Common Issues

1. **Server Not Running**
   ```
   Error: ECONNREFUSED
   Solution: Start server with `npm run start:server`
   ```

2. **Socket Connection Failed**
   ```
   Error: Socket connection timeout
   Solution: Check if server is running on correct port (5005)
   ```

3. **No Invitation Generated**
   ```
   Error: Timeout: No invitation received within 30 seconds
   Solution: Check server logs for SetupConnectionTask errors
   ```

4. **Invalid Invitation URL**
   ```
   Error: Invalid invitation URL format
   Solution: Ensure URL contains 'c_i=' or 'oob=' parameter
   ```

### Debug Mode

Add environment variable for verbose logging:
```bash
DEBUG=true npm run test-holder
```

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐
│   HolderTest    │    │  VerifierTest   │
│   (Verifier)    │    │   (Holder)      │
├─────────────────┤    ├─────────────────┤
│ 1. Setup Conn   │    │ 1. Recv Invite  │
│ 2. Request Proof│◄──►│ 2. Wait Request │
│ 3. Handle Resp  │    │ 3. Send Present │
│ 4. Evaluate     │    │ 4. Evaluate     │
└─────────────────┘    └─────────────────┘
```

## Next Steps

After running these tests successfully:

1. **Test with Real Wallets**: Use the generated QR codes with actual mobile wallets
2. **Test with Real Verifiers**: Use real verifier services with the VerifierTest
3. **Add Custom Tests**: Extend scripts for specific use cases
4. **CI/CD Integration**: Include tests in your automated testing pipeline

## Contributing

To add new test scenarios:

1. Create new test files in `/scripts/`
2. Follow the existing pattern using Socket.IO and axios
3. Add new npm scripts to `package.json`
4. Update this README with new test descriptions
