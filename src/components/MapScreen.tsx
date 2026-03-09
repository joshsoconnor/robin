import React, { useEffect, useState, useRef } from 'react';
import { Map, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Navigation, Plus, X, AlertTriangle } from 'lucide-react';

const NavigationSDK = registerPlugin<any>('NavigationSDK');
import { supabase } from '../lib/supabase';
import { silverMapStyle, darkMapStyle } from '../lib/mapStyles';
import { isRestrictionActive, getTemporalMessage } from '../lib/temporalEngine';
import type { TemporalWindow, TemporalWarnings } from '../lib/temporalEngine';
import { Toast } from './Toast';
import './MapScreen.css';

interface Stop {
    id: string;
    address: string;
    packages?: number;
    status: 'pending' | 'completed' | 'active';
    stop_order?: number;
    lat?: number;
    lng?: number;
}

interface Cairn {
    id: string;
    lat: number;
    lng: number;
    category: 'parking' | 'toilet' | 'food' | 'loading_zone' | 'eating_spot' | 'clearway' | 'school_zone';
    raw_note: string;
    gate_code: string;
    active_window?: TemporalWindow;
    days?: string[];
    temporal_warnings?: TemporalWarnings;
}

const CAIRN_CATEGORIES = [
    { key: 'toilet', label: 'Public Toilet', icon: '🚾' },
    { key: 'parking', label: 'Parking', icon: '🅿️' },
    { key: 'food', label: 'Coffee / Food', icon: '☕' },
    { key: 'loading_zone', label: 'Loading Zone', icon: '🚚' },
    { key: 'eating_spot', label: 'Eating Spot', icon: '🍕' },
] as const;

const AddCairnInline: React.FC<{ lat: number, lng: number, onClose: () => void, onSaved: (cairn: Cairn | null, error?: string) => void }> = ({ lat, lng, onClose, onSaved }) => {
    const [category, setCategory] = useState('toilet');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data, error } = await supabase.from('cairns').insert([{
                lat, lng, category, raw_note: note
            }]).select();

            if (error) {
                onSaved(null, error.message);
                return;
            }
            if (data) {
                onSaved(data[0] as Cairn);
                onClose();
            }
        } catch (err: any) {
            console.error('Failed to save cairn:', err);
            onSaved(null, err?.message || 'Unknown error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>Dropping pin at your current location</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {CAIRN_CATEGORIES.map(cat => (
                    <button
                        key={cat.key}
                        onClick={() => setCategory(cat.key)}
                        style={{
                            padding: '8px 16px', borderRadius: 20, border: '1px solid #ddd',
                            background: category === cat.key ? 'var(--primary-action)' : 'white',
                            color: category === cat.key ? 'white' : 'inherit',
                            borderColor: category === cat.key ? 'var(--primary-action)' : '#ddd',
                            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
                        }}
                    >
                        <span>{cat.icon}</span> {cat.label}
                    </button>
                ))}
            </div>
            <textarea
                placeholder="Optional note (e.g. 'Behind the petrol station')"
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                style={{ width: '100%', padding: 14, border: '1px solid #ddd', borderRadius: 12, fontSize: 16, marginBottom: 12, fontFamily: 'inherit' }}
            />
            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%', padding: 12, background: 'var(--primary-action)', color: 'white',
                    border: 'none', borderRadius: 16, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                    opacity: saving ? 0.7 : 1
                }}
            >
                {saving ? 'Saving...' : 'Save'}
            </button>
        </>
    );
};

