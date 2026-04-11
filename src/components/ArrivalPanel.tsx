import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Square, X, Plus, FileText, Image, ChevronRight, Camera, Video, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSydneyDate } from '../lib/dateUtils';
import { StreetViewWrapper } from './StreetViewWrapper';
import './ArrivalPanel.css';

interface ArrivalPanelProps {
    address: string;
    lat?: number;
    lng?: number;
    onReRoute?: () => void;
    onEndRoute?: () => void;
    onNextDelivery?: () => void;
    onEndRun?: () => void;
    onExitNav?: () => void;
    hasNextDelivery?: boolean;
    nextDeliveryAddress?: string;
    nextLat?: number;
    nextLng?: number;
    userEmail?: string | null;
    isAddOnly?: boolean;
}

export const ArrivalPanel: React.FC<ArrivalPanelProps> = ({
    address,
    lat,
    lng,
    onReRoute,
    onEndRoute,
    onNextDelivery,
    onEndRun,
    onExitNav,
    hasNextDelivery = false,
    nextDeliveryAddress,
    nextLat,
    nextLng,
    userEmail,
    isAddOnly = false,
}) => {
    const [showDeliveryPanel, setShowDeliveryPanel] = useState(isAddOnly);
    const [activeTab, setActiveTab] = useState<'instructions' | 'media'>('instructions');

    // Instructions state
    const [notes, setNotes] = useState<any[]>([]);
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [parking, setParking] = useState('');
    const [deliveryNote, setDeliveryNote] = useState('');

    // Media state
    const [photos, setPhotos] = useState<any[]>([]);
    const [videos, setVideos] = useState<any[]>([]);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [mediaError, setMediaError] = useState<string | null>(null);
    const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
    const [showNextStopLookAround, setShowNextStopLookAround] = useState(false);
    const [showCurrentLookAround, setShowCurrentLookAround] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            const { data: notesData } = await supabase
                .from('location_notes')
                .select('*')
                .eq('address', address)
                .order('created_at', { ascending: false });
            if (notesData) setNotes(notesData);

            const { data: photoData } = await supabase
                .from('location_photos')
                .select('*')
                .eq('address', address)
                .order('created_at', { ascending: false });
            if (photoData) setPhotos(photoData);

            const { data: videoData } = await supabase
                .from('location_videos')
                .select('*')
                .eq('address', address)
                .order('created_at', { ascending: false });
            if (videoData) setVideos(videoData);
        };
        fetchData();
    }, [address]);

    const handleSaveNote = async () => {
        if (!parking && !deliveryNote) return;
        setIsSaving(true);

        // Ensure a delivery record exists for today
        const today = getSydneyDate();
        const { data: existing } = await supabase
            .from('deliveries')
            .select('id')
            .eq('address', address)
            .eq('delivery_date', today);
        if (!existing || existing.length === 0) {
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData.user?.id;
            await supabase.from('deliveries').upsert([{ 
                address, 
                delivery_date: today,
                user_id: userId 
            }], { onConflict: 'address,delivery_date,user_id' });
        }

        const newNote = { address, parking_instructions: parking, delivery_notes: deliveryNote };
        const { data, error } = await supabase.from('location_notes').insert([newNote]).select();
        if (!error && data) {
            setNotes([data[0], ...notes]);
            setIsAddingNote(false);
            setParking('');
            setDeliveryNote('');
        }
        setIsSaving(false);
    };

    const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (photoInputRef.current) photoInputRef.current.value = '';
        setMediaError(null);
        setIsSaving(true);

        try {
            const fileName = `${address.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.jpg`;
            let photoUrl = URL.createObjectURL(file);

            const { data: uploadData, error: upErr } = await supabase.storage
                .from('location-photos')
                .upload(fileName, file, { contentType: file.type || 'image/jpeg', upsert: false });

            if (upErr || !uploadData) {
                setMediaError('Photo upload failed: ' + (upErr?.message || 'Server error.'));
                setIsSaving(false);
                return;
            }

            const { data: { publicUrl } } = supabase.storage.from('location-photos').getPublicUrl(uploadData.path);
            photoUrl = publicUrl;

            // Ensure delivery record
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const { data: existing } = await supabase.from('deliveries').select('id').eq('address', address).eq('delivery_date', today);
            if (!existing || existing.length === 0) {
                const { data: userData } = await supabase.auth.getUser();
                const userId = userData.user?.id;
                await supabase.from('deliveries').upsert([{ 
                    address, 
                    delivery_date: today,
                    user_id: userId
                }], { onConflict: 'address,delivery_date,user_id' });
            }

            const photoRecord = { address, photo_url: photoUrl, category: 'delivery' };
            const { data, error } = await supabase.from('location_photos').insert([photoRecord]).select();
            if (!error && data) {
                setPhotos([data[0], ...photos]);
            } else {
                setMediaError('Failed to save photo.');
            }
        } catch (err: any) {
            setMediaError('Photo capture failed: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleVideoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (videoInputRef.current) videoInputRef.current.value = '';
        setMediaError(null);
        setIsSaving(true);

        try {
            const mimeType = file.type || 'video/mp4';
            const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
            const baseFileName = `${address.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`;
            const fileName = `${baseFileName}.${ext}`;
            let videoUrl = URL.createObjectURL(file);

            // 1. Generate and upload auto-thumbnail to storage (for future indexing)
            try {
                const canvas = document.createElement("canvas");
                const video = document.createElement("video");
                video.src = videoUrl;
                video.crossOrigin = "anonymous";
                video.muted = true;
                video.playsInline = true;
                
                await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        video.currentTime = 0;
                        resolve(true);
                    }, 4000);

                    video.onloadedmetadata = () => {
                        const seekTime = Math.min(1.0, video.duration / 2 || 0);
                        video.currentTime = seekTime;
                    };
                    
                    video.onseeked = () => {
                        clearTimeout(timeoutId);
                        canvas.width = video.videoWidth || 640;
                        canvas.height = video.videoHeight || 480;
                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            resolve(true);
                        } else {
                            reject('Canvas context failed');
                        }
                    };
                    video.onerror = () => reject('Video Error');
                });
                
                const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.8));
                if (blob) {
                    const thumbName = `${baseFileName}_thumb.jpg`;
                    const { error: tErr } = await supabase.storage.from('location-videos').upload(thumbName, blob, { contentType: 'image/jpeg' });
                    if (tErr) console.warn("Thumbnail upload error", tErr);
                }
            } catch(e) { console.warn("Auto-thumbnail generation failed", e); }

            // 2. Upload Video
            const { data: uploadData, error: upErr } = await supabase.storage
                .from('location-videos')
                .upload(fileName, file, { contentType: mimeType, upsert: false });

            if (upErr || !uploadData) {
                setMediaError('Video upload failed: ' + (upErr?.message || 'Server error.'));
                setIsSaving(false);
                return;
            }

            const { data: { publicUrl } } = supabase.storage.from('location-videos').getPublicUrl(uploadData.path);
            videoUrl = publicUrl;

            // Ensure delivery record
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const { data: existing } = await supabase.from('deliveries').select('id').eq('address', address).eq('delivery_date', today);
            if (!existing || existing.length === 0) {
                const { data: userData } = await supabase.auth.getUser();
                const userId = userData.user?.id;
                await supabase.from('deliveries').upsert([{ 
                    address, 
                    delivery_date: today,
                    user_id: userId
                }], { onConflict: 'address,delivery_date,user_id' });
            }

            const videoRecord = { 
                address, 
                video_url: videoUrl, 
                category: 'Delivery'
            };
            const { data, error } = await supabase.from('location_videos').insert([videoRecord]).select();
            if (!error && data) {
                setVideos([data[0], ...videos]);
            } else {
                setMediaError('Failed to save video record.');
            }
        } catch (err: any) {
            setMediaError('Video capture failed: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleEndRoute = () => {
        setShowDeliveryPanel(true);
    };

    const shortAddress = address.split(',')[0]?.trim() || address;

    // ── Arrival Action Bar (Re-route + End Route) ──
    if (!showDeliveryPanel) {
        return (
            <>
                <div className="arrival-overlay" onClick={(e) => { if ((e.target as HTMLElement) === e.currentTarget) onEndRoute?.(); }}>
                    {/* Top half: Destination pinpoint map with building marker */}
                    {lat !== undefined && lng !== undefined && (
                        <div
                            className="arrival-top-preview"
                            onClick={() => setShowCurrentLookAround(true)}
                        >
                            <img
                                src={`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&key=AIzaSyB9id2lFl02rKAX2gf9qkiL24oEvhI__GU`}
                                alt="Destination Street View"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            {/* Exit Navigation button — always visible above map preview */}
                            {onExitNav && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onExitNav(); }}
                                    style={{
                                        position: 'absolute', top: 'max(env(safe-area-inset-top, 16px), 52px)', left: 16,
                                        zIndex: 20, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)',
                                        borderRadius: 20, padding: '8px 16px', color: 'white',
                                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                    }}
                                >
                                    ← Exit Navigation
                                </button>
                            )}
                            <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                padding: '12px 14px',
                                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)'
                            }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: '#81C784', letterSpacing: 1.2 }}>DESTINATION PINPOINT</div>
                                <div style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>{shortAddress}</div>
                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>Tap for Street View look-around</div>
                            </div>
                        </div>
                    )}

                    <div className="arrival-action-bar">
                        <div className="arrival-arrived-label">✓ Arrived at {shortAddress}</div>
                        
                        {/* Delivery Details Preview */}
                        {(notes.length > 0 || photos.length > 0 || videos.length > 0) && (
                            <div className="arrival-data-preview">
                                {notes.length > 0 && (
                                    <div 
                                        className="arrival-notes-preview clickable"
                                        onClick={() => { setShowDeliveryPanel(true); setActiveTab('instructions'); }}
                                    >
                                        {notes[0].parking_instructions && (
                                            <div className="preview-note">🅿️ {notes[0].parking_instructions}</div>
                                        )}
                                        {notes[0].delivery_notes && (
                                            <div className="preview-note">📋 {notes[0].delivery_notes}</div>
                                        )}
                                        {notes.length > 1 && (
                                            <div className="preview-more">+{notes.length - 1} more instruction{notes.length > 2 ? 's' : ''}</div>
                                        )}
                                    </div>
                                )}
                                {(photos.length > 0 || videos.length > 0) && (
                                    <div className="arrival-media-preview-row">
                                        {photos.map((p, i) => (
                                            <img 
                                                key={`pre-p-${i}`} 
                                                src={p.photo_url} 
                                                className="media-preview-thumb clickable" 
                                                alt="Preview" 
                                                onClick={() => setPreviewPhotoUrl(p.photo_url)}
                                            />
                                        ))}
                                        {videos.map((v, i) => (
                                            <div 
                                                key={`pre-v-${i}`} 
                                                className="media-preview-thumb video clickable"
                                                onClick={() => setPreviewVideoUrl(v.video_url)}
                                            >
                                                <Video size={20} color="white" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                            <button className="arrival-reroute-btn" onClick={onReRoute} title="Re-route">
                                <RefreshCw size={22} color="var(--primary-action)" />
                            </button>
                            <button className="arrival-end-btn" onClick={handleEndRoute}>
                                <Square size={18} />
                                End Route
                            </button>
                        </div>
                    </div>
                </div>

                {/* Current Stop Street View Look-Around */}
                {showCurrentLookAround && lat !== undefined && lng !== undefined && createPortal(
                    <div className="lookaround-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: '#000', pointerEvents: 'auto' }}>
                        <StreetViewWrapper
                            lat={lat}
                            lng={lng}
                            isFullscreen={true}
                            onClose={() => setShowCurrentLookAround(false)}
                        />
                        <div style={{
                            position: 'absolute', bottom: 40, left: 20, right: 20,
                            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
                            padding: '16px 20px', borderRadius: 20, color: 'white',
                            zIndex: 10001, pointerEvents: 'none'
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#81C784', letterSpacing: 1.5, marginBottom: 4 }}>CURRENT STOP</div>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>{address}</div>
                        </div>
                    </div>,
                    document.body
                )}
            </>
        );
    }

    // ── Delivery Slide-Up Panel ──
    return (
        <div className="delivery-slideup-overlay" onClick={(e) => { if ((e.target as HTMLElement) === e.currentTarget) setShowDeliveryPanel(false); }}>
            <div className="delivery-slideup">
                <div className="delivery-slideup-handle" />
                <div className="delivery-slideup-header">
                    <h3>{shortAddress}</h3>
                    <button className="delivery-slideup-close" onClick={() => setShowDeliveryPanel(false)}>
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="delivery-tabs">
                    <button
                        className={`delivery-tab ${activeTab === 'instructions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('instructions')}
                    >
                        <FileText size={16} />
                        Instructions
                    </button>
                    <button
                        className={`delivery-tab ${activeTab === 'media' ? 'active' : ''}`}
                        onClick={() => setActiveTab('media')}
                    >
                        <Image size={16} />
                        Media
                    </button>
                </div>

                {/* Tab Content */}
                <div className="delivery-tab-content">
                    {activeTab === 'instructions' && (
                        <>
                            {isAddingNote ? (
                                <div className="delivery-add-form">
                                    <input
                                        placeholder="Parking instructions"
                                        value={parking}
                                        onChange={e => setParking(e.target.value)}
                                    />
                                    <textarea
                                        placeholder="Delivery notes (e.g. Leave at back door)"
                                        value={deliveryNote}
                                        onChange={e => setDeliveryNote(e.target.value)}
                                    />
                                    <div className="delivery-form-actions">
                                        <button className="cancel-btn" onClick={() => { setIsAddingNote(false); setParking(''); setDeliveryNote(''); }}>
                                            Cancel
                                        </button>
                                        <button className="save-btn" onClick={handleSaveNote} disabled={isSaving}>
                                            {isSaving ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="delivery-notes-list">
                                        {notes.length === 0 ? (
                                            <div className="delivery-empty-state">No instructions for this location yet.</div>
                                        ) : (
                                            notes.map((n, i) => (
                                                <div key={i} className="delivery-note-card" style={{ position: 'relative' }}>
                                                    {userEmail === 'joshua@rakaviti.com' && (
                                                        <button
                                                            className="arrival-delete-media-btn"
                                                            style={{ top: 12, right: 12 }}
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm('Delete this instruction?')) {
                                                                    const { data, error } = await supabase.from('location_notes').delete().eq('id', n.id).select();
                                                                    if (error) {
                                                                        alert('Error deleting note: ' + error.message);
                                                                    } else if (!data || data.length === 0) {
                                                                        alert('Deletion failed: Permission denied. Your email: ' + (userEmail || 'Not logged in'));
                                                                    } else {
                                                                        setNotes(prev => prev.filter(item => item.id !== n.id));
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                    {n.parking_instructions && (
                                                        <>
                                                            <h4>🅿️ Parking</h4>
                                                            <p>{n.parking_instructions}</p>
                                                        </>
                                                    )}
                                                    {n.delivery_notes && (
                                                        <>
                                                            <h4 style={{ color: 'var(--text-secondary)', marginTop: n.parking_instructions ? 10 : 0 }}>📋 Instructions</h4>
                                                            <p>{n.delivery_notes}</p>
                                                        </>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <button className="delivery-add-btn secondary" onClick={() => setIsAddingNote(true)}>
                                        <Plus size={18} />
                                        Add Instructions
                                    </button>
                                </>
                            )}
                        </>
                    )}

                    {activeTab === 'media' && (
                        <>
                            {mediaError && (
                                <div style={{ background: '#ff3b3020', color: '#ff3b30', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
                                    {mediaError}
                                </div>
                            )}
                            <div className="delivery-media-grid">
                                {photos.map((p, i) => (
                                    <div key={`p-${i}`} className="delivery-media-item">
                                        <div style={{ position: 'relative' }}>
                                            <img src={p.photo_url} alt={p.category || 'Photo'} onClick={() => setPreviewPhotoUrl(p.photo_url)} />
                                            {userEmail === 'joshua@rakaviti.com' && (
                                                <button
                                                    className="arrival-delete-media-btn"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm('Delete this photo?')) {
                                                            const { data, error } = await supabase.from('location_photos').delete().eq('id', p.id).select();
                                                            if (error) {
                                                                alert('Error deleting photo: ' + error.message);
                                                            } else if (!data || data.length === 0) {
                                                                alert('Deletion failed: Permission denied. Your email: ' + (userEmail || 'Not logged in'));
                                                            } else {
                                                                setPhotos(prev => prev.filter(item => item.id !== p.id));
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="media-label">📷 {p.category || 'Photo'}</div>
                                    </div>
                                ))}
                                {videos.map((v, i) => (
                                    <div key={`v-${i}`} className="delivery-media-item">
                                        <div style={{ position: 'relative' }}>
                                            <video src={v.video_url} controls playsInline />
                                            {userEmail === 'joshua@rakaviti.com' && (
                                                <button
                                                    className="arrival-delete-media-btn"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm('Delete this video?')) {
                                                            const { data, error } = await supabase.from('location_videos').delete().eq('id', v.id).select();
                                                            if (error) {
                                                                alert('Error deleting video: ' + error.message);
                                                            } else if (!data || data.length === 0) {
                                                                alert('Deletion failed: Permission denied. Your email: ' + (userEmail || 'Not logged in'));
                                                            } else {
                                                                setVideos(prev => prev.filter(item => item.id !== v.id));
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="media-label">🎥 {v.category || 'Video'}</div>
                                    </div>
                                ))}
                            </div>
                            {photos.length === 0 && videos.length === 0 && (
                                <div className="delivery-empty-state">No media for this location yet.</div>
                            )}
                            <div className="delivery-media-actions">
                                <button onClick={() => photoInputRef.current?.click()} disabled={isSaving}>
                                    <Camera size={16} />
                                    {isSaving ? '...' : 'Photo'}
                                </button>
                                <button onClick={() => videoInputRef.current?.click()} disabled={isSaving}>
                                    <Video size={16} />
                                    {isSaving ? '...' : 'Video'}
                                </button>
                            </div>
                            {/* Hidden file inputs */}
                            <input
                                ref={photoInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                style={{ display: 'none' }}
                                onChange={handlePhotoCapture}
                            />
                            <input
                                ref={videoInputRef}
                                type="file"
                                accept="video/*"
                                capture="environment"
                                style={{ display: 'none' }}
                                onChange={handleVideoCapture}
                            />
                        </>
                    )}
                </div>

                {/* Next Delivery / End Run button */}
                {hasNextDelivery ? (
                    <div style={{ padding: '0 20px 16px' }}>
                        <button className="delivery-next-btn" onClick={onNextDelivery}>
                            <ChevronRight size={20} />
                            Next Delivery
                            {nextDeliveryAddress && (
                                <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.85 }}>
                                    — {nextDeliveryAddress.split(',')[0]}
                                </span>
                            )}
                        </button>
                    </div>
                ) : (
                    <div style={{ padding: '0 20px 16px' }}>
                        <button 
                            className="delivery-next-btn" 
                            style={{ background: '#d93025', boxShadow: '0 4px 10px rgba(217, 48, 37, 0.3)' }}
                            onClick={onEndRun}
                        >
                            <Square size={18} style={{ marginRight: 8 }} />
                            End Run
                        </button>
                    </div>
                )}
            </div>

            {/* Split Screen Map Header — static map with building pin, tap for look-around */}
            <div 
                className="arrival-streetview-header" 
                onClick={() => {
                    if (showDeliveryPanel && hasNextDelivery) {
                        setShowNextStopLookAround(true);
                    } else {
                        setShowCurrentLookAround(true);
                    }
                }}
            >
                {showDeliveryPanel && hasNextDelivery && nextLat !== undefined && nextLng !== undefined ? (
                    <>
                        <img
                            src={`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${nextLat},${nextLng}&fov=110&pitch=0&key=AIzaSyB9id2lFl02rKAX2gf9qkiL24oEvhI__GU`}
                            alt="Next Destination"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            padding: '12px 14px',
                            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                            pointerEvents: 'none'
                        }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: '#81C784', letterSpacing: 1.2 }}>NEXT STOP PINPOINT</div>
                            <div style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>{nextDeliveryAddress?.split(',')[0]}</div>
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>Tap for Street View look-around</div>
                        </div>
                    </>
                ) : lat !== undefined && lng !== undefined ? (
                    <>
                        <img
                            src={`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&fov=110&pitch=0&key=AIzaSyB9id2lFl02rKAX2gf9qkiL24oEvhI__GU`}
                            alt="Destination"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            padding: '12px 14px',
                            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                            pointerEvents: 'none'
                        }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: '#81C784', letterSpacing: 1.2 }}>CURRENT STOP</div>
                            <div style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>{shortAddress}</div>
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>Tap for Street View look-around</div>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontSize: 13 }}>
                        Loading preview...
                    </div>
                )}
            </div>

            {/* Photo Preview Overlay */}
            {previewPhotoUrl && (
                <div className="photo-preview-overlay" onClick={() => setPreviewPhotoUrl(null)}>
                    <button className="photo-preview-close" onClick={() => setPreviewPhotoUrl(null)}>
                        <X size={24} />
                    </button>
                    <img src={previewPhotoUrl} alt="Preview" className="photo-preview-image" onClick={e => e.stopPropagation()} />
                </div>
            )}

            {/* Video Preview Overlay */}
            {previewVideoUrl && (
                <div className="photo-preview-overlay" onClick={() => setPreviewVideoUrl(null)}>
                    <button className="photo-preview-close" onClick={() => setPreviewVideoUrl(null)}>
                        <X size={24} />
                    </button>
                    <video 
                        src={previewVideoUrl} 
                        controls 
                        autoPlay 
                        playsInline 
                        className="photo-preview-image" 
                        onClick={e => e.stopPropagation()} 
                    />
                </div>
            )}
            {/* Current Stop Street View Look-Around */}
            {showCurrentLookAround && lat !== undefined && lng !== undefined && createPortal(
                <div className="lookaround-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: '#000', pointerEvents: 'auto' }}>
                    <StreetViewWrapper
                        lat={lat}
                        lng={lng}
                        isFullscreen={true}
                        onClose={() => setShowCurrentLookAround(false)}
                    />
                    <div style={{
                        position: 'absolute', bottom: 40, left: 20, right: 20, background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(10px)', padding: '16px 20px', borderRadius: 20, color: 'white', zIndex: 10001, pointerEvents: 'none'
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#81C784', letterSpacing: 1.5, marginBottom: 4 }}>CURRENT STOP</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{address}</div>
                    </div>
                </div>,
                document.body
            )}

            {/* Interactive Next Stop Look-Around using Portal to escape bounds */}
            {showNextStopLookAround && nextLat !== undefined && nextLng !== undefined && createPortal(
                <div className="lookaround-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100000, background: '#000', pointerEvents: 'auto' }}>
                    <StreetViewWrapper
                        lat={nextLat}
                        lng={nextLng}
                        isFullscreen={true}
                        onClose={() => setShowNextStopLookAround(false)}
                    />
                    <div style={{
                        position: 'absolute', bottom: 40, left: 20, right: 20, background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(10px)', padding: '16px 20px', borderRadius: 20, color: 'white', zIndex: 10001, pointerEvents: 'none'
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#81C784', letterSpacing: 1.5, marginBottom: 4 }}>LOOKING AT</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{nextDeliveryAddress}</div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
