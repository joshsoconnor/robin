import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { BottomNavBar } from './components/BottomNavBar';
import { ExploreScreen } from './components/ExploreScreen';
import { MapScreen } from './components/MapScreen';
import { CalendarScreen } from './components/CalendarScreen';
import { LoginScreen } from './components/LoginScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { Toast } from './components/Toast';
import { UploadRunScreen } from './components/UploadRunScreen';
import { ArrivalPanel } from './components/ArrivalPanel';
import { VoiceAssistantNode } from './components/VoiceAssistantNode';
import { IntelligenceFeed } from './components/IntelligenceFeed';
import { supabase } from './lib/supabase';
import { registerPlugin, Capacitor } from '@capacitor/core';

const NavigationSDK = registerPlugin<any>('NavigationSDK');

interface Stop {
  id: string;
  address: string;
  packages: number;
  status: 'pending' | 'completed';
  manifest_notes?: string;
}

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return sessionStorage.getItem('robin_active_tab') || 'explore';
  });
  const [persistedDestination, setPersistedDestination] = useState<any>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [routeStops, setRouteStops] = useState<Stop[]>(() => {
    try {
      const stored = sessionStorage.getItem('robin_route_stops');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Global nav overlay — shown when native Navigation SDK is actively running
  const [navActive, setNavActive] = useState(false);

  // Arrival panel state — shown when user arrives at destination
  const [arrivalAddress, setArrivalAddress] = useState<string | null>(null);
  // Track the address the user is currently navigating to
  const [activeNavAddress, setActiveNavAddress] = useState<string | null>(null);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [showDeliveryToast, setShowDeliveryToast] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('robin_dark_mode') === 'true';
  });

  const [isDeliveryMode, setIsDeliveryMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('robin_delivery_mode');
    return stored !== 'false';
  });

  const [vehicleProfile, setVehicleProfile] = useState<{
    vehicle_type: string;
    vehicle_height?: number;
    vehicle_weight?: number;
    vehicle_length?: number;
  } | null>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    localStorage.setItem('robin_dark_mode', String(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('robin_delivery_mode', String(isDeliveryMode));
  }, [isDeliveryMode]);

  // Guest users must never be in delivery/driver mode
  useEffect(() => {
    if (isGuest) setIsDeliveryMode(false);
  }, [isGuest]);

  useEffect(() => {
    sessionStorage.setItem('robin_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('robin_route_stops', JSON.stringify(routeStops));
  }, [routeStops]);

  // Restore nav overlay if navigation was still running when app resumed from background
  useEffect(() => {
    if (sessionStorage.getItem('nav-active') === '1') {
      setNavActive(true);
      document.body.classList.add('native-nav-active');
      document.documentElement.classList.add('native-nav-active');
    }
  }, []);

  useEffect(() => {
    const fetchProfile = async (uid: string) => {
      const { data } = await supabase.from('profiles').select('vehicle_type, vehicle_height, vehicle_weight, vehicle_length').eq('id', uid).single();
      if (data) setVehicleProfile(data as any);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setUserEmail(session?.user?.email || null);
      if (session) {
        if (isDeliveryMode && !sessionStorage.getItem('delivery_toast_shown')) {
          setShowDeliveryToast(true);
          sessionStorage.setItem('delivery_toast_shown', 'true');
        }
        fetchProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
      setUserEmail(session?.user?.email || null);
      if (event === 'SIGNED_IN') {
        setIsGuest(false);
        if (isDeliveryMode && !sessionStorage.getItem('delivery_toast_shown')) {
          setShowDeliveryToast(true);
          sessionStorage.setItem('delivery_toast_shown', 'true');
        }
        if (session) fetchProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setIsGuest(false);
        setActiveTab('explore');
        setVehicleProfile(null);
        sessionStorage.removeItem('delivery_toast_shown');
      }
    });

    return () => subscription.unsubscribe();
  }, [isDeliveryMode]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Called by ExploreScreen / MapScreen once navigation successfully starts
  const handleNavStart = useCallback((label: string, fullAddress?: string) => {
    setNavActive(true);
    setArrivalAddress(null); // Clear any previous arrival
    if (fullAddress) setActiveNavAddress(fullAddress);
    sessionStorage.setItem('nav-active', '1');
    sessionStorage.setItem('nav-label', label);
    document.body.classList.add('native-nav-active');
    document.documentElement.classList.add('native-nav-active');
  }, []);

  // Called when user taps Exit Navigation in the overlay or native FAB
  const handleNavExit = useCallback(() => {
    setNavActive(false);
    sessionStorage.removeItem('nav-active');
    sessionStorage.removeItem('nav-label');
    document.body.classList.remove('native-nav-active');
    document.documentElement.classList.remove('native-nav-active');
    if (Capacitor.isNativePlatform()) {
      NavigationSDK.hideMap().catch(console.error);
    }
  }, []);

  // Listeners for native SDK events
  useEffect(() => {
    const arrivalListener = NavigationSDK.addListener('navArrived', () => {
      // Show ArrivalPanel instead of generic alert
      // Hide the native map and restore WebView so the panel is visible
      handleNavExit();
      // Set arrival address to trigger the ArrivalPanel
      setArrivalAddress(activeNavAddress || sessionStorage.getItem('nav-label') || 'Destination');
    });

    const exitListener = NavigationSDK.addListener('navExited', () => {
      handleNavExit();
    });

    return () => {
      arrivalListener.then((l: any) => l.remove());
      exitListener.then((l: any) => l.remove());
    };
  }, [handleNavExit, activeNavAddress]);

  const handleFinalize = (stops: Stop[]) => {
    setRouteStops(stops);
    setIsNavigating(true);
    setActiveTab('route');
  };

  const handleExitNav = () => {
    setIsNavigating(false);
  };

  // ── Arrival Panel callbacks ──
  const handleReRoute = useCallback(async () => {
    if (!activeNavAddress) return;
    setArrivalAddress(null);
    try {
      // Re-initialize and start guidance to the same address
      await NavigationSDK.initialize();
      // Geocode the address to get coords
      const geocoder = new (window as any).google.maps.Geocoder();
      const result = await new Promise<any>((resolve, reject) => {
        geocoder.geocode({ address: activeNavAddress, region: 'au' }, (results: any[], status: string) => {
          if (status === 'OK' && results.length > 0) resolve(results[0]);
          else reject(new Error('Geocode failed'));
        });
      });
      const lat = result.geometry.location.lat();
      const lng = result.geometry.location.lng();
      await NavigationSDK.startGuidance({ destination: activeNavAddress, lat, lng, travelMode: 'DRIVING' });
      handleNavStart(activeNavAddress.split(',')[0], activeNavAddress);
    } catch (err) {
      console.error('Re-route failed:', err);
    }
  }, [activeNavAddress, handleNavStart]);

  const handleEndRoute = useCallback(async () => {
    // Mark current as completed if we reached it
    if (activeNavAddress) {
      const currentIdx = routeStops.findIndex(s => s.address === activeNavAddress);
      if (currentIdx >= 0) {
        const stopId = routeStops[currentIdx].id;
        setRouteStops(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'completed' as const } : s));
        if (stopId && !isGuest) {
          await supabase.from('run_stops').update({ status: 'completed' }).eq('id', stopId);
        }
      }
    }
    setArrivalAddress(null);
    setActiveNavAddress(null);
  }, [activeNavAddress, routeStops, isGuest]);

  const handleNextDelivery = useCallback(async () => {
    // Find the current stop index and advance to next pending
    const currentIdx = routeStops.findIndex(s => s.address === activeNavAddress);
    // Mark current as completed
    if (currentIdx >= 0) {
      const stopId = routeStops[currentIdx].id;
      setRouteStops(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'completed' as const } : s));
      if (stopId && !isGuest) {
        // Persist to Supabase
        await supabase.from('run_stops').update({ status: 'completed' }).eq('id', stopId);
      }
    }
    // Find next pending stop
    const nextStop = routeStops.find((s, i) => i > currentIdx && s.status === 'pending');
    if (!nextStop) {
      setArrivalAddress(null);
      setActiveNavAddress(null);
      return;
    }
    setArrivalAddress(null);
    try {
      await NavigationSDK.initialize();
      const geocoder = new (window as any).google.maps.Geocoder();
      const result = await new Promise<any>((resolve, reject) => {
        geocoder.geocode({ address: nextStop.address, region: 'au' }, (results: any[], status: string) => {
          if (status === 'OK' && results.length > 0) resolve(results[0]);
          else reject(new Error('Geocode failed'));
        });
      });
      const lat = result.geometry.location.lat();
      const lng = result.geometry.location.lng();
      await NavigationSDK.startGuidance({ destination: nextStop.address, lat, lng, travelMode: 'DRIVING' });
      setActiveNavAddress(nextStop.address);
      handleNavStart(nextStop.address.split(',')[0], nextStop.address);
    } catch (err) {
      console.error('Failed to start next delivery:', err);
    }
  }, [activeNavAddress, routeStops, handleNavStart, isGuest]);

  const renderContent = () => {
    switch (activeTab) {
      case 'explore':
        return (
          <ExploreScreen
            persistedDestination={persistedDestination}
            setPersistedDestination={setPersistedDestination}
            isDarkMode={isDarkMode}
            onNavStart={handleNavStart}
            vehicleProfile={vehicleProfile}
            routeStops={routeStops}
            userEmail={userEmail}
          />
        );
      case 'route':
        return isNavigating ? (
          <MapScreen
            stops={routeStops}
            onBack={handleExitNav}
            isDarkMode={isDarkMode}
            onNavStart={handleNavStart}
            navActive={navActive}
            vehicleProfile={vehicleProfile}
          />
        ) : (
          <UploadRunScreen isDarkMode={isDarkMode} onFinalize={handleFinalize} />
        );
      case 'intel':
        return <IntelligenceFeed userEmail={userEmail} />;
      case 'calendar':
        return <CalendarScreen isDarkMode={isDarkMode} />;
      case 'settings':
        return (
          <SettingsScreen
            isGuest={isGuest}
            userEmail={userEmail}
            isDarkMode={isDarkMode}
            setDarkMode={setIsDarkMode}
            isDeliveryMode={isDeliveryMode}
            setDeliveryMode={setIsDeliveryMode}
            handleLogout={handleLogout}
            onNavigateToLogin={() => {
              setIsGuest(false);
              setIsAuthenticated(false);
            }}
          />
        );
      default:
        return (
          <ExploreScreen
            persistedDestination={persistedDestination}
            setPersistedDestination={setPersistedDestination}
            isDarkMode={isDarkMode}
            onNavStart={handleNavStart}
            userEmail={userEmail}
            routeStops={routeStops}
          />
        );
    }
  };

  if (isAuthenticated === null) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!isAuthenticated && !isGuest) {
    return <LoginScreen onGuestLogin={() => setIsGuest(true)} />;
  }

  return (
    <div className="app-container">
      {showDeliveryToast && (
        <Toast
          headline="You are in delivery mode"
          subtext="all addresses, notes and videos will be saved to turn off, visit your settings page"
          duration={5000}
          onClose={() => setShowDeliveryToast(false)}
        />
      )}

      {/* Global Voice Assistant - Always visible for UI consistency except on Explore screen where it's integrated */}
      {activeTab !== 'explore' && <VoiceAssistantNode routeStops={routeStops} />}


      <main className="main-content" style={navActive ? { display: 'none' } : undefined}>
        {renderContent()}
      </main>

      {!isNavigating && !navActive && !arrivalAddress && (
        <BottomNavBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isGuest={isGuest}
        />
      )}

      {arrivalAddress && (() => {
        const currentIdx = routeStops.findIndex(s => s.address === activeNavAddress);
        const nextStop = routeStops.find((s, i) => i > currentIdx && s.status === 'pending');
        return (
          <ArrivalPanel
            address={arrivalAddress}
            onReRoute={handleReRoute}
            onEndRoute={handleEndRoute}
            onNextDelivery={handleNextDelivery}
            hasNextDelivery={!!nextStop}
            nextDeliveryAddress={nextStop?.address}
            userEmail={userEmail}
          />
        );
      })()}
    </div>
  );
}

export default App;
