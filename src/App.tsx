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
import { StreetViewWrapper } from './components/StreetViewWrapper';
import { X } from 'lucide-react';
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
  const [remainingTimeText, setRemainingTimeText] = useState('0 min');
  const [remainingDistanceText, setRemainingDistanceText] = useState('0 m');
  const [distanceRemaining, setDistanceRemaining] = useState<number>(999999);
  const [etaText, setEtaText] = useState('--:-- AM');
  const [isMapDrifted, setIsMapDrifted] = useState(false);
  const [navLookAround, setNavLookAround] = useState(false);
  
  // Turn-by-turn state
  const [nextTurnInstruction, setNextTurnInstruction] = useState<string | null>(null);
  const [nextTurnManeuver, setNextTurnManeuver] = useState<number | null>(null);
  const [distanceToNextTurn, setDistanceToNextTurn] = useState<number | null>(null);

  const [activeRunId, setActiveRunId] = useState<string | null>(() => {
    return localStorage.getItem('robin_active_run_id');
  });
  const suggestedStopsRef = useRef<Set<string>>(new Set());

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
          const userName = userEmail ? userEmail.split('@')[0].split('.')[0] : 'Josh';
          
          const inRangeStops: { stop: Stop; idx: number }[] = [];
          
          routeStops.forEach((stop, idx) => {
            // Logic: Skip current stop AND the very next stop (currentDestIdx + 1)
            // Only suggest stops further down the route
            if (idx > currentDestIdx + 1 && stop.status === 'pending' && stop.lat && stop.lng) {
              const dLat = (lat - stop.lat);
              const dLng = (lng - stop.lng);
              const distSq = dLat * dLat + dLng * dLng;

              // Roughly 200m ~ 0.002 degrees -> 0.000004
              if (distSq < 0.000004) {
                inRangeStops.push({ stop, idx });
              }
            }
          });

          // Only announce if we have new stops in range that haven't been suggested yet
          const newInRangeStops = inRangeStops.filter(item => !suggestedStopsRef.current.has(item.stop.address));

          if (newInRangeStops.length > 0) {
            // Mark all currently in-range stops as suggested so we don't repeat immediately
            inRangeStops.forEach(item => suggestedStopsRef.current.add(item.stop.address));
            
            // Format the list of delivery numbers
            const stopNumbers = inRangeStops.map(item => item.idx + 1);
            let stopListText = '';
            if (stopNumbers.length === 1) {
              stopListText = `delivery ${stopNumbers[0]}`;
            } else if (stopNumbers.length === 2) {
              stopListText = `delivery ${stopNumbers[0]} and ${stopNumbers[1]}`;
            } else {
              const last = stopNumbers.pop();
              stopListText = `delivery ${stopNumbers.join(', ')} and ${last}`;
            }

            const text = `Hi ${userName}, ${stopListText} ${stopNumbers.length > 1 ? 'are' : 'is'} within 200 metres.`;
            
            if (Capacitor.isNativePlatform()) {
              // Informative only - do not expect response
              NavigationSDK.speakText({ text }).catch(console.error);
            } else {
              console.log('STOP SPOTTER VOICE:', text);
            }
          }
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
      handleNavExit();
      setArrivalAddress(activeNavAddress || localStorage.getItem('nav-label') || 'Destination');
    });

    const exitListener = NavigationSDK.addListener('navExited', () => {
      handleNavExit();
    });

    const speedListener = NavigationSDK.addListener('speedUpdate', (data: any) => {
      setCurrentSpeed(data.speedKmh);
      if (typeof data.speedLimitKmh === 'number') {
        setCurrentSpeedLimit(data.speedLimitKmh);
      }
    });

    const progressListener = NavigationSDK.addListener('tripProgress', (data: any) => {
      if (data && typeof data.meters === 'number') {
        const m = data.meters;
        setDistanceRemaining(m);
        // Round to nearest 10m if under 1km
        const roundedM = Math.round(m / 10) * 10;
        setRemainingDistanceText(m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${roundedM} m`);

        const s = data.seconds || 0;
        const mins = Math.ceil(s / 60);
        setRemainingTimeText(mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`);

        const now = new Date();
        const eta = new Date(now.getTime() + s * 1000);
        // Format to 12-hour with dot instead of colon and lowercase am/pm (e.g. 10.17pm)
        const etaFormatted = eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
          .toLowerCase()
          .replace(' ', '')
          .replace(':', '.');
        setEtaText(etaFormatted);

        // Update maneuver info
        if (data.nextInstruction) setNextTurnInstruction(data.nextInstruction);
        if (typeof data.nextManeuver === 'number') setNextTurnManeuver(data.nextManeuver);
        if (typeof data.stepDistance === 'number') setDistanceToNextTurn(data.stepDistance);

        // Proactive Arrival Logic: If within 50m, trigger arrival panel
        // This helps when the user is roadside but not exactly on the pin.
        if (m <= 50) {
          handleManualArrive(activeNavAddress);
        }
      }
    });

    const driftListener = NavigationSDK.addListener('mapDrifted', (data: { isDrifted: boolean }) => {
      setIsMapDrifted(data.isDrifted);
    });

    return () => {
      arrivalListener.remove();
      exitListener.remove();
      speedListener.remove();
      progressListener.remove();
      driftListener.remove();
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

  const handleClearRun = useCallback(() => {
    setRouteStops([]);
    setActiveRunId(null);
    setActiveNavAddress(null);
    setArrivalAddress(null);
    setIsNavigating(false);
    localStorage.removeItem('robin_route_stops');
    localStorage.removeItem('robin_active_run_id');
    localStorage.removeItem('upload_run_stops');
    localStorage.removeItem('upload_run_phase');
    localStorage.removeItem('upload_run_images');
  }, []);

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
    
    // Auto-clear the run screen after finishing the final route
    handleClearRun();
  }, [activeNavAddress, routeStops, isGuest, activeRunId, handleClearRun]);



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

  const getTurnIcon = (maneuver: number | null) => {
    // Basic mapping based on Google Maps Maneuver constants
    // 0: Unknown, 1: Depart, 2: Destination, 3: Turn Slight Left, 4: Turn Sharp Left, 5: U-Turn Left, 6: Turn Left, ...
    if (maneuver === null) return null;
    
    // Default turn icons using SVG paths
    switch(maneuver) {
      case 1: // Depart
      case 2: // Arriving
        return <div className="nav-arriving-label">ARRIVING AT</div>;
      case 3: // Slight Left
      case 4: // Sharp Left
      case 6: // Left
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="white" style={{ transform: 'rotate(-90deg)' }}>
            <path d="M12 4L12 20M12 4L5 11M12 4L19 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 7: // Slight Right
      case 8: // Sharp Right
      case 10: // Right
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="white" style={{ transform: 'rotate(90deg)' }}>
            <path d="M12 4L12 20M12 4L5 11M12 4L19 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 11: // U-Turn Left
      case 12: // U-Turn Right
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 9l-4 4 4 4"/><path d="M6 13h9a4 4 0 0 1 0 8H12"/>
          </svg>
        );
      case 13: // Straight
      case 14: // Name Change
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="white">
            <path d="M12 4L12 20M12 4L5 11M12 4L19 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      default:
        // Default straight or fallback
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="white">
            <path d="M12 4L12 20M12 4L5 11M12 4L19 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
    }
  };

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
            onClearRun={handleClearRun}
            onNavToStop={(stop) => handleNavStart(stop.address.split(',')[0], stop.address)}
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
          {/* Google Maps Style Header - DYNAMIC */}
          <div className={`nav-header ${distanceRemaining <= 200 ? 'arriving' : ''}`}>
            <div className="nav-header-left">
              <div className="nav-next-turn-icon">
                {distanceRemaining <= 200 ? (
                  <div className="nav-arriving-label">ARRIVING AT</div>
                ) : (
                  getTurnIcon(nextTurnManeuver)
                )}
              </div>
              <div className="nav-header-text">
                <div className="nav-destination-name">
                  {distanceRemaining <= 200 
                    ? (activeNavAddress?.split(',')[0]) 
                    : (nextTurnInstruction || activeNavAddress?.split(',')[0])}
                </div>
                <div className="nav-distance">
                  {distanceRemaining <= 200 
                    ? activeNavAddress?.split(',').slice(1).join(',').trim() 
                    : distanceToNextTurn !== null 
                      ? (distanceToNextTurn >= 1000 ? `${(distanceToNextTurn / 1000).toFixed(1)} km` : `${distanceToNextTurn} m`)
                      : `toward ${activeNavAddress?.split(',').slice(1).join(',').trim() || 'destination'}`}
                </div>
              </div>
            </div>
            <button className="nav-header-exit" onClick={handleNavExit}>
              Exit
            </button>
          </div>

          {/* 50m Proximity Split-Screen Image View */}
          {distanceRemaining <= 50 && (
            <div className="proximity-split-view">
              <div className="proximity-image-container">
                {/* We'll use the static Street View API for the thumbnail here */}
                <img
                  src={`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${encodeURIComponent(activeNavAddress || '')}&key=AIzaSyB9id2lFl02rKAX2gf9qkiL24oEvhI__GU`}
                  alt="Destination"
                  className="proximity-image"
                />
              </div>
            </div>
          )}

          <div className="nav-overlay-content">
            {/* Left Side: Speedometer */}
            {currentSpeed !== null && (
              <div className="speedometer-circular">
                <svg className="speedometer-svg" viewBox="0 0 100 100">
                  <path d="M 22 78 A 40 40 0 1 1 78 78" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" strokeLinecap="round" />
                  <path d="M 22 78 A 40 40 0 1 1 78 78" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" />
                  {[225, 270, 315, 0, 45, 90, 135].map((angle, i) => {
                    const rad = (angle - 90) * (Math.PI / 180);
                    const x1 = 50 + 32 * Math.cos(rad);
                    const y1 = 50 + 32 * Math.sin(rad);
                    const x2 = 50 + 40 * Math.cos(rad);
                    const y2 = 50 + 40 * Math.sin(rad);
                    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="4" strokeLinecap="round" />;
                  })}
                  <line x1="30" y1="95" x2="70" y2="95" stroke="white" strokeWidth="4" strokeLinecap="round" />
                </svg>
                <div className="speedometer-inner">
                  <div className="speed-val">{currentSpeed}</div>
                  <div className="speed-unit">km/h</div>
                </div>
                {currentSpeedLimit !== null && currentSpeedLimit > 0 && (
                  <div className="speed-limit-badge">{currentSpeedLimit}</div>
                )}
              </div>
            )}

            {/* Right Side Stack: Thumbnail, Recenter, Arrive */}
            <div className="nav-right-stack">
              {/* Destination Preview Thumbnail */}
              {activeNavAddress && (
                <div 
                  className="nav-destination-preview" 
                  onClick={() => setNavLookAround(true)}
                >
                  <img src={`https://maps.googleapis.com/maps/api/streetview?size=200x200&location=${encodeURIComponent(activeNavAddress)}&key=AIzaSyB9id2lFl02rKAX2gf9qkiL24oEvhI__GU`} alt="Dest" />
                  <div className="thumb-overlay">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
                    </svg>
                  </div>
                </div>
              )}

              {/* Recenter Button - Appears when map is drifted */}
              {isMapDrifted && (
                <button className="nav-recenter-btn" onClick={() => NavigationSDK.recenter()}>
                  <div className="recenter-content">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                    </svg>
                    <span>Recenter</span>
                  </div>
                </button>
              )}

              {/* Manual Arrival Button */}
              <button className="nav-arrive-fab" onClick={() => handleManualArrive(activeNavAddress)}>
                <X size={28} />
              </button>
            </div>
            
            {/* Interactive Nav Look-Around */}
            {navLookAround && (
              <div className="lookaround-overlay" style={{ zIndex: 10005, position: 'fixed', inset: 0, background: '#000' }}>
                <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10007 }}>
                  <button 
                    onClick={() => setNavLookAround(false)}
                    style={{
                      background: 'white', border: 'none', borderRadius: '50%', width: 44, height: 44,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', color: 'black', cursor: 'pointer', pointerEvents: 'auto'
                    }}
                  >
                    <X size={24} />
                  </button>
                </div>
                <StreetViewWrapper
                  lat={routeStops.find(s => s.address === activeNavAddress)?.lat || 0}
                  lng={routeStops.find(s => s.address === activeNavAddress)?.lng || 0}
                  isFullscreen={true}
                  onClose={() => setNavLookAround(false)}
                />
                <div style={{
                  position: 'absolute', bottom: 40, left: 20, right: 20, background: 'rgba(0,0,0,0.7)',
                  backdropFilter: 'blur(10px)', padding: '16px 20px', borderRadius: 20, color: 'white', zIndex: 10006, pointerEvents: 'none'
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#81C784', letterSpacing: 1.5, marginBottom: 4 }}>NAVIGATING TO</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{activeNavAddress}</div>
                </div>
              </div>
            )}
          </div>

            {/* Manual Arrival Button (Red Circular FAB with X) */}
            <button 
              className="nav-arrive-fab"
              onClick={() => handleManualArrive(activeNavAddress)}
              style={{
                position: 'absolute',
                bottom: 'calc(100px + env(safe-area-inset-bottom))',
                right: 20,
                width: 56,
                height: 56,
                borderRadius: 28,
                background: '#d93025',
                color: 'white',
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 6000,
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
            >
              <X size={28} />
            </button>

            {/* NEW: Custom Floating Footer to match top section */}
            <div className="nav-footer">
              <div className="nav-footer-main">
                <div className="nav-footer-time">{remainingTimeText}</div>
                <div className="nav-footer-dots">•</div>
                <div className="nav-footer-distance">{remainingDistanceText}</div>
                <div className="nav-footer-dots">•</div>
                <div className="nav-footer-arrival">{etaText}</div>
              </div>
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
            nextLat={nextStop?.lat}
            nextLng={nextStop?.lng}
            userEmail={userEmail}
          />
        );
      })()}
    </div>
  );
}

export default App;
