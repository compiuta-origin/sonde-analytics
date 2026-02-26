import AuthProvider from '@/components/auth-provider';
import Navbar from '@/components/navbar';
import { ToastProvider } from '@/components/providers/toast-provider';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'Sonde - LLM Brand Visibility Analytics',
  description: 'Track how your brand appears in AI responses',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="/_next/static/env.js"></script>
      </head>
      <body
        className={`${inter.className} bg-background text-foreground min-h-screen`}
      >
        <AuthProvider>
          <ToastProvider>
            <Navbar />
            <main className="container mx-auto px-4 py-8">{children}</main>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
