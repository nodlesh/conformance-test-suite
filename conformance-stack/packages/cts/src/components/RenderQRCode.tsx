import React from "react";
import { QRCodeCanvas } from "qrcode.react";

interface RenderQRCodeProps {
    value: string;
    size?: number;
    bgColor?: string;
    fgColor?: string;
    level?: "L" | "M" | "Q" | "H";
}

const RenderQRCode: React.FC<RenderQRCodeProps> = ({
    value,
    size = 128,
    bgColor = "#ffffff",
    fgColor = "#000000",
    level = "M",
}) => {
    return (
        <div className="p-4">
            <div className="flex justify-center items-center p-4">
                <QRCodeCanvas
                    value={value}
                    size={size}
                    bgColor={bgColor}
                    fgColor={fgColor}
                    level={level}
                />
            </div>
            <div className="mt-4 text-center">
                <p className="text-sm font-medium text-gray-700 mb-2">Connection URL:</p>
                <a 
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 break-all font-mono bg-gray-50 p-2 rounded border border-gray-200 block"
                >
                    {value}
                </a>
            </div>
        </div>
    );
};

export default RenderQRCode;
