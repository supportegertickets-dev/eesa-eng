import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'EESA - Egerton Engineering Student Association',
  description: 'Official website and portal for the Egerton Engineering Student Association. Join us in building the future of engineering.',
  keywords: 'Egerton University, Engineering, Student Association, EESA, Kenya',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-gray-50">
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { background: '#333', color: '#fff' },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
