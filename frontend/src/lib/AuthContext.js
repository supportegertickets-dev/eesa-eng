'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { getProfile } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('eesa_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const userData = await getProfile();
      setUser(userData);
    } catch {
      localStorage.removeItem('eesa_token');
    } finally {
      setLoading(false);
    }
  };

  const loginUser = (userData) => {
    localStorage.setItem('eesa_token', userData.token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('eesa_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