const AddHazardInline: React.FC<{ lat: number, lng: number, onClose: () => void, onSaved: (hazard: any | null, error?: string) => void }> = ({ lat, lng, onClose, onSaved }) => {
    const [restrictionType, setRestrictionType] = useState('low_bridge');
    const [maxHeight, setMaxHeight] = useState('');
    const [maxWeight, setMaxWeight] = useState('');
    const [streetName, setStreetName] = useState('');
    const [saving, setSaving] = useState(false);

    const HAZARD_TYPES = [
        { key: 'low_bridge', label: 'Low Bridge' },
        { key: 'weight_limit', label: 'Weight Limit' },
        { key: 'no_trucks', label: 'No Heavy Vehicles' },
        { key: 'tight_turn', label: 'Tight Turn' },
    ];

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: user } = await supabase.auth.getUser();
            const { data, error } = await supabase.from('hazards').insert([{
                lat, lng,
                restriction_type: restrictionType,
                max_height: maxHeight ? parseFloat(maxHeight) : null,
                max_weight: maxWeight ? parseFloat(maxWeight) : null,
                street_name: streetName.trim() || null,
                reported_by: user.user?.id
            }]).select();

            if (error) {
                onSaved(null, error.message);
                return;
            }
            if (data) {
                onSaved(data[0]);
                onClose();
            }
        } catch (err: any) {
            console.error('Failed to save hazard:', err);
            onSaved(null, err?.message || 'Unknown error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>Report hazard at your current location</p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {HAZARD_TYPES.map(type => (
                    <button
                        key={type.key}
                        onClick={() => setRestrictionType(type.key)}
                        style={{
                            padding: '8px 16px', borderRadius: 20, border: '1px solid #ddd',
                            background: restrictionType === type.key ? '#ff3b30' : 'white',
                            color: restrictionType === type.key ? 'white' : 'inherit',
                            borderColor: restrictionType === type.key ? '#ff3b30' : '#ddd',
                            fontSize: '14px', cursor: 'pointer'
                        }}
                    >
                        {type.label}
                    </button>
                ))}
            </div>

            <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Street Name (Optional)</label>
                <input
                    className="form-input"
                    value={streetName}
                    onChange={e => setStreetName(e.target.value)}
                    placeholder="e.g. Montague St"
                    style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                />
            </div>

            {(restrictionType === 'low_bridge') && (
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Max Height Clearance (meters)</label>
                    <input
                        className="form-input"
                        type="number"
                        step="0.1"
                        value={maxHeight}
                        onChange={e => setMaxHeight(e.target.value)}
                        placeholder="e.g. 3.2"
                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                    />
                </div>
            )}

            {(restrictionType === 'weight_limit') && (
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Max Weight Limit (tonnes)</label>
                    <input
                        className="form-input"
                        type="number"
                        step="0.1"
                        value={maxWeight}
                        onChange={e => setMaxWeight(e.target.value)}
                        placeholder="e.g. 15.0"
                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                    />
                </div>
            )}

            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%', padding: 14, background: '#ff3b30', color: 'white',
                    border: 'none', borderRadius: 16, fontWeight: 700, fontSize: 15, cursor: 'pointer',
                    opacity: saving ? 0.7 : 1, marginTop: 8
                }}
            >
                {saving ? 'Reporting...' : 'Publish Hazard Report'}
            </button>
        </>
    );
};

