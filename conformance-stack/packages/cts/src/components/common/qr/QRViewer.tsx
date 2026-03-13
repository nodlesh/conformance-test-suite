import React from "react";
import { QRCodeSVG } from "qrcode.react";

interface QRCodeViewerProps {
  value: string; // The value or URL to encode in the QR code
  size?: number; // Optional size for the QR code
  bgColor?: string; // Optional background color
  fgColor?: string; // Optional foreground color
  message?: string;
}

const QRCodeViewer: React.FC<QRCodeViewerProps> = ({
  value,
  size = 512,
  bgColor = "#ffffff",
  fgColor = "#000000",
  message = "",
}) => {
  if (!value) return null;

  return (
    <div className="m-5 max-w-3xl p-4 inline-flex flex-col items-center bg-gray-800 rounded-lg">
      <div className="border-4 border-white p-5 bg-white border border-black">
        <QRCodeSVG
          value={value}
          size={size}
          bgColor={bgColor}
          fgColor={fgColor}
        />
      </div>
      <p className="mt-2 text-white w-full break-words text-left">
        {message && <span>{message}: </span>}
        {value}
      </p>
    </div>
  );
};

export default QRCodeViewer;
