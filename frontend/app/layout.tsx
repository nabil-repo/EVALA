import '../styles/globals.css'
import type { Metadata } from 'next'
import { Providers } from '@/components/Providers'
import { Navigation } from '@/components/Navigation'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'Evala on Sui',
  description: 'Decentralized Human Validation Engine on Sui'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <Toaster position="top-right" expand={false} richColors />
          <Navigation />
          <div className="pt-24">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  )
}
