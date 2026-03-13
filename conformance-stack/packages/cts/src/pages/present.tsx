import TaskRunner from "@/components/TaskRunner";
import { TestStep } from "@/components/BaseTask";
import RenderQRCode from "@/components/RenderQRCode";

export default function PresenterPage() {
    const presenterTitle =
        "Check If system can present Ayra Network Credential To Verifier";
    const presenterDescription =
        "This process uses DIDComm to handle a presentation request and send a compliant presentation response. Follow the steps below to complete the presentation of your Ayra Network credential.";

    const steps: TestStep[] = [
        {
            id: 101,
            name: "Initialize Connection",
            description:
                "Scan the QR code to establish a secure DIDComm connection with the wallet.",
            status: "pending",
            content: (
                <div className="flex flex-col items-center p-4 border border-gray-300 rounded">
                    <p className="mb-2 font-semibold">
                        Scan this QR code to initialize the connection:
                    </p>
                    <RenderQRCode
                        value="https://example.com/connection-invite"
                        size={180}
                    />
                </div>
            ),
        },
        {
            id: 102,
            name: "Receive Presentation Request",
            description:
                "The verifier sends a presentation request via DIDComm. Review the request details in your wallet.",
            status: "pending",
        },
        {
            id: 103,
            name: "Send Presentation Response",
            description:
                "Using DIDComm, the wallet constructs and sends a compliant presentation response to the verifier.",
            status: "pending",
        },
        {
            id: 104,
            name: "Validate Presentation Response",
            description:
                "The verifier checks the received presentation response for compliance with the credential profile.",
            status: "pending",
        },
    ];

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="w-full max-w-md mx-auto bg-white p-6 rounded-lg shadow-md mb-8">
                <label className="block text-lg font-medium text-gray-700 mb-2">
                    Enter the DID of the organization running the test:
                </label>
                <input
                    type="text"
                    placeholder="did:example:123456789"
                    className="w-full border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <TaskRunner
                name={presenterTitle}
                description={presenterDescription}
                steps={steps}
            />
        </div>
    );
}
