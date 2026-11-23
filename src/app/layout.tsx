export const metadata = {
  title: 'Vitalora API',
  icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>{children}</body></html>);
}
