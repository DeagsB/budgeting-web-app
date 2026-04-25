import type { Metadata, Viewport } from 'next'
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegistrar } from '@/components/pwa/sw-registrar'
import { IOSInstallHint } from '@/components/pwa/ios-install-hint'

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800'],
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: '400',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'Maple',
  description: 'Multi-member household budgeting with Canadian tax-advantaged accounts.',
  applicationName: 'Maple',
  appleWebApp: {
    capable: true,
    title: 'Maple',
    // black-translucent lets our cream/dark backgrounds bleed under the
    // iOS status bar instead of getting a solid bar of system chrome.
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F1E7' },
    { media: '(prefers-color-scheme: dark)', color: '#181410' },
  ],
}

// Tiny script runs before hydration to sync the `dark` class on <html> with
// the user's OS preference. Avoids a one-frame flash of wrong theme. When we
// add a manual toggle, it'll read from localStorage here too.
const themeBootstrap = `
(function(){
  try {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interTight.variable} ${instrumentSerif.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistrar />
        <IOSInstallHint />
      </body>
    </html>
  )
}
