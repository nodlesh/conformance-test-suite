import { IssuerTest } from "@/components/tests/IssuerTest";

export default function IssuerPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <h1 className="text-2xl font-bold text-center mb-6">Issue A Credential</h1>
      <p className="text-gray-600 text-center max-w-2xl mx-auto mb-8">
        This process tests your issuer's ability to establish connections and issue 
        verifiable credentials.
      </p>
      
      <IssuerTest />
    </div>
  );
} 