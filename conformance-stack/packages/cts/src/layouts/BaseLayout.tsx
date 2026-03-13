import "@/app/globals.css"; // Adjust the path to your global CSS file
import BaseHeader from "@/components/BaseHeader";

export default function BaseLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <div className="p-10">
        <BaseHeader />
      </div>
      {children}
    </div>
  );
}
