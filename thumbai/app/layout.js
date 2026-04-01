import "./globals.css";

export const metadata = {
  title: "ThumbAI — Multi-Agent Thumbnail Generator",
  description: "Generate YouTube thumbnail copy and styles with AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
