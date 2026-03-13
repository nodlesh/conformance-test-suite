import { VerifierTest } from "@/components/tests/VerifierTest";

export default function VerifierTestPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <h1 className="text-2xl font-bold text-center mb-6">Verifier Conformance Check</h1>
      <p className="text-gray-600 text-center max-w-2xl mx-auto mb-8">
        This process tests your verifier's ability to establish connections, request presentations,
        and verify credential presentations from holders.
      </p>
      
      <VerifierTest />
    </div>
  );
}
