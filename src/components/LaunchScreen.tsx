import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, X } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import './LaunchScreen.css';

interface Stop {
    id: string;
    address: string;
    packages: number;
    status: 'pending' | 'completed';
    lat?: number;
    lng?: number;
}

interface LaunchScreenProps {
    onFinalize?: (stops: Stop[]) => void;
    isDarkMode: boolean;
}

export const LaunchScreen: React.FC<LaunchScreenProps> = ({ onFinalize, isDarkMode }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [stops, setStops] = useState<Stop[]>([]);
    const [newAddress, setNewAddress] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);
    const places = useMapsLibrary('places');

    useEffect(() => {
        if (!places || !inputRef.current) return;

        const options = {
            fields: ['geometry', 'formatted_address', 'name'],
            componentRestrictions: { country: 'au' }
        };

        const autocomplete = new places.Autocomplete(inputRef.current, options);

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.formatted_address) {
                const newStop: Stop = {
                    id: Date.now().toString(),
                    address: place.formatted_address,
                    packages: 1,
                    status: 'pending',
                    lat: place.geometry?.location?.lat(),
                    lng: place.geometry?.location?.lng()
                };
                setStops(prev => [...prev, newStop]);
                setNewAddress('');
                if (inputRef.current) inputRef.current.value = '';
            }
        });
    }, [places]);

    const handleScanClick = () => {
        setIsScanning(true);
        // Placeholder function for camera trigger / logic
        setTimeout(() => {
            // Mocked extracted text strings formatted as addresses
            setStops([
                { id: '1', address: '123 Main St, Springfield', packages: 3, status: 'pending' },
                { id: '2', address: '456 Oak Ave, Springfield', packages: 1, status: 'pending' },
                { id: '3', address: '789 Pine Ln, Springfield', packages: 2, status: 'pending' },
            ]);
            setIsScanning(false);
        }, 1500);
    };

    const addManualStop = () => {
        if (!newAddress.trim()) return;
        const newStop: Stop = {
            id: Date.now().toString(),
            address: newAddress.trim(),
            packages: 1,
            status: 'pending'
        };
        setStops([...stops, newStop]);
        setNewAddress('');
        if (inputRef.current) inputRef.current.value = '';
    };

    const removeStop = (id: string) => {
        setStops(stops.filter(s => s.id !== id));
    };

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;

        const newStops = Array.from(stops);
        const [reorderedItem] = newStops.splice(result.source.index, 1);
        newStops.splice(result.destination.index, 0, reorderedItem);

        setStops(newStops);
    };

    return (
        <div className={`launch-screen ${isDarkMode ? 'dark' : ''}`}>
            <div className="header">
                <h1>Route Plan</h1>
                <p className="subtitle">Manage or scan your daily run sheet.</p>
            </div>

            <div className="manual-entry">
                <input
                    ref={inputRef}
                    type="text"
                    className="address-input"
                    placeholder="Enter an address..."
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addManualStop()}
                />
                {newAddress.trim().length > 0 && (
                    <button className="add-btn" onClick={addManualStop}>
                        <Plus size={24} color="white" />
                    </button>
                )}
            </div>

            {stops.length === 0 ? (
                <div className="empty-state">
                    <div className="scan-card" onClick={handleScanClick}>
                        <div className="icon-wrapper">
                            {isScanning ? <span className="loader" /> : <Camera size={48} color="var(--primary-action)" />}
                        </div>
                        <h2>{isScanning ? 'Processing Image...' : 'Scan Run Sheet'}</h2>
                        <p>Tap to capture or upload your daily sheet.</p>
                    </div>
                </div>
            ) : (
                <div className="stops-list-container">
                    <div className="list-header">
                        <h3>Run Order ({stops.length})</h3>
                        <button className="reset-btn" onClick={() => setStops([])}>Reset</button>
                    </div>

                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId="stops-list">
                            {(provided) => (
                                <div
                                    className="items-container"
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                >
                                    {stops.map((stop, index) => (
                                        <Draggable key={stop.id} draggableId={stop.id} index={index}>
                                            {(provided, snapshot) => (
                                                <div
                                                    className={`stop-card ${snapshot.isDragging ? 'dragging' : ''}`}
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                >
                                                    <div className="stop-number">{index + 1}</div>
                                                    <div className="stop-details">
                                                        {(() => {
                                                            let cleaned = stop.address.replace(/(,\s*)?Australia/gi, '').trim();
                                                            const regex = /\s*(?:(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*)?(\d{4})\s*$/i;
                                                            const match = cleaned.match(regex);
                                                            if (match) {
                                                                const state = match[1] ? match[1].toUpperCase() : 'NSW';
                                                                const zip = match[2];
                                                                const streetPart = cleaned.replace(regex, '').replace(/,\s*$/, '').trim();
                                                                return (
                                                                    <>
                                                                        <span className="stop-address">{streetPart}</span>
                                                                        <span className="stop-packages" style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginTop: '2px' }}>{state} {zip}</span>
                                                                    </>
                                                                );
                                                            }
                                                            return <span className="stop-address">{cleaned}</span>;
                                                        })()}
                                                    </div>
                                                    <button className="stop-action-btn" onClick={() => removeStop(stop.id)}>
                                                        <X size={18} color="var(--text-tertiary)" />
                                                    </button>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>

                    <div className="finalize-container">
                        <button className="finalize-btn" onClick={() => onFinalize && onFinalize(stops)}>
                            Finalize Route
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
