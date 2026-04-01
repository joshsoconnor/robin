import React, { useState, useRef, useEffect } from 'react';
import { ScanLine, X, CheckCircle, Loader, Plus, GripVertical, MoreVertical } from 'lucide-react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { supabase } from '../lib/supabase';
import './UploadRunScreen.css';

interface ParsedStop {
    name?: string;
    address: string;
    manifest_notes?: string;
}

type AddressHistoryStatus = 'mine' | 'others' | 'new';

interface EnrichedStop extends ParsedStop {
    status: AddressHistoryStatus;
    hasNotes: boolean;
    hasVideos: boolean;
    isCompleted?: boolean;
    lat?: number;
    lng?: number;
    place_id?: string;
}

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

async function resizeImage(file: File): Promise<{ base64: string, mimeType: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_DIM = 1500;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_DIM) {
                        height *= MAX_DIM / width;
                        width = MAX_DIM;
                    }
                } else {
                    if (height > MAX_DIM) {
                        width *= MAX_DIM / height;
                        height = MAX_DIM;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                const base64 = dataUrl.split(',')[1];
                resolve({ base64, mimeType: 'image/jpeg' });
            };
            img.onerror = () => reject(new Error("Failed to load image for resizing"));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

async function extractAddressesFromImages(images: { base64: string; mimeType: string }[]): Promise<ParsedStop[]> {
    if (!GEMINI_API_KEY) {
        console.warn('No Gemini API key found. Using mock data.');
        return [
            { address: '12 Sample St, Sydney NSW 2000' },
            { name: 'John Smith', address: '45 Demo Ave, Surry Hills NSW 2010' },
            { address: '7 Test Rd, Newtown NSW 2042' },
        ];
    }

    const parts: any[] = [
        {
            text: `You are an OCR assistant for a delivery driver app. Extract every delivery address from this run sheet image.
Return ONLY a valid JSON array, no markdown, no explanation. Format:
[{"name": "Recipient Name or null", "address": "Full Street Address", "manifest_notes": "Any delivery instructions or null"}]
Rules:
- Keep addresses in the ORDER they appear on the page
- Include suburb/city/state/postcode if visible
- If no name is present, omit the name field entirely
- Combine multi-line addresses into one string
- Only include actual delivery stops, not warehouse/depot addresses
- If there are specific delivery instructions (e.g. "Leave at back door", "Ring bell", "Authority to leave"), include them in manifest_notes
- If no instructions are present, omit the manifest_notes field entirely
- CRITICAL: Pay close attention to unit numbers (e.g. "U 5", "UNIT 5"). If you see "U" followed by a character, it is almost certainly a Unit number.
- CRITICAL: Avoid common OCR mistakes; do NOT confuse '5' with 'S', '0' with 'O', or '1' with 'I' in the context of address numbers. "U S" is almost always "U 5".`
        },
        ...images.map(img => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } }))
    ];

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts }] })
        }
    );

    if (!response.ok) {
        let errorDetail = response.statusText;
        try {
            const errorJson = await response.json();
            errorDetail = errorJson.error?.message || JSON.stringify(errorJson);
        } catch {
            // Fallback if not JSON
        }
        throw new Error(`Google API limit or error: ${errorDetail} (${response.status})`);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("Could not read text from image. Try a clearer photo.");

    try {
        // Extract array if it was wrapped in markdown
        const match = text.match(/\[([\s\S]*)\]/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return JSON.parse(text);
    } catch {
        throw new Error("Failed to parse run sheet. Make sure the addresses are legible.");
    }
}

async function checkAddressHistory(addresses: string[], currentUserId: string | null): Promise<Map<string, { status: AddressHistoryStatus; hasNotes: boolean; hasVideos: boolean }>> {
    const result = new Map<string, { status: AddressHistoryStatus; hasNotes: boolean; hasVideos: boolean }>();

    if (addresses.length === 0) return result;

    // Initialize all as 'new'
    addresses.forEach(addr => result.set(addr, { status: 'new', hasNotes: false, hasVideos: false }));

    // Check deliveries history
    const { data: deliveries } = await supabase
        .from('deliveries')
        .select('address, user_id')
        .in('address', addresses);

    if (deliveries) {
        deliveries.forEach(d => {
            const existing = result.get(d.address) || { status: 'new' as AddressHistoryStatus, hasNotes: false, hasVideos: false };
            if (currentUserId && d.user_id === currentUserId) {
                result.set(d.address, { ...existing, status: 'mine' });
            } else if (existing.status !== 'mine') {
                result.set(d.address, { ...existing, status: 'others' });
            }
        });
    }

    // Check for notes
    const { data: notes } = await supabase
        .from('location_notes')
        .select('address')
        .in('address', addresses);

    if (notes) {
        notes.forEach(n => {
            const existing = result.get(n.address);
            if (existing) result.set(n.address, { ...existing, hasNotes: true });
        });
    }

    // Check for videos
    const { data: videos } = await supabase
        .from('location_videos')
        .select('address')
        .in('address', addresses);

    if (videos) {
        videos.forEach(v => {
            const existing = result.get(v.address);
            if (existing) result.set(v.address, { ...existing, hasVideos: true });
        });
    }

    return result;
}

interface UploadRunScreenProps {
    isDarkMode: boolean;
    onFinalize: (stops: any[]) => void;
    routeStops?: any[];
    onClearRun?: () => void;
    onNavToStop?: (stop: any) => void;
}

export const UploadRunScreen: React.FC<UploadRunScreenProps> = ({ isDarkMode, onFinalize, routeStops, onClearRun, onNavToStop }) => {
    const [capturedImages, setCapturedImages] = useState<{ url: string; base64: string; mimeType: string }[]>(() => {
        try { return JSON.parse(localStorage.getItem('upload_run_images') || '[]'); } catch { return []; }
    });
    const [stops, setStops] = useState<EnrichedStop[]>(() => {
        if (routeStops && routeStops.length > 0) {
            return routeStops.map(s => ({
                address: s.address,
                status: 'mine',
                hasNotes: false,
                hasVideos: false,
                isCompleted: s.status === 'completed',
                manifest_notes: s.manifest_notes
            }));
        }
        try { return JSON.parse(localStorage.getItem('upload_run_stops') || '[]'); } catch { return []; }
    });
    const [phase, setPhase] = useState<'capture' | 'processing' | 'review'>(() => {
        if (routeStops && routeStops.length > 0) return 'review';
        return (localStorage.getItem('upload_run_phase') as any) || 'capture';
    });
    const [processingStatus, setProcessingStatus] = useState('');

    useEffect(() => { localStorage.setItem('upload_run_images', JSON.stringify(capturedImages)); }, [capturedImages]);
    useEffect(() => { localStorage.setItem('upload_run_stops', JSON.stringify(stops)); }, [stops]);
    useEffect(() => { localStorage.setItem('upload_run_phase', phase); }, [phase]);

    // Manual entry state
    const [manualStops, setManualStops] = useState<ParsedStop[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const manualInputRef = useRef<HTMLInputElement>(null);
    const [menuOpen, setMenuOpen] = useState<number | null>(null);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editAddress, setEditAddress] = useState('');
    const places = useMapsLibrary('places');

    // Google Places autocomplete on the manual input
    // Re-bind whenever phase returns to 'capture' (e.g. after rescan)
    useEffect(() => {
        if (!places || !manualInputRef.current || phase !== 'capture') return;
        const autocomplete = new places.Autocomplete(manualInputRef.current, {
            fields: ['formatted_address', 'place_id', 'geometry'],
            componentRestrictions: { country: 'au' }
        });
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.formatted_address) {
                setManualStops(prev => [...prev, { 
                    address: place.formatted_address!,
                    place_id: place.place_id,
                    lat: place.geometry?.location?.lat(),
                    lng: place.geometry?.location?.lng()
                }]);
                if (manualInputRef.current) manualInputRef.current.value = '';
            }
        });
    }, [places, phase]);

    const addManualStop = () => {
        const addr = manualInputRef.current?.value.trim();
        if (!addr) return;
        setManualStops(prev => [...prev, { address: addr }]);
        if (manualInputRef.current) manualInputRef.current.value = '';
    };

    const removeManualStop = (idx: number) => {
        setManualStops(prev => prev.filter((_, i) => i !== idx));
    };

    const onDragEndManual = (result: DropResult) => {
        if (!result.destination) return;
        const reordered = Array.from(manualStops);
        const [moved] = reordered.splice(result.source.index, 1);
        reordered.splice(result.destination.index, 0, moved);
        setManualStops(reordered);
    };

    const onDragEndReview = (result: DropResult) => {
        if (!result.destination) return;
        const reordered = Array.from(stops);
        const [moved] = reordered.splice(result.source.index, 1);
        reordered.splice(result.destination.index, 0, moved);
        setStops(reordered);
    };

    const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const newImages: { url: string; base64: string; mimeType: string }[] = [];
        for (const file of files) {
            try {
                const resized = await resizeImage(file);
                newImages.push({
                    url: `data:${resized.mimeType};base64,${resized.base64}`,
                    base64: resized.base64,
                    mimeType: resized.mimeType
                });
            } catch (err) {
                console.error('Failed to resize image', err);
            }
        }

        setCapturedImages(prev => [...prev, ...newImages]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeImage = (idx: number) => {
        setCapturedImages(prev => prev.filter((_, i) => i !== idx));
    };

    // Begin processing — merges scanned images + manually-added stops
    const handleProcessRun = async () => {
        const hasImages = capturedImages.length > 0;
        const hasManual = manualStops.length > 0;
        if (!hasImages && !hasManual) return;
        setPhase('processing');

        try {
            let parsed: ParsedStop[] = [];

            if (hasImages) {
                setProcessingStatus('Reading your run sheet...');
                const scanned = await extractAddressesFromImages(capturedImages);
                parsed = [...parsed, ...scanned];
            }

            // Merge manual stops (de-dupe by address)
            manualStops.forEach(ms => {
                if (!parsed.find(p => p.address === ms.address)) {
                    parsed.push(ms);
                }
            });

            setProcessingStatus('Checking delivery history...');
            const { data: { user } } = await supabase.auth.getUser();
            const addresses = parsed.map(p => p.address);
            const history = await checkAddressHistory(addresses, user?.id || null);

            const enriched: EnrichedStop[] = parsed.map(stop => {
                const hist = history.get(stop.address) || { status: 'new' as AddressHistoryStatus, hasNotes: false, hasVideos: false };
                return { ...stop, ...hist };
            });

            setStops(enriched);
            setPhase('review');
            
        } catch (err: any) {
            console.error('Processing failed:', err);
            setProcessingStatus(err.message || 'Something went wrong. Please try again.');
            setTimeout(() => setPhase('capture'), 3500);
        }
    };

    const handleFinalize = () => {
        const routeStops = stops.map((stop, i) => ({
            id: String(Date.now() + i),
            address: stop.address,
            packages: 1,
            status: (stop.isCompleted ? 'completed' : 'pending') as 'completed' | 'pending',
            manifest_notes: stop.manifest_notes,
            place_id: (stop as any).place_id,
            lat: (stop as any).lat,
            lng: (stop as any).lng
        }));
        onFinalize(routeStops);
    };

    const removeStop = (idx: number) => {
        setStops(prev => prev.filter((_, i) => i !== idx));
        setMenuOpen(null);
    };

    const handleStopAction = async (action: string, idx: number) => {
        const newStops = [...stops];
        const stop = newStops[idx];
        setMenuOpen(null);

        switch (action) {
            case 'edit':
                setEditAddress(stop.address);
                setEditingIdx(idx);
                break;
            case 'complete':
                newStops[idx] = { ...stop, isCompleted: true };
                setStops(newStops);
                break;
            case 'incomplete':
                newStops[idx] = { ...stop, isCompleted: false };
                setStops(newStops);
                break;
            case 'delete':
                removeStop(idx);
                break;
        }
    };

    const saveEdit = () => {
        if (editingIdx === null) return;
        const newStops = [...stops];
        newStops[editingIdx] = { ...newStops[editingIdx], address: editAddress, status: 'new' };
        setStops(newStops);
        setEditingIdx(null);
    };

    const statusLabel = (status: AddressHistoryStatus) => {
        if (status === 'mine') return "You've been here";
        if (status === 'others') return 'Team has been here';
        return null;
    };

    const canProcess = capturedImages.length > 0 || manualStops.length > 0;

    return (
        <div className={`upload-run-screen ${isDarkMode ? 'dark' : ''}`}>

            {/* ── CAPTURE PHASE ── */}
            {phase === 'capture' && (
                <>
                    <div className="upload-header">
                        <h1>Run Sheet</h1>
                        <p className="upload-subtitle">Scan a photo or add stops manually.</p>
                    </div>

                    {/* Manual Address Entry */}
                    <div className="manual-entry-row">
                        {/* Uncontrolled input — no value= prop. Required for Places Autocomplete
                            to work properly on mobile and after rescan. */}
                        <input
                            ref={manualInputRef}
                            type="text"
                            className="manual-address-input"
                            placeholder="Enter an address..."
                            onKeyDown={e => { if (e.key === 'Enter') addManualStop(); }}
                        />
                        <button className="manual-add-btn" onClick={addManualStop}>
                            <Plus size={20} />
                        </button>
                    </div>

                    {/* Manual stop list with drag-to-reorder */}
                    {manualStops.length > 0 && (
                        <DragDropContext onDragEnd={onDragEndManual}>
                            <Droppable droppableId="manual-stops">
                                {(provided) => (
                                    <div
                                        className="manual-stops-list"
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                    >
                                        {manualStops.map((s, i) => (
                                            <Draggable key={`m-${i}`} draggableId={`m-${i}`} index={i}>
                                                {(drag) => (
                                                    <div
                                                        ref={drag.innerRef}
                                                        {...drag.draggableProps}
                                                        className="manual-stop-row"
                                                    >
                                                        <span {...drag.dragHandleProps} className="drag-handle">
                                                            <GripVertical size={16} />
                                                        </span>
                                                        <span className="manual-stop-index">{i + 1}</span>
                                                        <span className="manual-stop-address">{s.address}</span>
                                                        <button className="manual-stop-remove" onClick={() => removeManualStop(i)}>
                                                            <X size={14} />
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
                    )}

                    {/* Divider */}
                    <div className="or-divider">
                        <span>or scan run sheet</span>
                    </div>

                    {/* Image Previews */}
                    {capturedImages.length > 0 && (
                        <div className="image-strip">
                            {capturedImages.map((img, i) => (
                                <div key={i} className="image-thumb-wrapper">
                                    <img src={img.url} alt={`Page ${i + 1}`} className="image-thumb" />
                                    <button className="image-remove-btn" onClick={() => removeImage(i)}>
                                        <X size={14} />
                                    </button>
                                    <span className="image-page-label">p{i + 1}</span>
                                </div>
                            ))}
                            <button className="add-photo-btn" onClick={() => fileInputRef.current?.click()}>
                                <ScanLine size={22} />
                                <span>Add page</span>
                            </button>
                        </div>
                    )}

                    {capturedImages.length === 0 && (
                        <div className="capture-zone" onClick={() => fileInputRef.current?.click()}>
                            <div className="capture-icon-ring">
                                <ScanLine size={40} color="var(--primary-action)" />
                            </div>
                            <h2>Scan Run Sheet</h2>
                            <p>Tap to capture or upload your daily sheet.</p>
                        </div>
                    )}

                    {canProcess && (
                        <button className="process-btn" onClick={handleProcessRun}>
                            <CheckCircle size={20} />
                            Extract Addresses
                            {capturedImages.length > 0 && ` · ${capturedImages.length} page${capturedImages.length > 1 ? 's' : ''}`}
                            {manualStops.length > 0 && ` · ${manualStops.length} manual`}
                        </button>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handleImageCapture}
                    />
                </>
            )}

            {/* ── PROCESSING PHASE ── */}
            {phase === 'processing' && (
                <div className="processing-state">
                    <div className="processing-spinner">
                        <Loader size={36} className="spin-icon" color="var(--primary-action)" />
                    </div>
                    <p className="processing-label">{processingStatus}</p>
                </div>
            )}

            {/* ── REVIEW PHASE ── */}
            {phase === 'review' && (
                <>
                    <div className="review-header">
                        <div>
                            <h1>Run Preview</h1>
                            <p className="upload-subtitle">{stops.filter(s => !s.isCompleted).length} stop{stops.filter(s => !s.isCompleted).length !== 1 ? 's' : ''} remaining</p>
                        </div>
                        <button className="rescan-btn" onClick={() => { setPhase('capture'); }}>
                            Rescan
                        </button>
                    </div>

                    {/* Next Stop Image Preview */}
                    {(() => {
                        const nextPending = stops.find(s => !s.isCompleted);
                        if (!nextPending || !onNavToStop) return null;
                        return (
                            <div className="next-stop-preview" onClick={() => onNavToStop(nextPending)}>
                                <div className="next-stop-img-container">
                                    <img 
                                        src={`https://maps.googleapis.com/maps/api/staticmap?size=600x400&center=${nextPending.lat},${nextPending.lng}&zoom=19&scale=2&maptype=roadmap&markers=color:red%7C${nextPending.lat},${nextPending.lng}&key=AIzaSyB9id2lFl02rKAX2gf9qkiL24oEvhI__GU`} 
                                        alt="Next Stop" 
                                        className="next-stop-img" 
                                    />
                                    <div className="next-stop-overlay">
                                        <div className="next-stop-label">UP NEXT · PINPOINT</div>
                                        <div className="next-stop-address">{nextPending.address.split(',')[0]}</div>
                                        <div className="next-stop-hint">Tap map to start navigation</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Legend */}
                    <div className="legend-row">
                        <span className="legend-item mine">● You&apos;ve been here</span>
                        <span className="legend-item others">● Team visited</span>
                        <span className="legend-item new">● New stop</span>
                    </div>

                    <p className="upload-subtitle" style={{ marginBottom: 6 }}>
                        {stops.filter(s => !s.isCompleted).length} stop{stops.filter(s => !s.isCompleted).length !== 1 ? 's' : ''} remaining · drag to reorder · 3-dot menu to manage
                    </p>
                    {/* Stops List with drag-to-reorder */}
                    <DragDropContext onDragEnd={onDragEndReview}>
                        <Droppable droppableId="review-stops">
                            {(provided) => (
                                <div
                                    className="stops-list-scroll"
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    {stops.map((stop, i) => (
                                        <Draggable key={`r-${i}`} draggableId={`r-${i}`} index={i}>
                                            {(drag) => (
                                                <div
                                                    ref={drag.innerRef}
                                                    {...drag.draggableProps}
                                                    className={`stop-row stop-${stop.status} ${stop.isCompleted ? 'is-completed' : ''} ${menuOpen === i ? 'menu-open' : ''}`}
                                                >
                                                    <span {...drag.dragHandleProps} className="drag-handle">
                                                        <GripVertical size={16} />
                                                    </span>
                                                    <div className="stop-index">{i + 1}</div>
                                                    <div className="stop-info">
                                                        {stop.name && <span className="stop-name">{stop.name}</span>}
                                                        <span className="stop-address">{stop.address}</span>
                                                        {stop.manifest_notes && (
                                                            <span className="stop-manifest-note">📋 {stop.manifest_notes}</span>
                                                        )}
                                                        <div className="stop-tags">
                                                            {stop.isCompleted && <span className="tag tag-completed">✓ Completed</span>}
                                                            {statusLabel(stop.status) && (
                                                                <span className={`tag tag-${stop.status}`}>{statusLabel(stop.status)}</span>
                                                            )}
                                                            {stop.hasNotes && <span className="tag tag-info">📝 Notes</span>}
                                                            {stop.hasVideos && <span className="tag tag-info">🎥 Video</span>}
                                                        </div>
                                                    </div>
                                                    <div style={{ position: 'relative' }}>
                                                        <button className="menu-action-btn" onClick={() => setMenuOpen(menuOpen === i ? null : i)}>
                                                            <MoreVertical size={18} color="var(--text-secondary)" />
                                                        </button>
                                                        {menuOpen === i && (
                                                            <div className="stop-action-menu">
                                                                <button onClick={() => handleStopAction('edit', i)}>Edit Address</button>
                                                                {stop.isCompleted ? (
                                                                    <button onClick={() => handleStopAction('incomplete', i)}>Mark Incomplete</button>
                                                                ) : (
                                                                    <button onClick={() => handleStopAction('complete', i)}>Mark Completed</button>
                                                                )}
                                                                <button onClick={() => handleStopAction('delete', i)} style={{ color: 'var(--accent-red)' }}>Delete</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>

                    {stops.length > 0 && (
                        <div className="finalize-bar">
                            {stops.every(s => s.isCompleted) ? (
                                <button className="finalize-run-btn" style={{ background: 'var(--success-green)' }} onClick={onClearRun}>
                                    <CheckCircle size={20} />
                                    Finalize Run
                                </button>
                            ) : (
                                <button className="finalize-run-btn" onClick={handleFinalize}>
                                    {stops.some(s => s.isCompleted) ? 'Resume Run' : 'Generate Run'} → {stops.filter(s => !s.isCompleted).length} stops
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
            {editingIdx !== null && (
                <div className="edit-modal-overlay">
                    <div className="edit-modal-content">
                        <h3>Edit Address</h3>
                        <textarea
                            className="edit-address-input"
                            value={editAddress}
                            onChange={e => setEditAddress(e.target.value)}
                            rows={3}
                        />
                        <div className="edit-modal-actions">
                            <button className="edit-cancel-btn" onClick={() => setEditingIdx(null)}>Cancel</button>
                            <button className="edit-save-btn" onClick={saveEdit}>Save Changes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
