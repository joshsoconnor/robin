import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Square, X, Plus, FileText, Image, ChevronRight, Camera, Video, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './ArrivalPanel.css';

interface ArrivalPanelProps {
    address: string;
    onReRoute: () => void;
    onEndRoute: () => void;
    onNextDelivery: () => void;
    hasNextDelivery: boolean;
    nextDeliveryAddress?: string;
    userEmail?: string | null;
}

export const ArrivalPanel: React.FC<ArrivalPanelProps> = ({
    address,
    onReRoute,
    onEndRoute,
    onNextDelivery,
    hasNextDelivery,
    nextDeliveryAddress,
    userEmail,
}) => {
    const [showDeliveryPanel, setShowDeliveryPanel] = useState(false);
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
        const today = new Date().toISOString().split('T')[0];
        const { data: existing } = await supabase
            .from('deliveries')
            .select('id')
            .eq('address', address)
            .eq('delivery_date', today);
        if (!existing || existing.length === 0) {
            await supabase.from('deliveries').insert([{ address, delivery_date: today }]);
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
            const today = new Date().toISOString().split('T')[0];
            const { data: existing } = await supabase.from('deliveries').select('id').eq('address', address).eq('delivery_date', today);
            if (!existing || existing.length === 0) {
                await supabase.from('deliveries').insert([{ address, delivery_date: today }]);
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
            const fileName = `${address.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.${ext}`;
            let videoUrl = URL.createObjectURL(file);

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
            const today = new Date().toISOString().split('T')[0];
            const { data: existing } = await supabase.from('deliveries').select('id').eq('address', address).eq('delivery_date', today);
            if (!existing || existing.length === 0) {
                await supabase.from('deliveries').insert([{ address, delivery_date: today }]);
            }

            const videoRecord = { address, video_url: videoUrl, category: 'Delivery' };
            const { data, error } = await supabase.from('location_videos').insert([videoRecord]).select();
            if (!error && data) {
                setVideos([data[0], ...videos]);
            } else {
                setMediaError('Failed to save video.');
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
            <div className="arrival-overlay" onClick={(e) => { if (e.target === e.currentTarget) onEndRoute(); }}>
                <div className="arrival-action-bar" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="arrival-arrived-label">✓ Arrived at {shortAddress}</div>
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
        );
    }

    // ── Delivery Slide-Up Panel ──
    return (
        <div className="delivery-slideup-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowDeliveryPanel(false); }}>
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
                                                <div key={i} className="delivery-note-card">
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
                                                            const { error } = await supabase.from('location_photos').delete().eq('id', p.id);
                                                            if (!error) setPhotos(prev => prev.filter(item => item.id !== p.id));
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
                                                            const { error } = await supabase.from('location_videos').delete().eq('id', v.id);
                                                            if (!error) setVideos(prev => prev.filter(item => item.id !== v.id));
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

                {/* Next Delivery button — always visible at bottom if there's a next stop */}
                {hasNextDelivery && (
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
        </div>
    );
};
