"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SOCKET_SERVER_URL } from "../utils/env";

export default function HomePage() {
  const [cardFormat, setCardFormat] = useState<"anoncreds" | "w3c">("w3c");

  useEffect(() => {
    const stored = window?.localStorage?.getItem("ayra.cardFormat");
    const initial = stored === "anoncreds" || stored === "w3c" ? stored : "w3c";
    setCardFormat(initial);
    window?.localStorage?.setItem("ayra.cardFormat", initial);
    // Attempt to inform the backend
    fetch(`${SOCKET_SERVER_URL}/api/card-format`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: initial }),
    }).catch(() => {});
  }, []);

  const handleFormatChange = async (next: "anoncreds" | "w3c") => {
    setCardFormat(next);
    window?.localStorage?.setItem("ayra.cardFormat", next);
    try {
      await fetch(`${SOCKET_SERVER_URL}/api/card-format`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: next }),
      });
    } catch (e) {
      // ignore; UI state is still updated
    }
  };

  const tests = [
    {
      id: "trust-registry",
      title: "Trust Registry Conformance",
      description:
        "Test if your ecocsystem and Trust Registry meets the required conformance standards.",
      path: "/registry",
    },
    {
      id: "holder",
      title: "Holder Conformance",
      description:
        "Test if a Holder Wallet implements the necessary capabilities for credential handling.",
      path: "/holder",
    },
    {
      id: "verifier",
      title: "Verifier Conformance",
      description:
        "Test if a Verifier properly implements presentation request and verification capabilities.",
      path: "/verifier",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-2">
          Ayra Conformance Test Suite
        </h1>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12">
          A comprehensive suite of tests to verify conformance with Ayra Trust
          Registry and SSI standards.
        </p>

        <div className="max-w-3xl mx-auto mb-10 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ayra Card format for tests</p>
              <p className="text-lg font-semibold text-gray-900">
                {cardFormat === "anoncreds" ? "AnonCreds (legacy)" : "W3C LDP (ACA-Py VC-API)"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                This choice applies to issuer/holder flows. W3C requires ACA-Py and the inline context.
              </p>
            </div>
            <select
              value={cardFormat}
              onChange={(e) =>
                handleFormatChange(e.target.value === "w3c" ? "w3c" : "anoncreds")
              }
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="anoncreds">AnonCreds</option>
              <option value="w3c">W3C (LDP VC)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tests.map((test) => (
            <Link
              key={test.id}
              href={test.path}
              className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition duration-300"
            >
              <h2 className="text-xl font-bold mb-2">{test.title}</h2>
              <p className="text-gray-600 mb-4">{test.description}</p>
              <div className="text-blue-500 font-medium">Run Test →</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
