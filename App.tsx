import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Parties from './pages/Parties';
import Bills from './pages/Bills';
import Sales from './pages/Sales';
import Stock from './pages/Stock';
import Masters from './pages/Masters';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Purchases from './pages/Purchases';
import AdditionalCharges from './pages/AdditionalCharges';
import Cashbook from './pages/Cashbook';
import Payments from './pages/Payments';
import Auth from './pages/Auth';
import Companies from './pages/Companies';
import UserActivity from './pages/UserActivity';
import DeliveryChallans from './pages/DeliveryChallans';
import SplashScreen from './components/SplashScreen';
import ToastContainer from './components/ToastContainer';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import { supabase } from './lib/supabase';
import { getActiveLicense } from './lib/licenseManager';
import { processInactivity } from './utils/activityTracker';
import { initGlobalShortcutListener } from './utils/shortcutManager';

const AppContent = () => {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [isSplashExiting, setIsSplashExiting] = useState(false);
  
  const { activeCompany, loading: companyLoading } = useCompany();

  useEffect(() => {
    initGlobalShortcutListener();

    const splashTimer = setTimeout(() => {
      setIsSplashExiting(true);
      setTimeout(() => setShowSplash(false), 700);
    }, 2000);

    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const currentSession = data?.session || null;
        setSession(currentSession);
      } catch (e: any) {
        console.error("Auth init unexpected error:", e);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, newSession: any) => {
      setSession(newSession);
    });

    const inactivityInterval = setInterval(() => {
      processInactivity();
    }, 60000);

    return () => {
      clearTimeout(splashTimer);
      subscription.unsubscribe();
      clearInterval(inactivityInterval);
    };
  }, []);

  if (showSplash) return <SplashScreen isExiting={isSplashExiting} />;

  if (authLoading || companyLoading) return (
    <div className="h-screen w-screen flex items-center justify-center bg-white">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );

  // Authenticated means active license session is present
  const authenticated = !!session || !!getActiveLicense();

  return (
    <div className="animate-in fade-in duration-500">
      <Routes>
        {/* License Verification Route */}
        <Route path="/auth" element={authenticated ? <Navigate to="/companies" replace /> : <Auth />} />
        <Route path="/setup" element={<Navigate to="/auth" replace />} />
        <Route path="/license" element={<Navigate to="/auth" replace />} />
        
        {/* Workspaces (Companies) Selection Screen */}
        <Route path="/companies" element={authenticated ? <Companies /> : <Navigate to="/auth" replace />} />
        
        {/* Workspace Active Dashboard & Features */}
        <Route 
          path="/" 
          element={
            authenticated ? (
              activeCompany ? <Layout /> : <Navigate to="/companies" replace />
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="masters" element={<Masters />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="bills" element={<Bills />} />
          <Route path="payments" element={<Navigate to="/receive-payment" replace />} />
          <Route path="receive-payment" element={<Payments typeFilter="Receipt" />} />
          <Route path="make-payment" element={<Payments typeFilter="Payment" />} />
          <Route path="sales" element={<Sales />} />
          <Route path="delivery-challan" element={<DeliveryChallans />} />
          <Route path="parties" element={<Parties />} />
          <Route path="cashbook" element={<Cashbook />} />
          <Route path="additional-charges" element={<AdditionalCharges />} />
          <Route path="stock" element={<Stock />} />
          <Route path="reports" element={<Reports />} />
          <Route path="user-activity" element={<Navigate to="/settings" replace />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </div>
  );
};

const App = () => (
  <Router>
    <CompanyProvider>
      <AppContent />
    </CompanyProvider>
  </Router>
);

export default App;
