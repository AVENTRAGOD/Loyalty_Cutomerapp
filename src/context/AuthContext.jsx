import { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('customerUser');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    
    // Fetch global settings
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('settings').select('*').limit(1);
      if (!error && data && data.length > 0) {
        setSettings(data[0]);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (memberCode) => {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('member_code', memberCode)
        .single();
        
      if (error || !data) {
        return { success: false, error: 'Invalid member code' };
      }
      
      setUser(data);
      localStorage.setItem('customerUser', JSON.stringify(data));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('customerUser');
  };

  return (
    <AuthContext.Provider value={{ user, settings, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
