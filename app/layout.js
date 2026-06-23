import { Averia_Libre } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import ThemeProvider from "@/components/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const brandFont = Averia_Libre({
  weight: ["300", "400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-brand",
});

export const metadata = {
  title: "Worldly",
  description: "Learning geography",
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
