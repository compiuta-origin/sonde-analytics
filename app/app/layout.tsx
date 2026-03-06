import AuthProvider from '@/components/auth-provider';
import Navbar from '@/components/navbar';
import { ToastProvider } from '@/components/providers/toast-provider';
import WelcomeTour from '@/components/welcome-tour/welcome-tour';
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
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ENV__ = ${JSON.stringify({
              SUPABASE_PUBLIC_URL: process.env.SUPABASE_PUBLIC_URL ?? '',
              SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
              STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
              TERMS_URL: process.env.TERMS_URL ?? '',
            })};`,
          }}
        />
      </head>
      <body
        className={`${inter.className} bg-background text-foreground min-h-screen`}
      >
        <AuthProvider>
          <ToastProvider>
            <WelcomeTour />
            <Navbar />
            <main className="container mx-auto px-4 py-8">{children}</main>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
