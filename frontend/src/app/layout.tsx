import type { Metadata } from 'next'
import './globals.css'
import ClientLayout from '@/components/layout/ClientLayout'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'DataGuardian',
  description: 'DataGuardian — Enterprise Data Intelligence Platform powered by Snowflake & AI',
}

// Inline script executed before React hydrates → prevents flash of wrong theme
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('dq-theme');
    var m = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (t === 'dark' || (!t && m)) document.documentElement.classList.add('dark');
  } catch(e){}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must run synchronously before first paint to avoid theme flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <ClientLayout>{children}</ClientLayout>
        </ThemeProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}
