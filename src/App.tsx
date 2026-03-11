import { useState, useEffect, useCallback, useRef } from 'react';
import { Geolocation } from '@capacitor/geolocation';
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
import { getSydneyDate } from './lib/dateUtils';

const NavigationSDK = registerPlugin<any>('NavigationSDK');

interface Stop {
  id: string;
  address: string;
  packages: number;
  status: 'pending' | 'completed';
  manifest_notes?: string;
  lat?: number;
  lng?: number;
}


function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('robin_active_tab') || 'explore';
  });
  const [persistedDestination, setPersistedDestination] = useState<any>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [routeStops, setRouteStops] = useState<Stop[]>(() => {
    try {
      const stored = localStorage.getItem('robin_route_stops');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Global nav overlay — shown when native Navigation SDK is actively running
  const [navActive, setNavActive] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);
  const [currentSpeedLimit, setCurrentSpeedLimit] = useState<number | null>(null);

  const [arrivalAddress, setArrivalAddress] = useState<string | null>(null);
  const [activeNavAddress, setActiveNavAddress] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(() => {
    return localStorage.getItem('robin_active_run_id');
  });
  const suggestedStopsRef = useRef<Set<string>>(new Set());
  const lastAnnouncedStopRef = useRef<string | null>(null);

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

  // Global Geocoding for routeStops
  useEffect(() => {
    if (!routeStops || routeStops.length === 0) return;
    const pendingGeocode = routeStops.some(s => !s.lat || !s.lng);
    if (!pendingGeocode) return;

    const resolveCoords = async () => {
      if (!(window as any).google) return;
      const geocoder = new (window as any).google.maps.Geocoder();
      const resolved = [...routeStops];
      let changed = false;

      for (let i = 0; i < resolved.length; i++) {
        const stop = resolved[i];
        if (!stop.lat || !stop.lng) {
          try {
            const result: any = await new Promise((resolve, reject) => {
              geocoder.geocode({ address: stop.address, region: 'au' }, (results: any, status: string) => {
                if (status === 'OK' && results[0]) resolve(results[0].geometry.location);
                else reject(status);
              });
            });
            resolved[i] = { ...stop, lat: result.lat(), lng: result.lng() };
            changed = true;
          } catch (e) { console.warn(`Geocoding failed for ${stop.address}`, e); }
        }
      }
      if (changed) {
        setRouteStops(resolved);
        localStorage.setItem('robin_route_stops', JSON.stringify(resolved));
      }
    };
    resolveCoords();
  }, [routeStops]);

  // Stop Spotter Logic
  useEffect(() => {
    if (!isDeliveryMode || routeStops.length === 0) return;

    let watchId: string | null = null;
    const startWatching = async () => {
      try {
        watchId = await Geolocation.watchPosition({ enableHighAccuracy: false }, (pos) => {
          if (!pos) return;
          const { latitude: lat, longitude: lng } = pos.coords;

          // Find current destination index
          const currentDestIdx = routeStops.findIndex(s => s.address === activeNavAddress);

          routeStops.forEach((stop, idx) => {
            // Logic fix: Only suggest upcoming stops (index > current destination)
            if (idx > currentDestIdx && stop.status === 'pending' && stop.lat && stop.lng) {
              const dLat = (lat - stop.lat);
              const dLng = (lng - stop.lng);
              const distSq = dLat * dLat + dLng * dLng;

              // Roughly 200m ~ 0.002 degrees -> 0.000004
              if (distSq < 0.000004 && !suggestedStopsRef.current.has(stop.address) && lastAnnouncedStopRef.current !== stop.address) {
                suggestedStopsRef.current.add(stop.address);
                lastAnnouncedStopRef.current = stop.address;

                const text = `Hey Josh, Stop ${idx + 1} is coming up on your right in about 200 meters. Do you want to deliver it now?`;
                if (Capacitor.isNativePlatform()) {
                  // Mark that Robin is asking a question so VoiceAssistant knows to listen after speakEnd
                  window.localStorage.setItem('robin_expect_response', 'true');
                  NavigationSDK.speakText({ text }).catch(console.error);
                } else {
                  console.log('STOP SPOTTER VOICE:', text);
                }
              }
            }
          });
        });
      } catch (e) { console.error('Stop Spotter watch failed', e); }
    };
    startWatching();
    return () => { if (watchId) Geolocation.clearWatch({ id: watchId }); };
  }, [isDeliveryMode, routeStops, activeNavAddress]);

  // Guest users must never be in delivery/driver mode
  useEffect(() => {
    if (isGuest) setIsDeliveryMode(false);
  }, [isGuest]);

  useEffect(() => {
    localStorage.setItem('robin_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('robin_route_stops', JSON.stringify(routeStops));
  }, [routeStops]);

  // Restore nav overlay if navigation was still running when app resumed from background
  useEffect(() => {
    if (localStorage.getItem('nav-active') === '1') {
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

    const fetchRunState = async (uid: string) => {
      // First check if there is an active run locally that is still pending
      const localStopsStr = localStorage.getItem('robin_route_stops');
      let hasLocalPendingStops = false;
      if (localStopsStr) {
        try {
          const localStops: Stop[] = JSON.parse(localStopsStr);
          hasLocalPendingStops = localStops.some(s => s.status === 'pending');
        } catch { }
      }

      // If user is logged in, we should sync our local state with the cloud state
      // This ensures if they force closed the app, they can resume their run.
      // We only restore from cloud if the user DOES NOT have an active local run currently
      if (hasLocalPendingStops) {
        return;
      }

      try {
        const { data: runStopsData, error } = await supabase
          .from('run_stops')
          .select('*')
          .eq('user_id', uid)
          .order('stop_order', { ascending: true });
        
        if (runStopsData && runStopsData.length > 0 && !error) {
          // If the cloud run has pending stops, restore it
          const hasPending = runStopsData.some(s => s.status === 'pending');
          if (hasPending) {
            setRouteStops(runStopsData as Stop[]);
            localStorage.setItem('robin_route_stops', JSON.stringify(runStopsData));
            // Assuming active runs are always routed in MapScreen or UploadRunScreen
            if (!localStorage.getItem('robin_active_run_id')) {
               const generatedRunId = `run_restored_${Date.now()}`;
               setActiveRunId(generatedRunId);
               localStorage.setItem('robin_active_run_id', generatedRunId);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch user run state:', err);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setUserEmail(session?.user?.email || null);
      if (session) {
        if (isDeliveryMode && !localStorage.getItem('delivery_toast_shown')) {
          setShowDeliveryToast(true);
          localStorage.setItem('delivery_toast_shown', 'true');
        }
        fetchProfile(session.user.id);
        fetchRunState(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
      setUserEmail(session?.user?.email || null);
      if (event === 'SIGNED_IN') {
        setIsGuest(false);
        if (isDeliveryMode && !localStorage.getItem('delivery_toast_shown')) {
          setShowDeliveryToast(true);
          localStorage.setItem('delivery_toast_shown', 'true');
        }
        if (session) {
          fetchProfile(session.user.id);
          fetchRunState(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        setIsGuest(false);
        setActiveTab('explore');
        setVehicleProfile(null);
        localStorage.removeItem('delivery_toast_shown');
      }
    });

    return () => subscription.unsubscribe();
  }, [isDeliveryMode]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Called by ExploreScreen / MapScreen once navigation successfully starts
  const handleNavStart = useCallback((label: string, fullAddress?: string, coords?: { lat: number, lng: number }) => {
    setNavActive(true);
    setCurrentSpeed(0); // Initialize speedometer to 0 immediately
    setArrivalAddress(null); // Clear any previous arrival
    if (fullAddress) {
      setActiveNavAddress(fullAddress);
      // If we got coordinates from geocoding in MapScreen, persist them back to routeStops
      if (coords) {
        setRouteStops(prev => prev.map(s =>
          s.address === fullAddress ? { ...s, lat: coords.lat, lng: coords.lng } : s
        ));
      }
    }
    localStorage.setItem('nav-active', '1');
    localStorage.setItem('nav-label', label);
    document.body.classList.add('native-nav-active');
    document.documentElement.classList.add('native-nav-active');
  }, []);

  // Called when user taps Exit Navigation in the overlay or native FAB
  const handleNavExit = useCallback(() => {
    setNavActive(false);
    localStorage.removeItem('nav-active');
    localStorage.removeItem('nav-label');
    document.body.classList.remove('native-nav-active');
    document.documentElement.classList.remove('native-nav-active');
    if (Capacitor.isNativePlatform()) {
      NavigationSDK.hideMap().catch(console.error);
    }
  }, []);

  const handleManualArrive = useCallback((address: string | null) => {
    if (!address) return;
    handleNavExit();
    setArrivalAddress(address);
    if (!activeNavAddress) {
      setActiveNavAddress(address);
    }
  }, [handleNavExit, activeNavAddress]);

  // Listeners for native SDK events
  useEffect(() => {
    const arrivalListener = NavigationSDK.addListener('navArrived', () => {
      // Show ArrivalPanel instead of generic alert
      // Hide the native map and restore WebView so the panel is visible
      handleNavExit();
      // Set arrival address to trigger the ArrivalPanel
      setArrivalAddress(activeNavAddress || localStorage.getItem('nav-label') || 'Destination');
    });

    const exitListener = NavigationSDK.addListener('navExited', () => {
      handleNavExit();
    });

    const speedListener = NavigationSDK.addListener('speedUpdate', (data: any) => {
      setCurrentSpeed(data.speedKmh);
    });

    const speedLimitListener = NavigationSDK.addListener('speedLimitUpdate', (data: any) => {
      setCurrentSpeedLimit(data.speedLimitKmh);
    });

    return () => {
      arrivalListener.then((l: any) => l.remove());
      exitListener.then((l: any) => l.remove());
      speedListener.then((l: any) => l.remove());
      speedLimitListener.then((l: any) => l.remove());
    };
  }, [handleNavExit, activeNavAddress]);

  const handleFinalize = async (stops: Stop[]) => {
    const runId = `run_${Date.now()}`;
    const today = getSydneyDate();

    setRouteStops(stops);
    setActiveRunId(runId);
    localStorage.setItem('robin_route_stops', JSON.stringify(stops));
    localStorage.setItem('robin_active_run_id', runId);

    // Persist to Supabase so MapScreen loads the correct data
    if (!isGuest) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;

        if (userId) {
          // 1. Clear active run_stops for this user
          await supabase.from('run_stops').delete().eq('user_id', userId);

          // 2. Insert into active run_stops
          const { error: runStopsErr } = await supabase.from('run_stops').insert(
            stops.map((s, i) => ({
              user_id: userId,
              address: s.address,
              status: s.status,
              stop_order: i,
              manifest_notes: s.manifest_notes,
              lat: s.lat,
              lng: s.lng
            }))
          );
          if (runStopsErr) console.error('Error saving run_stops:', runStopsErr);

          // 3. IMMEDIATELY save the whole run to deliveries with the same run_id
          const { error: deliveriesErr } = await supabase.from('deliveries').insert(
            stops.map((s, i) => ({
              user_id: userId,
              address: s.address,
              delivery_date: today,
              run_id: runId,
              status: s.status,
              stop_order: i
            }))
          );
          if (deliveriesErr) console.error('Error saving deliveries:', deliveriesErr);
        }
      } catch (err) {
        console.error('Failed to persist run to Supabase:', err);
      }
    }

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
        if (!isGuest) {
          if (stopId) await supabase.from('run_stops').update({ status: 'completed' }).eq('id', stopId);
          // Update the existing delivery record
          const today = getSydneyDate();
          const query = supabase.from('deliveries')
            .update({ status: 'completed' })
            .eq('address', activeNavAddress)
            .eq('delivery_date', today);

          const { data: userData } = await supabase.auth.getUser();
          if (userData.user) query.eq('user_id', userData.user.id);
          if (activeRunId) query.eq('run_id', activeRunId);
          await query;
        }
      }
    }
    setArrivalAddress(null);
    setActiveNavAddress(null);
  }, [activeNavAddress, routeStops, isGuest, activeRunId]);

  const handleNextDelivery = useCallback(async () => {
    // Find the current stop index and advance to next pending
    const currentIdx = routeStops.findIndex(s => s.address === activeNavAddress);
    // Mark current as completed
    if (currentIdx >= 0) {
      const stopId = routeStops[currentIdx].id;
      setRouteStops(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'completed' as const } : s));
      if (!isGuest) {
        // Persist to Supabase
        if (stopId) await supabase.from('run_stops').update({ status: 'completed' }).eq('id', stopId);
        // Update the existing delivery record rather than inserting a duplicate
        const today = getSydneyDate();
        const query = supabase.from('deliveries')
          .update({ status: 'completed' })
          .eq('address', activeNavAddress)
          .eq('delivery_date', today);

        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) query.eq('user_id', userData.user.id);
        if (activeRunId) query.eq('run_id', activeRunId);
        await query;
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

  const handleEndRun = useCallback(async () => {
    // Treat the final stop as completed if we reached it
    if (activeNavAddress) {
      const currentIdx = routeStops.findIndex(s => s.address === activeNavAddress);
      if (currentIdx >= 0) {
        const stopId = routeStops[currentIdx].id;
        setRouteStops(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'completed' as const } : s));
        if (!isGuest) {
          if (stopId) await supabase.from('run_stops').update({ status: 'completed' }).eq('id', stopId);
          // Update the existing delivery record
          const today = getSydneyDate();
          const query = supabase.from('deliveries')
            .update({ status: 'completed' })
            .eq('address', activeNavAddress)
            .eq('delivery_date', today);

          const { data: userData } = await supabase.auth.getUser();
          if (userData.user) query.eq('user_id', userData.user.id);
          if (activeRunId) query.eq('run_id', activeRunId);
          await query;
        }
      }
    }
    setArrivalAddress(null);
    setActiveNavAddress(null);
    setIsNavigating(false); // Return to UploadRunScan screen
  }, [activeNavAddress, routeStops, isGuest, activeRunId]);



  const handleVoiceAction = (action: any) => {
    console.log('Voice action received:', action);
    if (action.type === 'reroute' && action.stopId !== undefined) {
      // Find the stop. If stopId is an index (idx + 1)
      const idx = typeof action.stopId === 'number' ? action.stopId - 1 : parseInt(action.stopId) - 1;
      const stop = routeStops[idx];
      if (stop) {
        handleNavStart(stop.address);
      }
    }
  };

  const handleSwitchToIntel = useCallback((address: string) => {
    setActiveNavAddress(address);
    setActiveTab('intel');
  }, []);

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
            onArrive={handleManualArrive}
            navActive={navActive}
            vehicleProfile={vehicleProfile}
          />
        ) : (
          <UploadRunScreen
            isDarkMode={isDarkMode}
            onFinalize={handleFinalize}
            routeStops={routeStops}
          />
        );
      case 'intel':
        return <IntelligenceFeed userEmail={userEmail} activeAddress={activeNavAddress} />;
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
            onNavigateToLogin={() => setActiveTab('explore')}
            routeStops={routeStops}
            activeAddress={activeNavAddress}
            onUpdateStops={setRouteStops}
            onSwitchToIntel={handleSwitchToIntel}
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
      {activeTab !== 'explore' && (
        <VoiceAssistantNode
          routeStops={routeStops}
          onAction={handleVoiceAction}
        />
      )}


      <main className="main-content" style={navActive ? { display: 'none' } : undefined}>
        {renderContent()}
      </main>

      {navActive && (
        <div className="nav-overlay">
          {/* Google Maps Style Header */}
          <div className="nav-header">
            <div className="nav-header-left">
              <div className="nav-next-turn-icon">
                {/* Up Arrow Icon */}
                <svg viewBox="0 0 24 24" width="32" height="32" fill="white">
                  <path d="M12 4L12 20M12 4L5 11M12 4L19 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="nav-header-text">
                <div className="nav-destination-name">{activeNavAddress?.split(',')[0]}</div>
                <div className="nav-distance">toward {activeNavAddress?.split(',').slice(1).join(',').trim() || 'destination'}</div>
              </div>
            </div>
            <button className="nav-header-exit" onClick={handleNavExit}>
              Exit
            </button>
          </div>

          <div className="nav-overlay-content">
            {currentSpeed !== null && (
              <div className="speedometer-circular">
                <div className="speedometer-inner">
                  <div className="speed-val">{currentSpeed}</div>
                  <div className="speed-unit">km/h</div>
                </div>
                {currentSpeedLimit !== null && currentSpeedLimit > 0 && (
                  <div className="speed-limit-badge">
                    {currentSpeedLimit}
                  </div>
                )}
              </div>
            )}
            
            {/* Optional space for other bottom left items */}
          </div>

          <div style={{
            position: 'absolute',
            bottom: 'max(env(safe-area-inset-bottom, 20px), 36px)',
            left: 20,
            right: 20,
            pointerEvents: 'auto'
          }}>
            <button
              className="start-nav-btn"
              style={{ background: 'var(--primary-action)', boxShadow: '0 8px 25px rgba(230, 92, 62, 0.35)' }}
              onClick={() => handleManualArrive(activeNavAddress)}
            >
              Mark Delivery Complete
            </button>
          </div>
        </div>
      )}

      {!isNavigating && !navActive && !arrivalAddress && (
        <BottomNavBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isGuest={isGuest}
        />
      )}

      {arrivalAddress && (() => {
        const currentStop = routeStops.find(s => s.address === activeNavAddress || s.address === arrivalAddress);
        const currentIdx = routeStops.findIndex(s => s.address === activeNavAddress || s.address === arrivalAddress);
        const nextStop = routeStops.find((s, i) => i > currentIdx && s.status === 'pending');
        return (
          <ArrivalPanel
            address={arrivalAddress}
            lat={currentStop?.lat}
            lng={currentStop?.lng}
            onReRoute={handleReRoute}
            onEndRoute={handleEndRoute}
            onNextDelivery={handleNextDelivery}
            onEndRun={handleEndRun}
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
