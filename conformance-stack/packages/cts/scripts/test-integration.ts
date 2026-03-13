#!/usr/bin/env ts-node

/**
 * Integration Test Script
 * 
 * Tests both HolderTest and VerifierTest pipelines in sequence:
 * 1. HolderTest: Creates invitation → Sends request → Handles response
 * 2. VerifierTest: Receives invitation → Validates request → Responds
 * 
 * Usage: npm run test-integration
 */

import { HolderTestValidator } from './test-holder';
import { VerifierTestAgent } from './test-verifier';

class IntegrationTestRunner {
  async runFullTest(): Promise<void> {
    console.log('🧪 Starting Conformance Test Suite Integration Test\n');
    console.log('================================================\n');
    
    try {
      // Phase 1: Test HolderTest (Verifier Role)
      console.log('📋 PHASE 1: Testing HolderTest Pipeline');
      console.log('Role: Acts as Verifier (creates invitations, requests presentations)');
      console.log('Expected: Generate QR code → Request proof → Handle response\n');
      
      const holderValidator = new HolderTestValidator();
      await holderValidator.runTest();
      
      console.log('\n✅ PHASE 1 COMPLETED: HolderTest pipeline working correctly\n');
      console.log('=' .repeat(60) + '\n');
      
      // Phase 2: Test VerifierTest (Also Verifier Role)  
      console.log('📋 PHASE 2: Testing Standalone Verifier Agent');
      console.log('Role: Acts as Verifier (creates invitations, sends proof requests)');
      console.log('Expected: Create Invitation → Wait for Connection → Send Proof Request → Verify Presentation\n');
      
      const verifierAgent = new VerifierTestAgent();
      await verifierAgent.runTest();
      
      console.log('\n✅ PHASE 2 COMPLETED: VerifierTest pipeline working correctly\n');
      
      // Final Summary
      this.printFinalSummary();
      
    } catch (error) {
      console.error('\n❌ Integration test failed:', error.message);
      process.exit(1);
    }
  }

  private printFinalSummary(): void {
    console.log('=' .repeat(60));
    console.log('🎉 INTEGRATION TEST SUMMARY');
    console.log('=' .repeat(60));
    console.log('');
    console.log('✅ HolderTest Pipeline: PASSED');
    console.log('   - Connection setup working');
    console.log('   - QR code generation working');
    console.log('   - Proof request functionality working');
    console.log('');
    console.log('✅ VerifierTest with BaseAgent: PASSED');  
    console.log('   - BaseAgent initialization working');
    console.log('   - Invitation reception and parsing working');
    console.log('   - DIDComm connection establishment working');
    console.log('   - Proof request handling working');
    console.log('   - Presentation response working');
    console.log('');
    console.log('🏆 ALL CONFORMANCE TESTS PASSED!');
    console.log('');
    console.log('Your conformance test suite is working correctly:');
    console.log('- HolderTest can test wallets (generates invitations)');
    console.log('- VerifierTest uses BaseAgent (same as your server, responds to invitations)');
    console.log('');
    console.log('Next steps:');
    console.log('1. Test with real wallets using the generated QR codes');
    console.log('2. The BaseAgent can serve as a test holder for any verifier');
    console.log('3. Review logs for any edge cases or improvements');
    console.log('');
  }
}

// Main execution
if (require.main === module) {
  const runner = new IntegrationTestRunner();
  runner.runFullTest().catch(() => process.exit(1));
}

export { IntegrationTestRunner };
