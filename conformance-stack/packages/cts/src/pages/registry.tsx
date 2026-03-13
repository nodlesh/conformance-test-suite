import { TrustRegistryTest } from "@/components/tests/TrustRegistryTest";

export default function TrustRegistryCheckPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <h1 className="text-2xl font-bold text-center mb-6">Trust Registry Conformance Check</h1>
      <p className="text-gray-600 text-center max-w-2xl mx-auto mb-8">
        This process verifies an Ecosystem DID and checks if it conforms to the Trust Registry requirements
        by resolving the DID, testing the API, and verifying authorization capabilities.
      </p>
      
      <TrustRegistryTest />
    </div>
  );
}
