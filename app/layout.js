import './globals.css';

export const metadata = {
  title: 'Mock Interview Room | Analytica',
  description: 'AI mock interviews that run on your own laptop.'
};

export default function RootLayout({ children }){
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;1,9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="wrap">{children}</div>
        <div className="goldbar" />
      </body>
    </html>
  );
}
