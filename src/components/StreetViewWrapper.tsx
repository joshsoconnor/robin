import React, { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import './StreetViewWrapper.css';

interface StreetViewWrapperProps {
    lat: number;
    lng: number;
    onClose?: () => void;
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
    embedded?: boolean;
}

export const StreetViewWrapper: React.FC<StreetViewWrapperProps> = ({ 
    lat, 
    lng, 
    onClose, 
    isFullscreen = false, 
    onToggleFullscreen,
    embedded = false 
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const streetViewLibrary = useMapsLibrary('streetView');
    const markerLibrary = useMapsLibrary('marker');
    const geometryLibrary = useMapsLibrary('geometry');
    const [panorama, setPanorama] = useState<any>(null);

    useEffect(() => {
        if (!containerRef.current || !streetViewLibrary) return;

        // Initialize Street View Panorama
        const panoramaInstance = new streetViewLibrary.StreetViewPanorama(containerRef.current, {
            position: { lat, lng },
            pov: { heading: 0, pitch: 0 },
            zoom: 1,
            disableDefaultUI: false, // Allow native pan/zoom controls for free look-around
            enableCloseButton: false, // Disable Google's native close button so ours commands the state
            clickToGo: true,
            linksControl: true,      // Allow navigating to adjacent street nodes
            panControl: true,        // Show on-screen pan control
            showRoadLabels: true,
            motionTracking: false,
            motionTrackingControl: false,
        });

        setPanorama(panoramaInstance);

        return () => {
            // Clean up: While the API doesn't have an explicit destroy, removing it from DOM is safe.
            // We just let React handle DOM unmounting.
        };
    }, [lat, lng, streetViewLibrary]);

    useEffect(() => {
        if (panorama) {
            panorama.setPosition({ lat, lng });
        }
    }, [lat, lng, panorama]);

    // Handle marker injection and automatic POV alignment
    useEffect(() => {
        if (!panorama || !markerLibrary || !geometryLibrary) return;

        // Add a pin at the exact destination coordinates
        const marker = new markerLibrary.Marker({
            position: { lat, lng },
            map: panorama,
            title: 'Destination'
        });

        // Auto-point camera towards the pin when the panorama location resolves
        const listener = panorama.addListener('position_changed', () => {
            const panoPos = panorama.getPosition();
            if (panoPos) {
                const heading = geometryLibrary.spherical.computeHeading(panoPos, { lat, lng });
                panorama.setPov({ heading, pitch: 0 });
                
                // Only auto-aim once so we don't fight the user's manual panning
                if ((window as any).google?.maps?.event) {
                    (window as any).google.maps.event.removeListener(listener);
                }
            }
        });

        return () => {
            marker.setMap(null);
            if (listener && (window as any).google?.maps?.event) {
                (window as any).google.maps.event.removeListener(listener);
            }
        };
    }, [panorama, markerLibrary, geometryLibrary, lat, lng]);

    return (
        <div className={`street-view-container ${embedded ? 'embedded' : 'modal'} ${isFullscreen ? 'fullscreen' : ''}`}>
            {/* Header controls layout over the pano */}
            <div className="street-view-controls">
                {onToggleFullscreen && (
                    <button className="street-view-btn" onClick={onToggleFullscreen}>
                        {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                    </button>
                )}
                {onClose && (
                    <button className="street-view-btn close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                )}
            </div>
            {/* Map container */}
            <div ref={containerRef} className="street-view-map" />
        </div>
    );
};
