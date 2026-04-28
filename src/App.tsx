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
import { X, Volume2, VolumeX, Plus, AlertTriangle, MapPin, Package } from 'lucide-react';
import { AddCairnModal, AddHazardModal } from './components/NavigationModals';
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
  place_id?: string;
  lat?: number;
  lng?: number;
  completed_at?: string;
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

  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('robin_is_muted') === 'true');
  
  useEffect(() => {
    localStorage.setItem('robin_is_muted', isMuted ? 'true' : 'false');
  }, [isMuted]);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('robin_dark_mode') === 'true';
  });

  const [activeNavLat, setActiveNavLat] = useState<number | null>(null);
  const [activeNavLng, setActiveNavLng] = useState<number | null>(null);

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

  const [hazards, setHazards] = useState<any[]>([]);
  const [showNavActionMenu, setShowNavActionMenu] = useState(false);
  const [showAddHazard, setShowAddHazard] = useState(false);
  const [showAddCairn, setShowAddCairn] = useState(false);
  const [lastHazardWarningAt, setLastHazardWarningAt] = useState<number>(0);
  const [proximityHazard, setProximityHazard] = useState<any | null>(null);

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
                if (status === 'OK' && results[0]) {
                  const rooftop = results.find((r: any) => r.geometry.location_type === 'ROOFTOP') || results[0];
                  resolve(rooftop);
                }
                else reject(status);
              });
            });
            resolved[i] = { 
              ...stop, 
              lat: result.geometry.location.lat(), 
              lng: result.geometry.location.lng(),
              place_id: result.place_id
            };
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
    // Fresh install cleanup: ensure no stale navigation state exists from previous installations or interrupted builds
    if (!localStorage.getItem('robin_initialized')) {
      localStorage.removeItem('nav-active');
      localStorage.removeItem('nav-label');
      localStorage.setItem('robin_initialized', 'true');
    }

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

      // If user already has pending stops in local storage, verify the cloud hasn't
      // already marked the run as fully completed (i.e. app was force-killed after
      // sync but before localStorage was cleared — causing stale "incomplete" state).
      if (hasLocalPendingStops) {
        const storedRunId = localStorage.getItem('robin_active_run_id');
        if (storedRunId) {
          try {
            const { data: runCheck } = await supabase
              .from('admin_runs')
              .select('total_stops, completed_stops')
              .eq('run_id', storedRunId)
              .eq('user_id', uid)
              .single();
            // If cloud says all stops completed, the local state is stale — clear it
            if (runCheck && runCheck.total_stops > 0 && runCheck.completed_stops >= runCheck.total_stops) {
              localStorage.removeItem('robin_route_stops');
              localStorage.removeItem('robin_active_run_id');
              return; // Run is done — don't restore stale local state
            }
          } catch { /* ignore — fall through to local restoration */ }
        }
        return; // Local pending stops are legitimately in-progress
      }

      try {
        // Restore from admin_runs + admin_run_routes (most recent run with pending stops)
        // This replaces the old run_stops query which had no user_id column
        const { data: recentRuns, error: runsErr } = await supabase
          .from('admin_runs')
          .select('run_id, run_date')
          .eq('user_id', uid)
          .order('run_date', { ascending: false })
          .limit(1);

        if (runsErr || !recentRuns || recentRuns.length === 0) return;

        const latestRunId = recentRuns[0].run_id;

        const { data: routeData, error: routeErr } = await supabase
          .from('admin_run_routes')
          .select('*')
          .eq('run_id', latestRunId)
          .eq('user_id', uid)
          .order('stop_order', { ascending: true });

        if (routeErr || !routeData || routeData.length === 0) return;

        // Only restore if there are pending stops — a completed run should not be re-loaded
        const hasPending = routeData.some((s: any) => s.status === 'pending');
        if (hasPending) {
          const stops: Stop[] = routeData.map((s: any) => ({
            id: String(s.id),
            address: s.address,
            packages: 1,
            status: s.status as 'pending' | 'completed',
            place_id: s.place_id,
            lat: s.lat,
            lng: s.lng,
          }));
          setRouteStops(stops);
          localStorage.setItem('robin_route_stops', JSON.stringify(stops));
          if (!localStorage.getItem('robin_active_run_id')) {
            setActiveRunId(latestRunId);
            localStorage.setItem('robin_active_run_id', latestRunId);
          }
        }
      } catch (err) {
        console.error('Failed to fetch user run state:', err);
      }
    };

    // Safety timeout for auth: if Supabase doesn't respond in 6s, default to login screen
    // to prevent the "Loading..." white screen hang on poor connections.
    const authTimeout = setTimeout(() => {
      if (isAuthenticated === null) {
        console.warn('Auth session check timed out, defaulting to guest/login.');
        setIsAuthenticated(false);
      }
    }, 6000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(authTimeout);
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
    }).catch(err => {
      clearTimeout(authTimeout);
      console.error('Supabase session fetch error:', err);
      setIsAuthenticated(false);
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

  // Push numbered delivery markers to the native nav map for all geocoded stops.
  // Only runs on native; silently no-ops on web. Skips stops missing coordinates.
  const pushNativeDeliveryMarkers = useCallback((stops: Stop[]) => {
    if (!Capacitor.isNativePlatform()) return;
    const markerData = stops
      .map((s, i) => ({ ...s, stopNumber: i + 1 }))
      .filter(s => s.lat && s.lng)
      .map(s => ({
        lat: s.lat!,
        lng: s.lng!,
        stopNumber: s.stopNumber,
        isCompleted: s.status === 'completed',
      }));
    if (markerData.length === 0) return;
    NavigationSDK.setDeliveryMarkers({ stops: markerData }).catch(console.error);
  }, []);

  // Called by ExploreScreen / MapScreen once navigation successfully starts
  const handleNavStart = useCallback((label: string, fullAddress?: string, coords?: { lat: number, lng: number, placeId?: string }) => {
    setNavActive(true);
    setCurrentSpeed(0);
    setArrivalAddress(null);
    setDistanceRemaining(999999);
    if (fullAddress) {
      setActiveNavAddress(fullAddress);
      if (coords) {
        setActiveNavLat(coords.lat);
        setActiveNavLng(coords.lng);
        setRouteStops(prev => {
          const updated = prev.map(s =>
            s.address === fullAddress ? { 
              ...s, 
              lat: coords.lat, 
              lng: coords.lng,
              place_id: coords.placeId || s.place_id 
            } : s
          );
          pushNativeDeliveryMarkers(updated);
          return updated;
        });
      } else {
        setActiveNavLat(null);
        setActiveNavLng(null);
        pushNativeDeliveryMarkers(routeStops);
      }
    }
    localStorage.setItem('nav-active', '1');
    localStorage.setItem('nav-label', label);
    document.body.classList.add('native-nav-active');
    document.documentElement.classList.add('native-nav-active');
  }, [routeStops, pushNativeDeliveryMarkers]);

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

  const handleManualArrive = (address: string | null) => {
    if (!address) return;
    setArrivalAddress(address);
    setNavLookAround(false);
  };

  const handleUpdatePin = async () => {
    if (!activeNavAddress || !activeRunId) return;
    
    try {
      // Get current location from browser/plugin
      const pos = await Geolocation.getCurrentPosition();
      const { latitude: lat, longitude: lng } = pos.coords;

      // Update the stop's coordinates in Supabase
      const { error } = await supabase
        .from('admin_run_routes')
        .update({ lat, lng })
        .eq('run_id', activeRunId)
        .eq('address', activeNavAddress);

      if (error) throw error;

      // Update local state if needed
      const updatedStops = routeStops.map(s => 
        s.address === activeNavAddress ? { ...s, lat, lng } : s
      );
      setRouteStops(updatedStops);
      localStorage.setItem('robin_route_stops', JSON.stringify(updatedStops));

      NavigationSDK.speakText({ text: "Destination pin updated to your current location." }).catch(console.error);
      setShowNavActionMenu(false);
    } catch (err) {
      console.error('Failed to update pin:', err);
    }
  };

  // Haversine distance in meters
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Listeners for native SDK events
  useEffect(() => {
    // Fetch vehicle profile and hazards
    const initializeNavData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profile) setVehicleProfile(profile);
      }
      const { data: hazardsData } = await supabase.from('hazards').select('*');
      if (hazardsData) setHazards(hazardsData);
    };
    initializeNavData();

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
        // Proactive Arrival Logic: If within 20m, trigger arrival panel.
        // Threshold reduced from 50m to avoid false triggers on main roads for back-on properties.
        if (m <= 20) {
          handleManualArrive(activeNavAddress);
        }

        // Hazard Proximity Detection
        const checkHazards = () => {
          if (!hazards.length || !activeNavLat || !activeNavLng) return;
          
          const now = Date.now();
          // Find closest relevant hazard
          let found: any = null;
          let minDist = 300; // 300m threshold

          for (const h of hazards) {
            const dist = calculateDistance(activeNavLat, activeNavLng, h.lat, h.lng);
            if (dist < minDist) {
              // Only warn about height if we have a vehicle height and hazard has max_height
              if (h.restriction_type === 'low_bridge' && h.max_height && vehicleProfile?.vehicle_height) {
                if (vehicleProfile.vehicle_height >= h.max_height) {
                  found = h;
                  minDist = dist;
                }
              } else if (h.restriction_type === 'road_closure') {
                found = h;
                minDist = dist;
              }
            }
          }

          if (found && now - lastHazardWarningAt > 30000) { // Warn every 30s max
            setProximityHazard(found);
            setLastHazardWarningAt(now);
            const speech = found.restriction_type === 'low_bridge' 
              ? `Warning: Low bridge ahead, ${found.max_height} meters. Your truck is ${vehicleProfile?.vehicle_height} meters.`
              : "Warning: Road closure ahead.";
            NavigationSDK.speakText({ text: speech }).catch(console.error);
            
            // Clear visual alert after 10s
            setTimeout(() => setProximityHazard(null), 10000);
          }
        };
        checkHazards();
      }
    });

    const driftListener = NavigationSDK.addListener('mapDrifted', (data: { isDrifted: boolean }) => {
      setIsMapDrifted(data.isDrifted);
    });

    const speedAlertListener = NavigationSDK.addListener('speedAlert', (data: any) => {
      if (data.isSpeeding) {
        // Debounce ping to once every 10 seconds to avoid spam
        const now = Date.now();
        const lastPingStr = localStorage.getItem('robin_last_speeding_ping');
        const lastPing = lastPingStr ? parseInt(lastPingStr) : 0;
        
        if (now - lastPing > 10000) {
          try {
            const utterance = new SpeechSynthesisUtterance("Speed limit exceeded");
            utterance.rate = 1.1;
            window.speechSynthesis.speak(utterance);
            localStorage.setItem('robin_last_speeding_ping', now.toString());
          } catch(e) {}
        }
      }
    });

    return () => {
      arrivalListener.remove();
      exitListener.remove();
      speedListener.remove();
      progressListener.remove();
      driftListener.remove();
      speedAlertListener.remove();
    };
  }, [handleNavExit, activeNavAddress]);

  const syncRouteToSupabase = async (stops: Stop[], userId: string, runId: string, runDate: string) => {
    try {
      if (stops.length === 1 && stops[0].id && stops[0].id.startsWith('explore-')) {
        console.log('Skipping sync for ad-hoc explore navigation');
        return;
      }

      // 1. Deliveries upsert — ensures completed stops show in history
      const completedStops = stops.filter(s => s.status === 'completed');
      if (completedStops.length > 0) {
        const { error: delivErr } = await supabase.from('deliveries').upsert(
          completedStops.map(s => ({
            address: s.address,
            delivery_date: runDate,
            user_id: userId,
            run_id: runId
          })),
          { onConflict: 'address,delivery_date,user_id' }
        );
        if (delivErr) console.warn('deliveries upsert failed:', delivErr.message);
      }

      // 2. admin_runs — columns: run_id (text PK), user_id, run_date, total_stops, completed_stops, created_at
      const completed = stops.filter(s => s.status === 'completed').length;
      const { error: adminRunErr } = await supabase.from('admin_runs').upsert({
        run_id: runId,
        user_id: userId,
        run_date: runDate,
        total_stops: stops.length,
        completed_stops: completed,
        created_at: new Date().toISOString()
      }, { onConflict: 'run_id' });
      if (adminRunErr) console.warn('admin_runs upsert failed:', adminRunErr.message);

      // 3. admin_run_routes — delete and re-insert for this run
      const { error: routeDelErr } = await supabase.from('admin_run_routes').delete().eq('run_id', runId);
      if (routeDelErr) console.warn('admin_run_routes delete failed:', routeDelErr.message);

      if (stops.length > 0) {
        const { error: routeInsErr } = await supabase.from('admin_run_routes').insert(
          stops.map((s, i) => ({
            run_id: runId,
            user_id: userId,
            address: s.address,
            stop_order: i,
            status: s.status,
            place_id: s.place_id,
            lat: s.lat,
            lng: s.lng,
            completed_at: s.status === 'completed' ? (s.completed_at || new Date().toISOString()) : null,
          }))
        );
        if (routeInsErr) console.warn('admin_run_routes insert failed:', routeInsErr.message);
      }

      // 4. calendar_entries — columns: user_id, entry_date, run_id, total_stops, title, created_at
      const { error: calErr } = await supabase.from('calendar_entries').upsert({
        user_id: userId,
        entry_date: runDate,
        run_id: runId,
        total_stops: stops.length,
        title: `Run — ${stops.length} stop${stops.length !== 1 ? 's' : ''}`,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id,entry_date,run_id' });
      if (calErr) console.warn('calendar_entries upsert failed:', calErr.message);

      console.log(`Sync successful for run ${runId} (${stops.length} stops)`);
    } catch (err) {
      console.error('Failed to sync run to Supabase:', err);
    }
  };


  const handleUpdateStops = useCallback(async (newStops: Stop[]) => {
    setRouteStops(newStops);
    localStorage.setItem('robin_route_stops', JSON.stringify(newStops));
    if (!isGuest && activeRunId && userEmail) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await syncRouteToSupabase(newStops, userData.user.id, activeRunId, getSydneyDate());
      }
    }
  }, [activeRunId, isGuest, userEmail]);

  const handleFinalize = async (stops: Stop[]) => {
    const runId = `run_${Date.now()}`;
    const today = getSydneyDate();

    setRouteStops(stops);
    setActiveRunId(runId);
    localStorage.setItem('robin_route_stops', JSON.stringify(stops));
    localStorage.setItem('robin_active_run_id', runId);

    if (!isGuest) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await syncRouteToSupabase(stops, userData.user.id, runId, today);
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

    // Make WebView transparent FIRST — native map renders behind before panel is dismissed
    setNavActive(true);
    document.body.classList.add('native-nav-active');
    document.documentElement.classList.add('native-nav-active');

    try {
      const stop = routeStops.find(s => s.address === activeNavAddress);
      const placeId = stop?.place_id;
      const lat = stop?.lat;
      const lng = stop?.lng;

      if (!lat && !lng && !placeId) {
        // Fallback geocode if we still have nothing
        const geocoder = new (window as any).google.maps.Geocoder();
        const result = await new Promise<any>((resolve, reject) => {
          geocoder.geocode({ address: activeNavAddress, region: 'au' }, (results: any[], status: string) => {
            if (status === 'OK' && results.length > 0) resolve(results[0]);
            else reject(new Error('Geocode failed'));
          });
        });
        await NavigationSDK.startGuidance({ 
          destination: activeNavAddress, 
          placeId: result.place_id,
          lat: result.geometry.location.lat(), 
          lng: result.geometry.location.lng(), 
          travelMode: 'DRIVING' 
        });
      } else {
        await NavigationSDK.startGuidance({ 
          destination: activeNavAddress, 
          placeId,
          lat, 
          lng, 
          travelMode: 'DRIVING' 
        });
      }
      // Delay panel dismissal so native map has time to render — prevents white screen flash
      setTimeout(() => setArrivalAddress(null), 350);
      handleNavStart(activeNavAddress.split(',')[0], activeNavAddress);
      // Refresh markers after re-route
      pushNativeDeliveryMarkers(routeStops);
    } catch (err) {
      console.error('Re-route failed:', err);
      handleNavExit(); // UI recovery if route fails
    }
  }, [activeNavAddress, routeStops, handleNavStart, pushNativeDeliveryMarkers, handleNavExit]);
  

  const handleEndRoute = useCallback(async () => {
    // Mark current as completed if we reached it
    if (activeNavAddress) {
      const currentIdx = routeStops.findIndex(s => s.address === activeNavAddress);
      if (currentIdx >= 0) {
        const completedAt = new Date().toISOString();
        const updatedStops = routeStops.map((s, i) =>
          i === currentIdx ? { ...s, status: 'completed' as const, completed_at: completedAt } : s
        );
        setRouteStops(updatedStops);
        if (!isGuest && activeRunId) {
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user) {
            await syncRouteToSupabase(updatedStops, userData.user.id, activeRunId, getSydneyDate());
          }
        }
      }
    }
    setArrivalAddress(null);
    setActiveNavAddress(null);
    handleNavExit();
  }, [activeNavAddress, routeStops, isGuest, activeRunId, handleNavExit]);

  const handleNextDelivery = useCallback(async () => {
    const currentIdx = routeStops.findIndex(s => s.address === activeNavAddress);
    let currentStops = routeStops;
    
    // Mark current as completed
    if (currentIdx >= 0) {
      const completedAt = new Date().toISOString();
      currentStops = routeStops.map((s, i) =>
        i === currentIdx ? { ...s, status: 'completed' as const, completed_at: completedAt } : s
      );
      setRouteStops(currentStops);
      if (!isGuest && activeRunId) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await syncRouteToSupabase(currentStops, userData.user.id, activeRunId, getSydneyDate());
        }
      }
    }
    
    // Find next pending stop
    const nextStop = currentStops.find((s, i) => i > currentIdx && s.status === 'pending');
    if (!nextStop) {
      setArrivalAddress(null);
      setActiveNavAddress(null);
      return;
    }
    // Make WebView transparent FIRST — native map renders behind before panel is dismissed
    setNavActive(true);
    document.body.classList.add('native-nav-active');
    document.documentElement.classList.add('native-nav-active');

    try {
      await NavigationSDK.initialize();
      const lat = nextStop.lat;
      const lng = nextStop.lng;
      const placeId = nextStop.place_id;

      if (!lat && !lng && !placeId) {
        const geocoder = new (window as any).google.maps.Geocoder();
        const result = await new Promise<any>((resolve, reject) => {
          geocoder.geocode({ address: nextStop.address, region: 'au' }, (results: any[], status: string) => {
            if (status === 'OK' && results.length > 0) resolve(results[0]);
            else reject(new Error('Geocode failed'));
          });
        });
        await NavigationSDK.startGuidance({ 
          destination: nextStop.address, 
          placeId: result.place_id,
          lat: result.geometry.location.lat(), 
          lng: result.geometry.location.lng(), 
          travelMode: 'DRIVING' 
        });
      } else {
        await NavigationSDK.startGuidance({ 
          destination: nextStop.address, 
          placeId,
          lat, 
          lng, 
          travelMode: 'DRIVING' 
        });
      }
      // Dismiss arrival panel AFTER nav started — prevents white screen gap
      setArrivalAddress(null);
      setActiveNavAddress(nextStop.address);
      handleNavStart(nextStop.address.split(',')[0], nextStop.address);
      // Refresh native markers now that one stop is completed
      pushNativeDeliveryMarkers(currentStops);
    } catch (err) {
      console.error('Failed to start next delivery:', err);
      handleNavExit(); // UI recovery
    }
  }, [activeNavAddress, routeStops, handleNavStart, pushNativeDeliveryMarkers, isGuest, activeRunId, handleNavExit]);

  const handleClearRun = useCallback(() => {
    setRouteStops([]);
    setActiveRunId(null);
    setActiveNavAddress(null);
    setArrivalAddress(null);
    setIsNavigating(false);
    setPersistedDestination(null);
    localStorage.removeItem('robin_route_stops');
    localStorage.removeItem('robin_active_run_id');
    localStorage.removeItem('upload_run_stops');
    localStorage.removeItem('upload_run_phase');
    localStorage.removeItem('upload_run_images');
  }, []);

  const handleEndRun = useCallback(async () => {
    // Mark ALL remaining pending stops as completed so the cloud record is fully accurate
    // This prevents the "18/21" stale state bug on app reopen after force-close
    const completedAt = new Date().toISOString();
    const fullyCompletedStops = routeStops.map(s =>
      s.status === 'pending' ? { ...s, status: 'completed' as const, completed_at: completedAt } : s
    );
    setRouteStops(fullyCompletedStops);
    if (!isGuest && activeRunId) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await syncRouteToSupabase(fullyCompletedStops, userData.user.id, activeRunId, getSydneyDate());
      }
    }
    setArrivalAddress(null);
    setActiveNavAddress(null);
    setIsNavigating(false); // Return to UploadRunScan screen
    
    // Auto-clear the run screen after finishing the final route
    handleClearRun();
    handleNavExit();
  }, [routeStops, isGuest, activeRunId, handleClearRun, handleNavExit]);



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
    
    // Default straight arrow — used when maneuver is null or unrecognised so the header never appears empty
    const straightArrow = (
      <svg viewBox="0 0 24 24" width="48" height="48" fill="white">
        <path d="M12 4L12 20M12 4L5 11M12 4L19 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );

    if (maneuver === null) return straightArrow;
    
    // Default turn icons based loosely on Android Nav SDK maneuvers:
    // 3=Slight Left, 4=Left, 5=Sharp Left, 6=UTurn Left
    // 7=Slight Right, 8=Right, 9=Sharp Right, 10=UTurn Right
    switch(maneuver) {
      case 1: // Depart
      case 2: // Arriving
        return <div className="nav-arriving-label">ARRIVING AT</div>;
      case 3: // Slight Left
      case 4: // Left
      case 5: // Sharp Left
        return (
          <svg viewBox="0 0 24 24" width="48" height="48" fill="white" style={{ transform: 'rotate(-90deg)' }}>
            <path d="M12 4L12 20M12 4L5 11M12 4L19 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 7: // Slight Right
      case 8: // Right
      case 9: // Sharp Right
        return (
          <svg viewBox="0 0 24 24" width="48" height="48" fill="white" style={{ transform: 'rotate(90deg)' }}>
            <path d="M12 4L12 20M12 4L5 11M12 4L19 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 6: // U-Turn Left
      case 10: // U-Turn Right
        return (
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 9l-4 4 4 4"/><path d="M6 13h9a4 4 0 0 1 0 8H12"/>
          </svg>
        );
      case 11: // Straight
      case 12: // Ramp Left
      case 13: // Ramp Right
      case 14: // Merge Left
      case 15: // Merge Right
        return straightArrow;
      default:
        return straightArrow;
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
            isMuted={isMuted}
            setIsMuted={setIsMuted}
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
            isMuted={isMuted}
            setIsMuted={setIsMuted}
          />
        ) : (
          <UploadRunScreen
            isDarkMode={isDarkMode}
            onFinalize={handleFinalize}
            routeStops={routeStops}
            onClearRun={handleEndRun}
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
            isMuted={isMuted}
            setIsMuted={setIsMuted}
            handleLogout={handleLogout}
            onNavigateToLogin={() => setActiveTab('explore')}
            routeStops={routeStops}
            activeAddress={activeNavAddress}
            onUpdateStops={handleUpdateStops}
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
            isMuted={isMuted}
            setIsMuted={setIsMuted}
          />
        );
    }
  };

  if (isAuthenticated === null) {
    return (
      <div style={{ 
        display: 'flex', 
        height: '100vh', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: 'var(--bg-main, #F5F5F7)',
        color: 'var(--text-main, #1A1A1A)',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div className="loading-spinner" style={{ 
          width: '40px', 
          height: '40px', 
          border: '3px solid var(--border-subtle, #E5E5E7)', 
          borderTop: '3px solid var(--primary-action, #E65C3E)', 
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <span style={{ fontWeight: 600, fontSize: '15px', opacity: 0.8 }}>Loading Robin...</span>
        <style>{`
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
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

      {/* Global Voice Assistant - Hidden when navActive as it moves to sidebar */}
      {activeTab !== 'explore' && !navActive && (
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
          </div>



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

            {/* Right Side Stack: Thumbnail, Recenter, Voice, Arrive */}
            {activeNavAddress && !arrivalAddress && (
              <div className="nav-right-stack">
                {/* Destination Preview Thumbnail */}
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

              {/* Voice Assistant - Unified in stack */}
              <VoiceAssistantNode
                routeStops={routeStops}
                onAction={handleVoiceAction}
                isStatic={true}
                isMuted={isMuted}
              />

              {/* Add Action Button - NEW (+) */}
              <button 
                className="nav-add-fab" 
                onClick={() => setShowNavActionMenu(!showNavActionMenu)}
                style={{
                  background: 'var(--bg-card)',
                  width: '56px',
                  height: '56px',
                  borderRadius: '28px',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  marginBottom: '10px',
                  color: 'var(--primary-action)',
                  pointerEvents: 'auto'
                }}
              >
                <Plus size={28} />
              </button>

              {/* Mute/Unmute FAB - Native Overlay Context */}
              <button 
                className="nav-mute-fab" 
                onClick={() => setIsMuted(!isMuted)}
                style={{
                  background: 'var(--bg-card)',
                  width: '56px',
                  height: '56px',
                  borderRadius: '28px',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  marginBottom: '10px',
                  color: isMuted ? '#ff3b30' : 'var(--primary-action)',
                  pointerEvents: 'auto'
                }}
              >
                {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>

              {/* Manual Arrival Button */}
              <button className="nav-arrive-fab" onClick={() => handleManualArrive(activeNavAddress)} style={{ pointerEvents: 'auto' }}>
                <X size={28} />
              </button>
            </div>
          )}

            {/* Nav Action Menu Popup */}
            {showNavActionMenu && (
              <div className="nav-action-overlay" style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'auto' }} onClick={() => setShowNavActionMenu(false)}>
                <div 
                  className="nav-action-menu" 
                  style={{ 
                    position: 'absolute', bottom: 100, right: 85, background: 'var(--bg-card)', 
                    borderRadius: 20, width: 200, padding: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-color)', animation: 'proximitySlideDown 0.3s'
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <button className="menu-item" onClick={() => { setShowAddHazard(true); setShowNavActionMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', width: '100%', background: 'none', border: 'none', color: 'var(--text-main)', fontSize: 14, fontWeight: 600 }}>
                    <AlertTriangle size={20} color="#ff3b30" /> Report Hazard
                  </button>
                  <div style={{ height: 1, background: 'var(--border-color)', margin: '0 8px' }} />
                  <button className="menu-item" onClick={handleUpdatePin} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', width: '100%', background: 'none', border: 'none', color: 'var(--text-main)', fontSize: 14, fontWeight: 600 }}>
                    <MapPin size={20} color="var(--primary-action)" /> Update Pin
                  </button>
                  <div style={{ height: 1, background: 'var(--border-color)', margin: '0 8px' }} />
                  <button className="menu-item" onClick={() => { setShowAddCairn(true); setShowNavActionMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', width: '100%', background: 'none', border: 'none', color: 'var(--text-main)', fontSize: 14, fontWeight: 600 }}>
                    <Package size={20} color="var(--secondary-action)" /> Add Item
                  </button>
                </div>
              </div>
            )}

            {/* Proximity Hazard Warning Banner */}
            {proximityHazard && (
              <div className="hazard-warning-banner" style={{ position: 'absolute', top: 120, left: 20, right: 20, background: '#ff3b30', borderRadius: 16, padding: '16px 20px', color: 'white', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 8px 32px rgba(255, 59, 48, 0.4)', zIndex: 7000, pointerEvents: 'auto' }}>
                <AlertTriangle size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1.2 }}>Hazard Warning</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {proximityHazard.restriction_type === 'low_bridge' ? `Low Bridge (${proximityHazard.max_height}m)` : proximityHazard.restriction_type.replace('_', ' ')}
                  </div>
                </div>
                <button onClick={() => setProximityHazard(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
              </div>
            )}

            {showAddHazard && (
              <AddHazardModal 
                lat={activeNavLat || 0} 
                lng={activeNavLng || 0} 
                onClose={() => setShowAddHazard(false)}
                onSaved={(h) => {
                  if (h) setHazards(prev => [h, ...prev]);
                  setShowAddHazard(false);
                }}
              />
            )}

            {showAddCairn && (
              <AddCairnModal 
                lat={activeNavLat || 0} 
                lng={activeNavLng || 0} 
                onClose={() => setShowAddCairn(false)}
                onSaved={() => {
                  setShowAddCairn(false);
                }}
              />
            )}

            
            {/* Interactive Nav Look-Around */}
            {navLookAround && (
              <div className="lookaround-overlay" style={{ zIndex: 10005, position: 'fixed', inset: 0, background: '#000', pointerEvents: 'auto' }}>
                <StreetViewWrapper
                  lat={activeNavLat ?? (routeStops.find(s => s.address === activeNavAddress)?.lat || 0)}
                  lng={activeNavLng ?? (routeStops.find(s => s.address === activeNavAddress)?.lng || 0)}
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
            {/* Custom Floating Footer to match top section */}
            {!arrivalAddress && (
              <div className="nav-footer">
                <div className="nav-footer-main">
                  <div className="nav-footer-time">{remainingTimeText}</div>
                  <div className="nav-footer-dots">•</div>
                  <div className="nav-footer-distance">{remainingDistanceText}</div>
                  <div className="nav-footer-dots">•</div>
                  <div className="nav-footer-arrival">{etaText}</div>
                </div>
              </div>
            )}
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
            onExitNav={handleNavExit}
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