const MapInner: React.FC<{
    userLocation: { lat: number, lng: number } | null,
    cairns: Cairn[],
    runStops: Stop[],
    setSelectedCairn: (c: Cairn | null) => void,
    initialCenter: { lat: number, lng: number },
    onRouteComputed: (details: { distance: string, duration: string }) => void,
    isDarkMode: boolean,
    onArrive?: (address: string) => void
}> = ({ userLocation, cairns, runStops, setSelectedCairn, initialCenter, onRouteComputed, isDarkMode, onArrive }) => {
    const map = useMap();
    const routesLibrary = useMapsLibrary('routes');

    const [directionsService, setDirectionsService] = useState<any>();
    const [directionsRenderer, setDirectionsRenderer] = useState<any>();
    const pannedRef = useRef(false);

    useEffect(() => {
        if (map && userLocation && !pannedRef.current) {
            map.panTo(userLocation as any);
            map.setZoom(18);
            pannedRef.current = true;
        }
    }, [map, userLocation]);

    useEffect(() => {
        if (!routesLibrary) return;
        setDirectionsService(new routesLibrary.DirectionsService());
        setDirectionsRenderer(new routesLibrary.DirectionsRenderer({
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: { strokeColor: '#FFA500', strokeWeight: 5 }
        }));
    }, [routesLibrary]);

    useEffect(() => {
        if (!directionsRenderer || !map) return;
        directionsRenderer.setMap(map);
    }, [directionsRenderer, map]);

    useEffect(() => {
        if (!directionsService || !directionsRenderer) return;
        // Filter for pending stops to compute the route, but keep markers for all
        const routeStopsToCompute = runStops.filter(s => s.status === 'pending' && s.address);
        if (routeStopsToCompute.length === 0) {
            // If no pending stops, clear directions
            if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
            return;
        }

        // Origin is always user location when available; otherwise first pending stop
        const origin: any = userLocation
            ? { lat: userLocation.lat, lng: userLocation.lng }
            : routeStopsToCompute[0].address;

        // Destination is the last pending stop
        const dest: any = routeStopsToCompute[routeStopsToCompute.length - 1].address;

        // Waypoints are everything in between userLocation/origin and destination
        const waypoints = (userLocation ? routeStopsToCompute.slice(0, -1) : routeStopsToCompute.slice(1, -1)).map(stop => ({
            location: stop.address,
            stopover: true
        }));

        directionsService.route({
            origin,
            destination: dest,
            waypoints,
            travelMode: (window as any).google.maps.TravelMode.DRIVING
        }).then((response: any) => {
            directionsRenderer.setDirections(response);
            if (response.routes && response.routes.length > 0) {
                let totalDist = 0;
                let totalDur = 0;
                const legs = response.routes[0].legs;
                for (let i = 0; i < legs.length; i++) {
                    totalDist += legs[i].distance?.value || 0;
                    totalDur += legs[i].duration?.value || 0;
                }
                const distKm = (totalDist / 1000).toFixed(1) + ' km';
                const durMins = Math.round(totalDur / 60);
                const durStr = durMins >= 60 ? `${Math.floor(durMins / 60)} hr ${durMins % 60} min` : `${durMins} min`;
                onRouteComputed({ distance: distKm, duration: durStr });

                // Extract geocoded coordinates from each leg's end for numbered markers
                const stopCoords: { lat: number, lng: number }[] = [];
                for (let i = 0; i < legs.length; i++) {
                    const endLoc = legs[i].end_location;
                    stopCoords.push({ lat: endLoc.lat(), lng: endLoc.lng() });
                }
            }
        }).catch((e: any) => console.error("Directions request failed", e));
    }, [directionsService, directionsRenderer, runStops, map, userLocation, onRouteComputed]);


    const renderCairnIconDataUri = (category: string) => {
        let bgColor = '#666';
        let svgIcon = '';

        switch (category) {
            case 'parking':
                bgColor = '#34A853';
                svgIcon = '<path d="M10 8h4a4 4 0 1 1 0 8h-4v6M10 8v8" stroke="white" stroke-width="2.5" stroke-linecap="round"/>';
                break;
            case 'toilet':
                bgColor = '#4285F4';
                // Simplified WC icon
                svgIcon = '<text x="16" y="21" text-anchor="middle" font-size="12" font-weight="900" font-family="Arial" fill="white">WC</text>';
                break;
            case 'food':
                bgColor = '#EA4335';
                svgIcon = '<path d="M12 8c-2 0-3 1-3 3v5c0 1 1 2 2 2h4c1 0 2-1 2-2v-5c0-2-1-3-3-3h-2z M19 11h1c1 0 2 1 2 2s-1 2-2 2h-1" stroke="white" stroke-width="2" stroke-linecap="round"/>';
                break;
            case 'loading_zone':
                bgColor = '#FBBC05';
                svgIcon = '<path d="M6 14h14M6 18h14M16 10l4 4-4 4" stroke="white" stroke-width="2.5" stroke-linecap="round"/>';
                break;
            case 'eating_spot':
                bgColor = '#EA4335';
                svgIcon = '<path d="M11 8l10 4-10 10V8z" fill="white"/>';
                break;
            default:
                svgIcon = '<circle cx="16" cy="16" r="4" fill="white"/>';
        }

        const svg = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" fill="${bgColor}" stroke="white" stroke-width="2"/>
            ${svgIcon}
        </svg>`;
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    };

    return (
        <>
            <Map
                defaultZoom={18}
                defaultCenter={userLocation || initialCenter}
                disableDefaultUI={true}
                gestureHandling={'greedy'}
                styles={(isDarkMode ? darkMapStyle : silverMapStyle) as any}
            >
                {userLocation && (
                    <Marker position={userLocation} zIndex={100} icon={{
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#4285F4" stroke="white" stroke-width="3"/></svg>'),
                        scaledSize: new (window as any).google.maps.Size(24, 24)
                    }} />
                )}

                {cairns.map((c) => (
                    <Marker
                        key={c.id}
                        position={{ lat: c.lat, lng: c.lng }}
                        onClick={() => setSelectedCairn(c)}
                        icon={{
                            url: renderCairnIconDataUri(c.category),
                            scaledSize: new (window as any).google.maps.Size(32, 32),
                            anchor: new (window as any).google.maps.Point(16, 16)
                        }}
                    />
                ))}

                {/* Numbered stop markers for ALL stops in the run */}
                {runStops.map((stop, i) => {
                    if (!stop.lat || !stop.lng) return null;

                    const label = String(i + 1);
                    const isCompleted = stop.status === 'completed';
                    const markerColor = isCompleted ? '%239E9E9E' : '%23E53935'; // Grey for completed, Red for pending

                    const svgIcon = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="16" cy="16" r="14" fill="${markerColor}" stroke="white" stroke-width="3"/>
                        <text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial">${label}</text>
                    </svg>`;

                    return (
                        <Marker
                            key={`stop-${stop.id}`}
                            position={{ lat: stop.lat, lng: stop.lng }}
                            zIndex={isCompleted ? 40 : 50 + i}
                            onClick={() => onArrive?.(stop.address)}
                            icon={{
                                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgIcon),
                                scaledSize: new (window as any).google.maps.Size(32, 32),
                                anchor: new (window as any).google.maps.Point(16, 16)
                            }}
                        />
                    );
                })}
            </Map>
            {userLocation && (
                <button
                    className="recenter-btn"
                    onClick={() => {
                        if (map && userLocation) {
                            map.panTo(userLocation as any);
                            map.setZoom(18);
                        }
                    }}
                >
                    <Navigation size={24} color="var(--primary-action)" fill="var(--primary-action)" />
                </button>
            )}
        </>
    );
};

