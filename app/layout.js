import { Pacifico } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import ThemeProvider from "@/components/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const brandFont = Pacifico({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-brand",
});

export const metadata = {
  title: "Geography Game",
  description: "Click countries on the map",
};

const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={brandFont.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
