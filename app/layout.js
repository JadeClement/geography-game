import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

export const metadata = {
  title: "Geography Game",
  description: "Click countries on the map",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