export const MapScreen: React.FC<{
    stops: Stop[],
    onBack: () => void,
    isDarkMode: boolean,
    onNavStart: (label: string, fullAddress?: string, coords?: { lat: number, lng: number }) => void,
    onArrive: (address: string) => void,
    navActive?: boolean,
    vehicleProfile?: any
}> = ({ stops, onBack, isDarkMode, onNavStart, onArrive, navActive = false, vehicleProfile }) => {
    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [cairns, setCairns] = useState<Cairn[]>([]);
    const [runStops, setRunStops] = useState<Stop[]>([]);
    const [selectedCairn, setSelectedCairn] = useState<Cairn | null>(null);
    const [routeInfo, setRouteInfo] = useState<{ distance: string, duration: string } | null>(null);
    const [navLoading, setNavLoading] = useState(false);
    const [navError, setNavError] = useState<string | null>(null);
    const [showAddCairn, setShowAddCairn] = useState(false);
    const [showAddHazard, setShowAddHazard] = useState(false);
    const [hazards, setHazards] = useState<any[]>([]);
    const [toastInfo, setToastInfo] = useState<{ headline: string, subtext?: string } | null>(null);

    // Restore nav-active if navigation was still running when app resumed from background
    useEffect(() => {
        if (sessionStorage.getItem('nav-active') === '1') {
            document.body.classList.add('native-nav-active');
        }
    }, []);

    // Geocode a stop address using the Google Maps Geocoder (already loaded via @vis.gl/react-google-maps)
    const geocodeStop = (address: string): Promise<{ lat: number, lng: number } | null> => {
        return new Promise((resolve) => {
            try {
                const geocoder = new (window as any).google.maps.Geocoder();
                geocoder.geocode(
                    { address, region: 'au' },
                    (results: any[], status: string) => {
                        if (status === 'OK' && results.length > 0) {
                            const loc = results[0].geometry.location;
                            resolve({ lat: loc.lat(), lng: loc.lng() });
                        } else {
                            resolve(null);
                        }
                    }
                );
            } catch {
                resolve(null);
            }
        });
    };

    const initialCenter = { lat: -33.8688, lng: 151.2093 };

    useEffect(() => {
        const initData = async () => {
            try {
                // Fast low-accuracy fix first to avoid long wait on mobile
                const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
                setUserLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
                // Upgrade to high accuracy in background
                Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
                    .then(pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
                    .catch(() => { });
            } catch (err) {
                console.warn('Geolocation failed', err);
            }

            const { data: cairnsData, error } = await supabase.from('cairns').select('*');
            if (cairnsData && !error) {
                setCairns(cairnsData as Cairn[]);
            }

            const { data: hazardsData } = await supabase.from('hazards').select('*');
            if (hazardsData) {
                setHazards(hazardsData);
            }

            // Use props if provided (more recent than DB usually)
            if (stops && stops.length > 0) {
                setRunStops(stops);
            } else {
                // Fetch the current active run from DB as fallback
                const { data: routeData } = await supabase.from('run_stops').select('*').order('stop_order', { ascending: true });
                if (routeData && routeData.length > 0) {
                    setRunStops(routeData as Stop[]);
                }
            }
        };

        initData();
    }, [stops]);

    return (
        <div className="map-screen">
            <div style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}>
                <MapInner
                    userLocation={userLocation}
                    cairns={cairns}
                    runStops={runStops}
                    setSelectedCairn={setSelectedCairn}
                    initialCenter={initialCenter}
                    onRouteComputed={setRouteInfo}
                    isDarkMode={isDarkMode}
                    onArrive={onArrive}
                />
            </div>

            <div className="map-header" style={{ position: 'relative', zIndex: 10 }}>
                <button
                    onClick={() => {
                        if (Capacitor.isNativePlatform()) {
                            document.body.classList.remove('native-nav-active');
                            NavigationSDK.hideMap().catch(console.error);
                        }
                        onBack();
                    }}
                    className="exit-nav-pill"
                >
                    &larr; Exit Navigation
                </button>
            </div>

            {selectedCairn && (
                <div className="intelligence-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h3 style={{ margin: 0, textTransform: 'capitalize' }}>{selectedCairn.category.replace('_', ' ')} Note</h3>
                        <button onClick={() => setSelectedCairn(null)} style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--text-main)' }}>&times;</button>
                    </div>
                    {/* Temporal status badge */}
                    {selectedCairn.active_window && (() => {
                        const active = isRestrictionActive(selectedCairn.active_window, selectedCairn.days);
                        const message = getTemporalMessage(selectedCairn.temporal_warnings, active);
                        return (
                            <div style={{
                                background: active ? 'rgba(255, 59, 48, 0.1)' : 'rgba(52, 199, 89, 0.1)',
                                color: active ? '#ff3b30' : '#34c759',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 600,
                                marginBottom: '8px'
                            }}>
                                {active ? '⚠️ Active Now' : '✅ Not Active'}
                                {message && <span style={{ fontWeight: 400, marginLeft: 6 }}>— {message}</span>}
                            </div>
                        );
                    })()}
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}><strong>Note:</strong> {selectedCairn.raw_note || 'N/A'}</p>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}><strong>Gate Code:</strong> {selectedCairn.gate_code || 'N/A'}</p>

                </div>
            )}

            {runStops.length > 0 && !selectedCairn && !navActive && (
                <div className="map-bottom-sheet" style={{ zIndex: 10 }}>
                    <div className="sheet-handle"></div>
                    <div className="next-stop-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
                        <span className="time-eta" style={{ fontWeight: 'bold', color: 'var(--primary-action)' }}>Navigating</span>
                        {routeInfo && (
                            <span style={{ fontSize: '14px', color: '#666', fontWeight: 500 }}>
                                {routeInfo.distance} • {routeInfo.duration}
                            </span>
                        )}
                    </div>
                    <h2 className="next-address" style={{ margin: '0 0 16px', fontSize: '18px' }}>{runStops.find(s => s.status === 'pending')?.address || 'To Next Stop'}</h2>

                    <button
                        className="start-nav-btn"
                        style={{ marginTop: '16px', opacity: navLoading ? 0.7 : 1 }}
                        disabled={navLoading}
                        onClick={async () => {
                            const nextPending = runStops.find(s => s.status === 'pending');
                            if (!nextPending) return;
                            setNavError(null);
                            setNavLoading(true);

                            try {
                                // Resolve coordinates — geocode if not already stored
                                let lat = nextPending.lat;
                                let lng = nextPending.lng;
                                if (!lat || !lng) {
                                    const coords = await geocodeStop(nextPending.address);
                                    if (coords) {
                                        lat = coords.lat;
                                        lng = coords.lng;
                                        // Cache back onto the stop so future calls are instant
                                        setRunStops(prev => prev.map(s =>
                                            s.id === nextPending.id ? { ...s, lat: coords.lat, lng: coords.lng } : s
                                        ));
                                    } else {
                                        setNavError('Could not find coordinates for this address. Check the address is correct.');
                                        setNavLoading(false);
                                        return;
                                    }
                                }

                                await NavigationSDK.initialize();

                                // Hazard Avoidance Check
                                let waypoints: any[] = [];
                                let hazardWarningText = "";
                                if (vehicleProfile && hazards.length > 0) {
                                    // Check for hazards within ~1km of destination or along general path (simplification: near destination)
                                    const conflictingHazards = hazards.filter(h => {
                                        const distToDest = Math.sqrt(Math.pow(h.lat - lat, 2) + Math.pow(h.lng - lng, 2));
                                        if (distToDest > 0.01) return false; // approx 1km

                                        if (h.restriction_type === 'low_bridge' && h.max_height && vehicleProfile.vehicle_height && vehicleProfile.vehicle_height > h.max_height) return true;
                                        if (h.restriction_type === 'weight_limit' && h.max_weight && vehicleProfile.vehicle_weight && vehicleProfile.vehicle_weight > h.max_weight) return true;
                                        return false;
                                    });

                                    if (conflictingHazards.length > 0) {
                                        const h = conflictingHazards[0];
                                        hazardWarningText = ` Warning! A ${h.restriction_type.replace('_', ' ')} of ${h.max_height || h.max_weight}${h.max_height ? 'm' : 't'} is ahead. Rerouting to avoid.`;
                                        // To force a detour, we can pick a point slightly offset from the hazard
                                        // Use simple nudge for now: offset by ~200m
                                        waypoints = [{
                                            lat: h.lat + 0.002,
                                            lng: h.lng + 0.002
                                        }];
                                    }
                                }

                                await NavigationSDK.startGuidance({
                                    destination: nextPending.address,
                                    lat,
                                    lng,
                                    travelMode: 'DRIVING',
                                    waypoints: waypoints.length > 0 ? waypoints : undefined
                                });
                                // Hand off to App.tsx to show the transparent nav overlay
                                onNavStart(nextPending.address.split(',')[0], nextPending.address, { lat: lat!, lng: lng! });

                                // Compose and speak a custom guidance message
                                if (Capacitor.isNativePlatform()) {
                                    // Extract street number + street name from address
                                    const addrParts = nextPending.address.split(',');
                                    const streetPart = addrParts[0]?.trim() || nextPending.address;

                                    // Compute estimated arrival time from route duration
                                    let arrivalTimeStr = '';
                                    if (routeInfo) {
                                        const durText = routeInfo.duration || '';
                                        let totalMinutes = 0;
                                        const hrMatch = durText.match(/(\d+)\s*hr/);
                                        const minMatch = durText.match(/(\d+)\s*min/);
                                        if (hrMatch) totalMinutes += parseInt(hrMatch[1]) * 60;
                                        if (minMatch) totalMinutes += parseInt(minMatch[1]);
                                        if (totalMinutes > 0) {
                                            const arrival = new Date(Date.now() + totalMinutes * 60000);
                                            const hours = arrival.getHours();
                                            const mins = arrival.getMinutes();
                                            const ampm = hours >= 12 ? 'PM' : 'AM';
                                            const displayHour = hours % 12 || 12;
                                            const displayMin = mins < 10 ? '0' + mins : String(mins);
                                            arrivalTimeStr = `${displayHour}:${displayMin} ${ampm}`;
                                        }
                                    }

                                    let speech = `Starting route to ${streetPart}.`;
                                    if (arrivalTimeStr) {
                                        speech += ` You should arrive by ${arrivalTimeStr}.`;
                                    }
                                    if (hazardWarningText) {
                                        speech += hazardWarningText;
                                    }

                                    // Include manifest notes if available
                                    const manifestNotes = (nextPending as any).manifest_notes;
                                    if (manifestNotes) {
                                        speech += ` Manifest says: ${manifestNotes}.`;
                                    }

                                    // Include temporal warnings for nearby cairns
                                    const now = new Date();
                                    const nearbyCairns = cairns.filter(c =>
                                        c.active_window && c.temporal_warnings &&
                                        Math.abs(c.lat - lat) < 0.005 && Math.abs(c.lng - lng) < 0.005
                                    );
                                    for (const c of nearbyCairns) {
                                        const active = isRestrictionActive(c.active_window, c.days, now);
                                        const msg = getTemporalMessage(c.temporal_warnings, active);
                                        if (msg) speech += ` ${msg}`;
                                    }

                                    // Delay Robin's speech by 5 seconds so it doesn't overlap with Google's default "Head North on..."
                                    setTimeout(() => {
                                        NavigationSDK.speakText({ text: speech }).catch(console.error);
                                    }, 5000);
                                }
                            } catch (err: any) {
                                console.error('NavigationSDK failed:', err);
                                setNavError('Navigation error: ' + (err?.message || 'SDK error.'));
                            } finally {
                                setNavLoading(false);
                            }
                        }}
                    >
                        {navLoading ? 'Starting...' : 'Start Voice Navigation'}
                    </button>

                    {navError && (
                        <div style={{ color: '#ff3b30', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                            {navError}
                        </div>
                    )}
                </div>
            )}

            {/* FAB — Add POI */}
            {!navActive && (
                <div style={{ position: 'fixed', bottom: '185px', right: '20px', display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 100 }}>
                    <button
                        className="add-poi-fab-map"
                        onClick={() => setShowAddHazard(true)}
                        title="Report Hazard"
                        style={{ background: '#ff3b30', width: '60px', height: '60px', borderRadius: '30px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        <AlertTriangle size={24} color="white" />
                    </button>
                    <button
                        className="add-poi-fab-map"
                        onClick={() => setShowAddCairn(true)}
                        title="Add Point of Interest"
                        style={{ background: 'var(--primary-action)', width: '60px', height: '60px', borderRadius: '30px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        <Plus size={28} color="white" />
                    </button>
                </div>
            )}

            {/* Add Cairn Modal */}
            {showAddCairn && userLocation && (
                <div className="modal-overlay" style={{ zIndex: 1000 }}>
                    <div className="modal-content" style={{ background: 'var(--bg-card)', width: '100%', maxHeight: '85vh', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, animation: 'slideUp 0.3s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: 20 }}>Add Point of Interest</h3>
                            <button onClick={() => setShowAddCairn(false)} style={{ background: 'var(--bg-main)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}><X size={20} /></button>
                        </div>
                        <AddCairnInline
                            lat={userLocation.lat}
                            lng={userLocation.lng}
                            onClose={() => setShowAddCairn(false)}
                            onSaved={(cairn, err) => {
                                if (err) {
                                    setToastInfo({ headline: 'Failed to Save', subtext: err });
                                } else if (cairn) {
                                    setCairns(prev => [cairn, ...prev]);
                                    setToastInfo({ headline: 'Place Added', subtext: 'Successfully pinned to map' });
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Add Hazard Modal */}
            {showAddHazard && userLocation && (
                <div className="modal-overlay" style={{ zIndex: 1000 }}>
                    <div className="modal-content" style={{ background: 'var(--bg-card)', width: '100%', maxHeight: '85vh', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, animation: 'slideUp 0.3s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <AlertTriangle size={24} color="#ff3b30" />
                                <h3 style={{ margin: 0, fontSize: 20 }}>Report Local Hazard</h3>
                            </div>
                            <button onClick={() => setShowAddHazard(false)} style={{ background: 'var(--bg-main)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}><X size={20} /></button>
                        </div>
                        <AddHazardInline
                            lat={userLocation.lat}
                            lng={userLocation.lng}
                            onClose={() => setShowAddHazard(false)}
                            onSaved={(hazard: any, err: any) => {
                                if (err) {
                                    setToastInfo({ headline: 'Failed to Report', subtext: err });
                                } else if (hazard) {
                                    setHazards(prev => [hazard, ...prev]);
                                    setToastInfo({ headline: 'Hazard Reported', subtext: 'Warning shared with Robin network' });
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toastInfo && (
                <Toast
                    headline={toastInfo.headline}
                    subtext={toastInfo.subtext}
                    onClose={() => setToastInfo(null)}
                />
            )}
        </div>
    );
};

