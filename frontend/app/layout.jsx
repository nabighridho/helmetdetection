import "./globals.css";

export const metadata = {
  title: "Helmet Detection",
  description: "Deteksi pelanggaran helm pada pengendara sepeda motor — Pengolahan Citra Digital, Kelompok 3",
  appleWebApp: { capable: true, title: "Helmet Detection", statusBarStyle: "black-translucent" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#15171C",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Public+Sans:wght@400;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
