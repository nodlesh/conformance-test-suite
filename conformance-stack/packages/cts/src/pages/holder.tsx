import { HolderTest } from "@/components/tests/HolderTest";

export default function HolderTestPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <h1 className="text-2xl font-bold text-center mb-6">Holder Wallet Conformance Check</h1>
      <p className="text-gray-600 text-center max-w-2xl mx-auto mb-8">
        This process tests your wallet's ability to establish connections, receive credentials, 
        and provide verifiable presentations.
      </p>
      <HolderTest />
    </div>
  );
}
