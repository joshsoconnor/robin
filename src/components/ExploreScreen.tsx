import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Map, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Geolocation } from '@capacitor/geolocation';
// Camera import removed — video capture now uses a file input with accept="video/*"
import { registerPlugin, Capacitor } from '@capacitor/core';
import { getSydneyDate } from '../lib/dateUtils';
import { Camera, Navigation, Coffee, MapPin, Search, Plus, X, Video, Car, Footprints, FileText, Loader, AlertTriangle, Trash2, Volume2, VolumeX } from 'lucide-react';
import { silverMapStyle, darkMapStyle } from '../lib/mapStyles';
import { supabase } from '../lib/supabase';
import { analyzeSignPhoto } from '../lib/signAnalyzer';
import { Toast } from './Toast';
import { VoiceAssistantNode } from './VoiceAssistantNode';
import { StreetViewWrapper } from './StreetViewWrapper';
import './ExploreScreen.css';

const NavigationSDK = registerPlugin<any>('NavigationSDK');
const STREETVIEW_API_KEY = "AIzaSyB9id2lFl02rKAX2gf9qkiL24oEvhI__GU";

const getStreetViewUrl = (lat: number, lng: number) =>
    `https://maps.googleapis.com/maps/api/streetview?size=400x200&location=${lat},${lng}&key=${STREETVIEW_API_KEY}`;

// --- MODALS ---

const DeliveryModal = ({ address, onClose }: { address: string, onClose: () => void }) => {
    const [notes, setNotes] = useState<any[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [parking, setParking] = useState('');
    const [deliveryNote, setDeliveryNote] = useState('');

    useEffect(() => {
        const fetchNotes = async () => {
            const { data } = await supabase.from('location_notes').select('*').eq('address', address).order('created_at', { ascending: false });
            if (data) setNotes(data);
        };
        fetchNotes();
    }, [address]);

    const handleSave = async () => {
        if (!parking && !deliveryNote) return;

        // Ensure a delivery record exists for today for the calendar
        const today = getSydneyDate();
        const { data: existingDelivery } = await supabase
            .from('deliveries')
            .select('id')
            .eq('address', address)
            .eq('delivery_date', today);

        if (!existingDelivery || existingDelivery.length === 0) {
            await supabase.from('deliveries').insert([{ address, delivery_date: today }]);
        }

        const newNote = { address, parking_instructions: parking, delivery_notes: deliveryNote };
        const { data, error } = await supabase.from('location_notes').insert([newNote]).select();
        if (!error && data) {
            setNotes([data[0], ...notes]);
            setIsAdding(false);
            setParking('');
            setDeliveryNote('');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Delivery Notes</h3>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                {isAdding ? (
                    <div className="add-form">
                        <input className="input-field" placeholder="Parking Instructions" value={parking} onChange={e => setParking(e.target.value)} />
                        <textarea className="input-field" placeholder="Delivery Notes (e.g. Leave at back door)" rows={3} value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} />
                        <button className="submit-btn" onClick={handleSave}>Save Notes</button>
                    </div>
                ) : (
                    <>
                        <div className="notes-list">
                            {notes.length === 0 ? (
                                <div className="empty-state">No notes found for this location.</div>
                            ) : (
                                notes.map((n, i) => (
                                    <div key={i} className="note-card">
                                        {n.parking_instructions && <><h4 style={{ color: 'var(--primary-action)' }}>Parking</h4><p style={{ marginBottom: 12 }}>{n.parking_instructions}</p></>}
                                        {n.delivery_notes && <h4 style={{ color: 'var(--text-secondary)' }}>Instructions</h4>}
                                        {n.delivery_notes && <p>{n.delivery_notes}</p>}
                                    </div>
                                ))
                            )}
                        </div>
                        <button className="action-btn primary" onClick={() => setIsAdding(true)}>
                            <Plus size={20} /> Add Note
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

const ExtrasModal = ({ address, onClose, userEmail }: { address: string, onClose: () => void, userEmail: string | null | undefined }) => {
    const [videos, setVideos] = useState<any[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
    const [videoFile, setVideoFile] = useState<Blob | null>(null);
    const [category, setCategory] = useState('Parking');
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    // Photo capture state
    const [photos, setPhotos] = useState<any[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => {
        const fetchMedia = async () => {
            const { data: videoData } = await supabase.from('location_videos').select('*').eq('address', address).order('created_at', { ascending: false });
            if (videoData) setVideos(videoData);
            const { data: photoData } = await supabase.from('location_photos').select('*').eq('address', address).order('created_at', { ascending: false });
            if (photoData) setPhotos(photoData);
        };
        fetchMedia();
    }, [address]);

    // Native camera capture — use a file input with accept="video/*" because
    // @capacitor/camera's getPhoto() only takes photos, not video.
    const captureVideoNative = () => {
        videoInputRef.current?.click();
    };

    const handleVideoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setVideoFile(file);
        setVideoBlobUrl(URL.createObjectURL(file));
        // Reset input so the same file can be re-selected
        if (videoInputRef.current) videoInputRef.current.value = '';
    };

    // Web fallback — getUserMedia
    const captureVideoWeb = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            let chunks: BlobPart[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                setVideoFile(blob);
                setVideoBlobUrl(URL.createObjectURL(blob));
                stream.getTracks().forEach(track => track.stop());
            };
            recorder.start();
            setIsRecording(true);

            setTimeout(() => {
                if (recorder.state === 'recording') {
                    recorder.stop();
                    setIsRecording(false);
                }
            }, 10000);
        } catch (err) {
            console.error("Camera access denied or unavailable", err);
            setUploadError("Unable to access camera. Please ensure permissions are granted in Settings.");
        }
    };

    const startRecording = async () => {
        setUploadError(null);
        if (Capacitor.isNativePlatform()) {
            await captureVideoNative();
        } else {
            await captureVideoWeb();
        }
    };

    const handleSaveVideo = async () => {
        if (!videoBlobUrl) return;
        setIsSaving(true);
        setUploadError(null);

        try {
            let videoUrl = videoBlobUrl;

            // Try uploading to Supabase Storage if we have a real Blob  
            if (videoFile) {
                // Detect actual MIME type — native Android records .mp4, web records .webm
                const mimeType = videoFile.type || 'video/mp4';
                const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
                const fileName = `${address.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.${ext}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('location-videos')
                    .upload(fileName, videoFile, { contentType: mimeType, upsert: false });

                if (uploadError || !uploadData) {
                    setUploadError('Video upload failed: ' + (uploadError?.message || 'Server error.'));
                    setIsSaving(false);
                    return;
                }

                const { data: { publicUrl } } = supabase.storage.from('location-videos').getPublicUrl(uploadData.path);
                videoUrl = publicUrl;
            }

            // Ensure a delivery record exists for today
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const { data: existingDelivery } = await supabase
                .from('deliveries')
                .select('id')
                .eq('address', address)
                .eq('delivery_date', today);

            if (!existingDelivery || existingDelivery.length === 0) {
                await supabase.from('deliveries').insert([{ address, delivery_date: today }]);
            }

            const newVideo = { address, video_url: videoUrl, category };
            const { data, error } = await supabase.from('location_videos').insert([newVideo]).select();

            if (!error && data) {
                setVideos([data[0], ...videos]);
                setVideoBlobUrl(null);
                setVideoFile(null);
            } else {
                setUploadError('Failed to save video to database.');
            }
        } catch (err: any) {
            setUploadError('Upload failed: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Extras</h3>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                {uploadError && (
                    <div style={{ background: '#ff3b3020', color: '#ff3b30', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 14 }}>
                        {uploadError}
                    </div>
                )}

                {!videoBlobUrl && !isRecording && (
                    <>
                        <div className="videos-list">
                            {videos.length === 0 && photos.length === 0 ? (
                                <div className="empty-state">No media found. Be the first to add some!</div>
                            ) : (
                                <>
                                    {photos.map((p, i) => (
                                        <div key={`photo-${i}`} className="video-card" onClick={() => setPreviewPhotoUrl(p.photo_url)}>
                                            <img src={p.photo_url} alt={p.category} style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: 8 }} />
                                            <div className="video-category-tag">📷 {p.category}</div>
                                            {userEmail === 'joshua@rakaviti.com' && (
                                                <button
                                                    className="delete-media-btn"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm('Delete this photo?')) {
                                                            const { error } = await supabase.from('location_photos').delete().eq('id', p.id);
                                                            if (error) {
                                                                alert('Error deleting photo: ' + error.message);
                                                            } else {
                                                                setPhotos(prev => prev.filter(item => item.id !== p.id));
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                            {p.sign_data && p.sign_data.description && (
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 8px' }}>
                                                    ⚠️ {p.sign_data.description}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {videos.map((v, i) => (
                                        <div key={`video-${i}`} className="video-card">
                                            <video src={v.video_url} controls playsInline />
                                            <div className="video-category-tag">{v.category}</div>
                                            {userEmail === 'joshua@rakaviti.com' && (
                                                <button
                                                    className="delete-media-btn"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm('Delete this video?')) {
                                                            const { error } = await supabase.from('location_videos').delete().eq('id', v.id);
                                                            if (error) {
                                                                alert('Error deleting video: ' + error.message);
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
                                    ))}
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="action-btn primary" onClick={startRecording} style={{ flex: 1 }}>
                                <Video size={18} /> Video
                            </button>
                            <button className="action-btn primary" onClick={() => photoInputRef.current?.click()} style={{ flex: 1 }}>
                                <Camera size={18} /> Photo
                            </button>
                        </div>
                        {isAnalyzing && (
                            <div style={{ textAlign: 'center', color: 'var(--primary-action)', fontSize: 13, marginTop: 8 }}>
                                🔍 Analyzing sign...
                            </div>
                        )}
                        {/* Hidden file input for native video capture */}
                        <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={handleVideoFileSelected}
                        />
                        {/* Hidden file input for photo capture */}
                        <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (photoInputRef.current) photoInputRef.current.value = '';

                                setUploadError(null);
                                setIsAnalyzing(true);

                                try {
                                    // Read as base64 for Gemini analysis
                                    const reader = new FileReader();
                                    const base64Promise = new Promise<string>((resolve) => {
                                        reader.onload = (ev) => resolve((ev.target?.result as string).split(',')[1]);
                                        reader.readAsDataURL(file);
                                    });
                                    const base64 = await base64Promise;

                                    // Upload to Supabase Storage
                                    const fileName = `${address.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.jpg`;
                                    let photoUrl = URL.createObjectURL(file);

                                    const { data: uploadData, error: upErr } = await supabase.storage
                                        .from('location-photos')
                                        .upload(fileName, file, { contentType: file.type || 'image/jpeg', upsert: false });

                                    if (upErr || !uploadData) {
                                        setUploadError('Photo upload failed: ' + (upErr?.message || 'Server error.'));
                                        setIsAnalyzing(false);
                                        return;
                                    }

                                    const { data: { publicUrl } } = supabase.storage.from('location-photos').getPublicUrl(uploadData.path);
                                    photoUrl = publicUrl;

                                    // Analyze sign with Gemini Vision
                                    const signData = await analyzeSignPhoto(base64, file.type || 'image/jpeg');

                                    // Ensure delivery record exists
                                    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                                    const { data: existing } = await supabase.from('deliveries').select('id').eq('address', address).eq('delivery_date', today);
                                    if (!existing || existing.length === 0) {
                                        await supabase.from('deliveries').insert([{ address, delivery_date: today }]);
                                    }

                                    // Save photo record
                                    const photoRecord = {
                                        address,
                                        photo_url: photoUrl,
                                        category: signData?.category || 'other',
                                        sign_data: signData || null,
                                    };
                                    const { data, error } = await supabase.from('location_photos').insert([photoRecord]).select();
                                    if (!error && data) {
                                        setPhotos([data[0], ...photos]);
                                    } else {
                                        setUploadError('Failed to save photo.');
                                    }
                                } catch (err: any) {
                                    console.error('Photo capture failed:', err);
                                    setUploadError('Photo capture failed: ' + err.message);
                                } finally {
                                    setIsAnalyzing(false);
                                }
                            }}
                        />
                    </>
                )}

                {(isRecording || videoBlobUrl) && (
                    <div className="record-container">
                        <div className="video-card" style={{ width: '100%', height: '300px' }}>
                            {videoBlobUrl ? (
                                <video src={videoBlobUrl} controls autoPlay loop playsInline style={{ width: '100%', height: '100%' }} />
                            ) : (
                                <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%' }} />
                            )}
                        </div>

                        {isRecording ? (
                            <div className="record-status">
                                <div className="record-btn recording" />
                                <p style={{ textAlign: 'center', color: '#ff3b30', fontWeight: 'bold' }}>Recording... (Max 10s)</p>
                            </div>
                        ) : (
                            <div className="save-video-container" style={{ width: '100%' }}>
                                <h4>Categorize Video</h4>
                                <div className="category-select">
                                    {['Parking', 'Directions', 'Watch out'].map(cat => (
                                        <button key={cat} className={`cat-btn ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                                    <button className="action-btn" onClick={() => { setVideoBlobUrl(null); setVideoFile(null); startRecording(); }}>Retake</button>
                                    <button className="action-btn primary" onClick={handleSaveVideo} disabled={isSaving}>
                                        {isSaving ? 'Saving...' : 'Save Video'}
                                    </button>
                                </div>
                            </div>
                        )}
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

// --- CAIRN TYPES ---
interface Cairn {
    id: string;
    lat: number;
    lng: number;
    category: 'parking' | 'toilet' | 'food' | 'loading_zone' | 'eating_spot' | 'clearway' | 'school_zone';
    raw_note: string;
    gate_code: string;
}

const CAIRN_CATEGORIES = [
    { key: 'toilet', label: 'Public Toilet', icon: '🚾' },
    { key: 'parking', label: 'Parking', icon: '🅿️' },
    { key: 'food', label: 'Coffee / Food', icon: '☕' },
    { key: 'loading_zone', label: 'Loading Zone', icon: '🚚' },
    { key: 'eating_spot', label: 'Eating Spot', icon: '🍕' },
] as const;

const renderCairnIconDataUri = (category: string) => {
    if (category === 'loading_zone') {
        const svg = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="2" width="14" height="28" rx="1.5" fill="white" stroke="#666" stroke-width="0.5"/>
            <rect x="10.5" y="4" width="11" height="8" rx="0.5" fill="#FF3B30"/>
            <!-- Simplified Loading Zone Text shapes -->
            <rect x="12" y="6" width="8" height="1.2" rx="0.2" fill="white"/>
            <rect x="12" y="8.5" width="8" height="1.2" rx="0.2" fill="white"/>
            <!-- Red Double-ended Arrow -->
            <path d="M11.5 24.5 h 9" stroke="#FF3B30" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M11.5 24.5 l 2-2 M11.5 24.5 l 2 2" stroke="#FF3B30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20.5 24.5 l -2-2 M20.5 24.5 l -2 2" stroke="#FF3B30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }

    let bgColor = '#666';
    let svgIcon = '';

    switch (category) {
        case 'parking':
            bgColor = '#34A853';
            svgIcon = '<path d="M10 8h4a4 4 0 1 1 0 8h-4v6M10 8v8" stroke="white" stroke-width="2.5" stroke-linecap="round"/>';
            break;
        case 'toilet':
            bgColor = '#4285F4';
            svgIcon = `
                <g transform="translate(6, 6) scale(0.0390625)" fill="white">
                    <path d="M146.645,109.31c-54.918,0-55.673,0-101.357,0c-24.466,0-44.468,19.904-44.591,44.367L0,292.109c-0.052,10.407,8.342,18.885,18.747,18.938c0.032,0,0.065,0,0.098,0c10.363,0,18.787-8.375,18.841-18.747l0.696-138.432c0-0.016,0-0.031,0-0.047c0.024-2.055,1.704-3.706,3.759-3.694c2.055,0.012,3.715,1.683,3.715,3.738l0.008,316.757c0,12.488,10.124,22.612,22.612,22.612s22.612-10.124,22.612-22.612V289.888h9.763v180.734c0,12.488,10.123,22.611,22.611,22.611s22.611-10.123,22.611-22.611c0-298.894-0.4-127.966-0.41-316.481c0-2.121,1.674-3.863,3.794-3.946c2.12-0.083,3.928,1.521,4.092,3.635c0,0.001,0,0.002,0,0.002l-0.128,138.354c-0.01,10.406,8.419,18.851,18.825,18.861c0.007,0,0.011,0,0.018,0c10.397,0,18.833-8.426,18.842-18.825l0.128-138.431c0.002-0.039,0.002-0.075,0.001-0.114C191.112,129.214,171.109,109.31,146.645,109.31z"/>
                    <circle cx="95.966" cy="57.813" r="39.047"/>
                    <path d="M510.941,262.849c-0.346-0.986-34.611-98.717-40.002-114.406c-8.679-25.253-23.23-38.057-43.249-38.057c-28.025,0-37.18,0-65.153,0c-20.02,0-34.571,12.805-43.249,38.057c-5.391,15.688-39.656,113.421-40.002,114.406c-3.418,9.748,1.714,20.423,11.464,23.841c9.758,3.42,20.425-1.725,23.84-11.462c1.106-3.154,21.721-60.433,33.222-93.389c-1.204,9.838,2.264-10.578-26.737,139.154c-1.246,6.431,3.711,12.379,10.201,12.379c4.029,0,8.862,0,14.273,0v135.678c0,12.396,10.049,22.446,22.446,22.446c12.397,0,22.446-10.049,22.446-22.446v-135.68c3.227,0,6.465,0,9.692,0v135.68c0,12.396,10.049,22.446,22.446,22.446c12.397,0,22.446-10.049,22.446-22.446v-135.68c5.411,0,10.245,0,14.273,0c6.522,0,11.446-5.952,10.201-12.379c-28.737-148.369-25.57-131.138-26.55-139.154c11.593,33.211,31.602,90.284,32.691,93.389c3.421,9.756,14.101,14.878,23.84,11.462C509.227,283.27,514.359,272.597,510.941,262.849z"/>
                    <circle cx="395.283" cy="59.265" r="38.767"/>
                    <path d="M239.761,43.925c-7.969,0-14.43,6.46-14.43,14.43v395.282c0,7.969,6.46,14.429,14.43,14.429c7.97,0,14.43-6.459,14.43-14.429V58.355C254.191,50.385,247.73,43.925,239.761,43.925z"/>
                </g>
            `;
            break;
        case 'food':
            bgColor = '#EA4335';
            svgIcon = '<path d="M12 8c-2 0-3 1-3 3v5c0 1 1 2 2 2h4c1 0 2-1 2-2v-5c0-2-1-3-3-3h-2z M19 11h1c1 0 2 1 2 2s-1 2-2 2h-1" stroke="white" stroke-width="2" stroke-linecap="round"/>';
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

const renderCairnIcon = (category: string) => {
    switch (category) {
        case 'parking': return <span style={{ fontSize: '20px' }}>🅿️</span>;
        case 'toilet':
            return (
                <svg width="20" height="20" viewBox="0 0 512 512" fill="currentColor">
                    <path d="M146.645,109.31c-54.918,0-55.673,0-101.357,0c-24.466,0-44.468,19.904-44.591,44.367L0,292.109c-0.052,10.407,8.342,18.885,18.747,18.938c0.032,0,0.065,0,0.098,0c10.363,0,18.787-8.375,18.841-18.747l0.696-138.432c0-0.016,0-0.031,0-0.047c0.024-2.055,1.704-3.706,3.759-3.694c2.055,0.012,3.715,1.683,3.715,3.738l0.008,316.757c0,12.488,10.124,22.612,22.612,22.612s22.612-10.124,22.612-22.612V289.888h9.763v180.734c0,12.488,10.123,22.611,22.611,22.611s22.611-10.123,22.611-22.611c0-298.894-0.4-127.966-0.41-316.481c0-2.121,1.674-3.863,3.794-3.946c2.12-0.083,3.928,1.521,4.092,3.635c0,0.001,0,0.002,0,0.002l-0.128,138.354c-0.01,10.406,8.419,18.851,18.825,18.861c0.007,0,0.011,0,0.018,0c10.397,0,18.833-8.426,18.842-18.825l0.128-138.431c0.002-0.039,0.002-0.075,0.001-0.114C191.112,129.214,171.109,109.31,146.645,109.31z" />
                    <circle cx="95.966" cy="57.813" r="39.047" />
                    <path d="M510.941,262.849c-0.346-0.986-34.611-98.717-40.002-114.406c-8.679-25.253-23.23-38.057-43.249-38.057c-28.025,0-37.18,0-65.153,0c-20.02,0-34.571,12.805-43.249,38.057c-5.391,15.688-39.656,113.421-40.002,114.406c-3.418,9.748,1.714,20.423,11.464,23.841c9.758,3.42,20.425-1.725,23.84-11.462c1.106-3.154,21.721-60.433,33.222-93.389c-1.204,9.838,2.264-10.578-26.737,139.154c-1.246,6.431,3.711,12.379,10.201,12.379c4.029,0,8.862,0,14.273,0v135.678c0,12.396,10.049,22.446,22.446,22.446c12.397,0,22.446-10.049,22.446-22.446v-135.68c3.227,0,6.465,0,9.692,0v135.68c0,12.396,10.049,22.446,22.446,22.446c12.397,0,22.446-10.049,22.446-22.446v-135.68c5.411,0,10.245,0,14.273,0c6.522,0,11.446-5.952,10.201-12.379c-28.737-148.369-25.57-131.138-26.55-139.154c11.593,33.211,31.602,90.284,32.691,93.389c3.421,9.756,14.101,14.878,23.84,11.462C509.227,283.27,514.359,272.597,510.941,262.849z" />
                    <circle cx="395.283" cy="59.265" r="38.767" />
                    <path d="M239.761,43.925c-7.969,0-14.43,6.46-14.43,14.43v395.282c0,7.969,6.46,14.429,14.43,14.429c7.97,0,14.43-6.459,14.43-14.429V58.355C254.191,50.385,247.73,43.925,239.761,43.925z" />
                </svg>
            );
        case 'food': return <Coffee size={20} color="#8D6E63" />;
        case 'loading_zone': return <span style={{ fontSize: '20px' }}>🚚</span>;
        case 'eating_spot': return <span style={{ fontSize: '20px' }}>🍕</span>;
        case 'clearway': return <span style={{ fontSize: '20px' }}>🚫</span>;
        case 'school_zone': return <span style={{ fontSize: '20px' }}>🏫</span>;
        default: return <MapPin size={20} color="gray" />;
    }
};

// --- ADD CAIRN MODAL ---
const AddCairnModal = ({ lat, lng, onClose, onSaved }: { lat: number, lng: number, onClose: () => void, onSaved: (cairn: Cairn | null, error?: string) => void }) => {
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
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Add Point of Interest</h3>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>Dropping pin at your current location</p>
                <div className="category-select" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {CAIRN_CATEGORIES.map(cat => (
                        <button
                            key={cat.key}
                            className={`cat-btn ${category === cat.key ? 'active' : ''}`}
                            onClick={() => setCategory(cat.key)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <span>{cat.icon}</span> {cat.label}
                        </button>
                    ))}
                </div>
                <textarea
                    className="input-field"
                    placeholder="Optional note (e.g. 'Behind the petrol station')"
                    rows={2}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                />
                <button className="action-btn primary" onClick={handleSave} disabled={saving} style={{ marginTop: 8, width: '100%' }}>
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>
        </div>
    );
};

const AddHazardModal = ({ lat, lng, onClose, onSaved }: { lat: number, lng: number, onClose: () => void, onSaved: (hazard: any | null, error?: string) => void }) => {
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
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AlertTriangle size={24} color="#ff3b30" />
                        <h3 style={{ margin: 0 }}>Report Hazard</h3>
                    </div>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>Share a road restriction at your location</p>

                <div className="category-select" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {HAZARD_TYPES.map(type => (
                        <button
                            key={type.key}
                            className={`cat-btn ${restrictionType === type.key ? 'active' : ''}`}
                            onClick={() => setRestrictionType(type.key)}
                            style={{
                                background: restrictionType === type.key ? '#ff3b30' : 'var(--bg-main)',
                                borderColor: restrictionType === type.key ? '#ff3b30' : 'var(--border-subtle)',
                                color: restrictionType === type.key ? 'white' : 'var(--text-main)',
                            }}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Street Name (Optional)</label>
                    <input
                        className="input-field"
                        value={streetName}
                        onChange={e => setStreetName(e.target.value)}
                        placeholder="e.g. Montague St"
                    />
                </div>

                {(restrictionType === 'low_bridge') && (
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Max Height Clearance (meters)</label>
                        <input
                            className="input-field"
                            type="number"
                            step="0.1"
                            value={maxHeight}
                            onChange={e => setMaxHeight(e.target.value)}
                            placeholder="e.g. 3.2"
                        />
                    </div>
                )}

                {(restrictionType === 'weight_limit') && (
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Max Weight Limit (tonnes)</label>
                        <input
                            className="input-field"
                            type="number"
                            step="0.1"
                            value={maxWeight}
                            onChange={e => setMaxWeight(e.target.value)}
                            placeholder="e.g. 15.0"
                        />
                    </div>
                )}

                <button
                    className="action-btn primary"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ background: '#ff3b30', borderColor: '#ff3b30', marginTop: 8, width: '100%', justifyContent: 'center' }}
                >
                    {saving ? 'Reporting...' : 'Publish Hazard Report'}
                </button>
            </div>
        </div>
    );
};

// --- MAP & EXPLORE SCREEN ---

const ExploreInner = ({ userLocation, persistedDestination, initialCenter, onRouteComputed, isDarkMode, cairns, onCairnClick, googlePlaces, onPlaceClick, mapRefSetter, setIsDrifted, routeStops, onPoiClick }: any) => {
    const map = useMap();
    const routesLibrary = useMapsLibrary('routes');

    useEffect(() => {
        if (map && mapRefSetter) {
            mapRefSetter(map);
        }
    }, [map, mapRefSetter]);

    const [directionsService, setDirectionsService] = useState<any>();
    const [directionsRenderer, setDirectionsRenderer] = useState<any>();
    const hasCenteredRef = useRef(false);

    // Send states back up to parent
    useEffect(() => {
        if (!routesLibrary || !map) return;
        setDirectionsService(new routesLibrary.DirectionsService());
        setDirectionsRenderer(new routesLibrary.DirectionsRenderer({
            suppressMarkers: false,
            polylineOptions: { strokeColor: '#5382ED', strokeWeight: 6 } // Distinct blue google maps route color
        }));
    }, [routesLibrary, map]);

    useEffect(() => {
        if (!directionsRenderer || !map) return;
        directionsRenderer.setMap(map);
    }, [directionsRenderer, map]);

    // Center map on user location when it first becomes available
    useEffect(() => {
        if (!map || !userLocation || hasCenteredRef.current || persistedDestination) return;
        map.panTo(userLocation);
        map.setZoom(18);
        hasCenteredRef.current = true;
    }, [map, userLocation, persistedDestination]);

    useEffect(() => {
        if (!directionsService || !directionsRenderer || !persistedDestination || !userLocation) {
            if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
            onRouteComputed({ driving: null, walking: null });
            return;
        }

        const fetchRoute = async (travelMode: string) => {
            try {
                const response = await directionsService.route({
                    origin: { lat: userLocation.lat, lng: userLocation.lng },
                    destination: persistedDestination.formatted_address || persistedDestination.name,
                    travelMode: travelMode
                });
                return response;
            } catch (e) {
                console.error("Directions failed for", travelMode, e);
                return null;
            }
        };

        const computeAll = async () => {
            const drRoute = await fetchRoute((window as any).google.maps.TravelMode.DRIVING);
            const wkRoute = await fetchRoute((window as any).google.maps.TravelMode.WALKING);

            // Only strictly draw the driving route on the UI
            if (drRoute) directionsRenderer.setDirections(drRoute);

            onRouteComputed({
                driving: drRoute ? { distance: drRoute.routes[0].legs[0].distance.text, duration: drRoute.routes[0].legs[0].duration.text } : null,
                walking: wkRoute ? { distance: wkRoute.routes[0].legs[0].distance.text, duration: wkRoute.routes[0].legs[0].duration.text } : null,
            });

            // Focus map on route bounds if found
            if (drRoute && map) map.fitBounds(drRoute.routes[0].bounds);
        };

        computeAll();
    }, [directionsService, directionsRenderer, persistedDestination, userLocation, map]);

    return (
        <>
            <Map
                defaultZoom={18}
                defaultCenter={userLocation || initialCenter}
                disableDefaultUI={true}
                gestureHandling={'greedy'}
                styles={(isDarkMode ? darkMapStyle : silverMapStyle) as any}
                onClick={(ev: any) => {
                    if (ev.detail.placeId) {
                        ev.stop();
                        onPoiClick?.(ev.detail.placeId);
                    }
                }}
                onCameraChanged={(ev) => {
                    const center = ev.detail.center;
                    if (userLocation) {
                        // Simple Pythagoras distance proxy for ~50m threshold
                        const dLat = center.lat - userLocation.lat;
                        const dLng = center.lng - userLocation.lng;
                        const distSq = dLat * dLat + dLng * dLng;

                        // Roughly 0.0005 degrees is ~50m
                        if (distSq > 0.00000025) {
                            setIsDrifted(true);
                            if (!window.sessionStorage.getItem('exploreMapDrifted')) {
                                window.sessionStorage.setItem('exploreMapDrifted', '1');
                            }
                        } else {
                            setIsDrifted(false);
                            window.sessionStorage.removeItem('exploreMapDrifted');
                        }
                    }
                }}
            >
                {userLocation && !persistedDestination && (
                    <Marker position={userLocation} zIndex={100} icon={{
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#4285F4" stroke="white" stroke-width="3"/></svg>'),
                        scaledSize: new (window as any).google.maps.Size(24, 24)
                    }} />
                )}
                {/* Cairn markers */}
                {cairns && cairns.filter((c: Cairn) => {
                    const activeFilter = window.sessionStorage.getItem('exploreMapFilter') || 'All';
                    if (activeFilter === 'All') return true;
                    if (activeFilter === 'Parking' && c.category === 'parking') return true;
                    if (activeFilter === 'Toilets' && c.category === 'toilet') return true;
                    if (activeFilter === 'Food' && (c.category === 'food' || c.category === 'eating_spot')) return true;
                    // Note: We don't have native "Fuel" cairns right now, handled by Google
                    return false;
                }).map((c: Cairn) => (
                    <Marker
                        key={`cairn-${c.id}`}
                        position={{ lat: c.lat, lng: c.lng }}
                        onClick={() => onCairnClick?.(c)}
                        icon={{
                            url: renderCairnIconDataUri(c.category),
                            scaledSize: new (window as any).google.maps.Size(32, 32),
                            anchor: new (window as any).google.maps.Point(16, 16)
                        }}
                    />
                ))}

                {/* Google Places markers */}
                {googlePlaces.map((place: any, i: number) => (
                    <Marker
                        key={`google-place-${i}`}
                        position={{ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() }}
                        onClick={() => onPlaceClick(place)}
                        icon={{
                            url: place.icon,
                            scaledSize: new (window as any).google.maps.Size(24, 24),
                            anchor: new (window as any).google.maps.Point(12, 12)
                        }}
                    />
                ))}

                {/* Global Run Markers */}
                {routeStops && routeStops.map((stop: any, i: number) => {
                    if (!stop.lat || !stop.lng) return null;
                    const label = String(i + 1);
                    const isCompleted = stop.status === 'completed';

                    const firstPendingIdx = routeStops.findIndex((s: any) => s.status !== 'completed');
                    const isCurrent = i === firstPendingIdx;

                    let markerColor = '%23000000'; // Black for future
                    if (isCompleted) {
                        markerColor = '%239E9E9E'; // Grey
                    } else if (isCurrent) {
                        markerColor = '%23FF9800'; // Orange
                    }

                    const svgIcon = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="16" cy="16" r="14" fill="${markerColor}" stroke="white" stroke-width="3"/>
                        <text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial">${label}</text>
                    </svg>`;
                    return (
                        <Marker
                            key={`run-stop-${i}`}
                            position={{ lat: stop.lat, lng: stop.lng }}
                            zIndex={40 + i}
                            icon={{
                                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgIcon),
                                scaledSize: new (window as any).google.maps.Size(32, 32),
                                anchor: new (window as any).google.maps.Point(16, 16)
                            }}
                        />
                    );
                })}
            </Map>
            {/* Recenter button moved to ExploreScreen for vertical column grouping */}
        </>
    );
};

interface ExploreScreenProps {
    persistedDestination: any;
    setPersistedDestination: (place: any) => void;
    isDarkMode: boolean;
    onNavStart: (label: string, fullAddress?: string, coords?: { lat: number, lng: number, placeId?: string }) => void;
    vehicleProfile?: any;
    routeStops?: any[];
    userEmail?: string | null;
    isMuted: boolean;
    setIsMuted: (muted: boolean) => void;
}

export const ExploreScreen: React.FC<ExploreScreenProps> = ({ persistedDestination, setPersistedDestination, isDarkMode, onNavStart, vehicleProfile, routeStops, userEmail, isMuted, setIsMuted }) => {
    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [routeInfo, setRouteInfo] = useState<{ driving: any, walking: any }>(() => {
        try {
            const stored = sessionStorage.getItem('robin_route_info');
            return stored ? JSON.parse(stored) : { driving: null, walking: null };
        } catch { return { driving: null, walking: null }; }
    });
    const [activeTab, setActiveTab] = useState<'driving' | 'walking'>(() => {
        return (sessionStorage.getItem('robin_explore_tab') as 'driving' | 'walking') || 'driving';
    });
    const [navError, setNavError] = useState<string | null>(null);
    const [navLoading, setNavLoading] = useState(false);
    const [geocodedStops, setGeocodedStops] = useState<any[]>([]);

    // Cairns state — POI markers visible on the Explore map
    const [cairns, setCairns] = useState<Cairn[]>([]);
    const [selectedCairn, setSelectedCairn] = useState<Cairn | null>(null);
    const [showAddCairn, setShowAddCairn] = useState(false);
    const [showAddHazard, setShowAddHazard] = useState(false);
    const [hazards, setHazards] = useState<any[]>([]);
    const [toastInfo, setToastInfo] = useState<{ headline: string, subtext?: string } | null>(null);

    // Filter Bar and Google Places State
    const [activeFilter, setActiveFilter] = useState('Explore');
    const [googlePlaces, setGooglePlaces] = useState<any[]>([]);
    const [selectedGooglePlace, setSelectedGooglePlace] = useState<any | null>(null);
    const [placesLoading, setPlacesLoading] = useState(false);
    const [showSearchThisArea, setShowSearchThisArea] = useState(false);
    const [isDrifted, setIsDrifted] = useState(false);
    const [selectedPoi, setSelectedPoi] = useState<any>(null);
    const [poiLoading, setPoiLoading] = useState(false);

    // We need a ref to the actual map instance to get bounds for Places API
    const [internalMap, setInternalMap] = useState<any>(null);
    const placesLibrary = useMapsLibrary('places');

    // Make Google Places Search API Call
    const fetchPlaces = useCallback((filterVal: string, currentMap: any, lib: any) => {
        if (!currentMap || !lib) return;

        const typeMap: Record<string, string[]> = {
            'Parking': ['parking'],
            'Servo': ['gas_station'],
            'Food': ['restaurant', 'cafe', 'bakery', 'meal_takeaway'],
            'Toilets': [] // We rely on Cairns for toilets mainly, but could add generic
        };

        const types = typeMap[filterVal];

        if (!types || types.length === 0) {
            setGooglePlaces([]);
            return;
        }

        setPlacesLoading(true);
        const service = new lib.PlacesService(currentMap);

        // We use the current map viewport bounds exactly
        const request: any = {
            bounds: currentMap.getBounds(),
            type: types[0] // Simple nearbySearch only takes one primary type well
        };

        if (filterVal === 'Servo') {
            request.keyword = 'petrol gas station fuel';
        }

        service.nearbySearch(request, (results: any, status: any) => {
            if (status === lib.PlacesServiceStatus.OK && results) {
                // If we have multiple types (e.g. food), we might need to filter or do multiple calls
                // but for MVP, relying on the first primary type is usually sufficient
                setGooglePlaces(results);
            } else {
                setGooglePlaces([]);
            }
            setPlacesLoading(false);
            setShowSearchThisArea(false);
        });
    }, []);

    // Restore nav-active class if navigation was already running when app resumes
    useEffect(() => {
        if (localStorage.getItem('nav-active') === '1' || sessionStorage.getItem('nav-active') === '1') {
            document.body.classList.add('native-nav-active');
            document.documentElement.classList.add('native-nav-active');
        }
    }, []);

    useEffect(() => {
        sessionStorage.setItem('robin_explore_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        sessionStorage.setItem('robin_route_info', JSON.stringify(routeInfo));
    }, [routeInfo]);

    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [showExtrasModal, setShowExtrasModal] = useState(false);
    const [showInteractiveStreetView, setShowInteractiveStreetView] = useState(false);

    // Use uncontrolled input — fixes Places Autocomplete lag/slowness on mobile
    const inputRef = useRef<HTMLInputElement>(null);
    const places = useMapsLibrary('places');

    const initialCenter = { lat: -33.8688, lng: 151.2093 };

    // Global Geocoding Effect for Run Markers
    useEffect(() => {
        if (!routeStops || routeStops.length === 0) {
            setGeocodedStops([]);
            return;
        }

        const resolveCoords = async () => {
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
                    } catch (e) {
                        console.warn(`Geocoding failed for ${stop.address}:`, e);
                    }
                }
            }
            if (changed) setGeocodedStops(resolved);
            else setGeocodedStops(routeStops);
        };

        resolveCoords();
    }, [routeStops]);

    useEffect(() => {
        const initData = async () => {
            try {
                // Fast initial fix — don't block on high accuracy GPS
                const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
                setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });

                // Then upgrade to high-accuracy in background
                Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
                    .then(pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
                    .catch(() => { }); // already have a fix, ignore failure
            } catch (err) {
                console.warn('Geolocation failed', err);
            }

            // Fetch cairns (POI markers)
            const { data: cairnsData } = await supabase.from('cairns').select('*');
            if (cairnsData) setCairns(cairnsData as Cairn[]);

            // Fetch hazards
            const { data: hazardsData } = await supabase.from('hazards').select('*');
            if (hazardsData) setHazards(hazardsData);
        };
        initData();
    }, []);

    // Center map on high accuracy update if the user hasn't manually drifted it
    useEffect(() => {
        if (internalMap && userLocation && !window.sessionStorage.getItem('exploreMapDrifted')) {
            internalMap.panTo(userLocation);
        }
    }, [userLocation, internalMap]);

    useEffect(() => {
        if (!places || !inputRef.current) return;
        const autocomplete = new places.Autocomplete(inputRef.current, {
            fields: ['geometry', 'formatted_address', 'name'],
            componentRestrictions: { country: 'au' }
        });

        // Dynamic location biasing to current map viewport
        if (internalMap) {
            autocomplete.bindTo('bounds', internalMap);
        } else if (userLocation) {
            // Initial bias if map not yet ready
            autocomplete.setOptions({
                locationBias: {
                    lat: userLocation.lat,
                    lng: userLocation.lng
                }
            });
        }

        const listener = autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry) {
                setPersistedDestination(place);
                // Update the uncontrolled input's value directly
                if (inputRef.current) {
                    inputRef.current.value = place.name || place.formatted_address || '';
                }
            }
        });

        return () => {
            (window as any).google.maps.event.removeListener(listener);
        };
    }, [places, setPersistedDestination, internalMap]);

    const handleClear = () => {
        setPersistedDestination(null);
        setRouteInfo({ driving: null, walking: null });
        sessionStorage.removeItem('robin_route_info');
        if (inputRef.current) inputRef.current.value = '';
        setSelectedCairn(null);
        setSelectedGooglePlace(null);
    };

    const handleStartNavigation = async () => {
        if (!persistedDestination || navLoading) return;
        setNavError(null);
        setNavLoading(true);

        let destLat = persistedDestination.geometry?.location?.lat;
        let destLng = persistedDestination.geometry?.location?.lng;
        if (typeof destLat === 'function') destLat = destLat();
        if (typeof destLng === 'function') destLng = destLng();

        if (!destLat || !destLng) {
            setNavError('Could not determine coordinates. Try re-searching the address.');
            setNavLoading(false);
            return;
        }

        try {
            await NavigationSDK.initialize();

            // Hazard Avoidance Check
            let waypoints: any[] = [];
            let hazardWarningText = "";
            if (vehicleProfile && hazards.length > 0) {
                const conflictingHazards = hazards.filter(h => {
                    const distToDest = Math.sqrt(Math.pow(h.lat - destLat, 2) + Math.pow(h.lng - destLng, 2));
                    if (distToDest > 0.01) return false;
                    if (h.restriction_type === 'low_bridge' && h.max_height && vehicleProfile.vehicle_height && vehicleProfile.vehicle_height > h.max_height) return true;
                    if (h.restriction_type === 'weight_limit' && h.max_weight && vehicleProfile.vehicle_weight && vehicleProfile.vehicle_weight > h.max_weight) return true;
                    return false;
                });

                if (conflictingHazards.length > 0) {
                    const h = conflictingHazards[0];
                    hazardWarningText = ` Warning! A ${h.restriction_type.replace('_', ' ')} is ahead. Your vehicle profile may conflict with this restriction. Rerouting to avoid.`;
                    waypoints = [{ lat: h.lat + 0.002, lng: h.lng + 0.002 }];
                }
            }

            await NavigationSDK.startGuidance({
                destination: persistedDestination.formatted_address || persistedDestination.name,
                placeId: persistedDestination.place_id,
                lat: destLat,
                lng: destLng,
                travelMode: 'DRIVING', // Always force DRIVING to prevent native SDK walking ETA bugs
                waypoints: waypoints.length > 0 ? waypoints : undefined
            });

            // Hand off to App.tsx — it shows the transparent nav overlay
            onNavStart(
                persistedDestination.name || persistedDestination.formatted_address?.split(',')[0] || 'Navigating', 
                persistedDestination.formatted_address || '',
                { lat: destLat, lng: destLng, placeId: persistedDestination.place_id }
            );

            // Voice Alert for hazard (delayed to prevent Google SDK overlap)
            if (hazardWarningText && Capacitor.isNativePlatform() && !isMuted) {
                setTimeout(() => {
                    NavigationSDK.speakText({ text: hazardWarningText }).catch(console.error);
                }, 5000);
            }
        } catch (err: any) {
            console.error('NavigationSDK failed:', err);
            setNavError('Navigation error: ' + (err?.message || 'Unknown SDK error.'));
        } finally {
            setNavLoading(false);
        }
    };

    const destName = persistedDestination ? (persistedDestination.name || persistedDestination.formatted_address.split(',')[0]) : '';
    const destLoc = persistedDestination?.geometry?.location;
    let streetViewUrl = '';

    if (destLoc) {
        let lat = typeof destLoc.lat === 'function' ? destLoc.lat() : destLoc.lat;
        let lng = typeof destLoc.lng === 'function' ? destLoc.lng() : destLoc.lng;
        streetViewUrl = getStreetViewUrl(lat, lng);
    }

    // Determine if search bar has typed content to show/hide clear button
    const [hasInput, setHasInput] = useState(false);

    return (
        <div className="explore-screen">
            <div className="explore-map-container">
                <ExploreInner
                    userLocation={userLocation}
                    persistedDestination={persistedDestination}
                    initialCenter={initialCenter}
                    onRouteComputed={(info: any) => setRouteInfo(info)}
                    isDarkMode={isDarkMode}
                    cairns={cairns}
                    onCairnClick={(c: Cairn) => { setSelectedCairn(c); setSelectedGooglePlace(null); }}
                    googlePlaces={googlePlaces}
                    onPlaceClick={(p: any) => { setSelectedGooglePlace(p); setSelectedCairn(null); }}
                    mapRefSetter={setInternalMap}
                    setIsDrifted={setIsDrifted}
                    isDrifted={isDrifted}
                    routeStops={geocodedStops}
                    onPoiClick={(placeId: string) => {
                        if (!internalMap || !placesLibrary) return;
                        setPoiLoading(true);
                        const service = new (placesLibrary as any).PlacesService(internalMap);
                        service.getDetails({
                            placeId,
                            fields: ['name', 'formatted_address', 'geometry', 'photos']
                        }, (place: any, status: any) => {
                            setPoiLoading(false);
                            if (status === (placesLibrary as any).PlacesServiceStatus.OK && place) {
                                setSelectedPoi(place);
                                setSelectedCairn(null);
                                setSelectedGooglePlace(null);
                            }
                        });
                    }}
                />
            </div>

            {/* "Search this area" Button when map drifts and filter is active */}
            {showSearchThisArea && activeFilter !== 'Explore' && !persistedDestination && (
                <button
                    onClick={() => fetchPlaces(activeFilter, internalMap, placesLibrary)}
                    style={{
                        position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)',
                        zIndex: 20, background: 'var(--bg-card)', color: 'var(--text-main)',
                        border: '1px solid var(--border-subtle)', borderRadius: 20,
                        padding: '8px 16px', fontSize: 14, fontWeight: 500,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6
                    }}
                >
                    {placesLoading ? <Loader size={16} className="spin" /> : <Search size={16} />}
                    {placesLoading ? 'Searching...' : 'Search this area'}
                </button>
            )}

            {/* Filter Bar */}
            {!persistedDestination && (
                <div className="filter-pill-bar">
                    {['Explore', 'Parking', 'Toilets', 'Food'].map(filter => (
                        <button
                            key={filter}
                            className={`filter-pill ${activeFilter === filter ? 'active' : ''}`}
                            onClick={() => {
                                setActiveFilter(filter);
                                window.sessionStorage.setItem('exploreMapFilter', filter);
                                if (filter === 'Explore') {
                                    setGooglePlaces([]);
                                    if (internalMap && userLocation) {
                                        internalMap.panTo(userLocation);
                                        internalMap.setZoom(18);
                                        setIsDrifted(false);
                                        window.sessionStorage.removeItem('exploreMapDrifted');
                                    }
                                }
                                // Trigger state update for descendants evaluating sessionStorage
                                setCairns([...cairns]);
                            }}
                            style={{
                                background: activeFilter === filter ? 'var(--primary-action)' : 'var(--bg-card)',
                                color: activeFilter === filter ? 'white' : 'var(--text-main)',
                                border: `1px solid ${activeFilter === filter ? 'var(--primary-action)' : 'var(--border-subtle)'}`,
                            }}
                        >
                            {filter}
                        </button>
                    ))}
                </div>
            )}

            <div className={`floating-search-bar ${!persistedDestination ? 'with-filters' : ''}`}>
                <Search size={20} color="#666" className="search-icon" />
                {/* Uncontrolled input — no value= prop, driven purely by ref.
                    This is essential for Places Autocomplete to work without lag on mobile. */}
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search destination..."
                    defaultValue={persistedDestination?.name || persistedDestination?.formatted_address || ''}
                    onChange={(e) => setHasInput(e.target.value.length > 0)}
                />
                {(hasInput || persistedDestination) && (
                    <button className="clear-search-btn" onClick={handleClear}>&times;</button>
                )}
            </div>

            {/* FAB — Add POI & Hazards */}


            {/* Selected cairn info card */}
            {selectedCairn && !persistedDestination && (
                <div className="cairn-info-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {renderCairnIcon(selectedCairn.category)}
                            <h3 style={{ margin: 0, textTransform: 'capitalize', fontSize: 16 }}>{selectedCairn.category.replace('_', ' ')}</h3>
                        </div>
                        <button onClick={() => setSelectedCairn(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-main)', cursor: 'pointer' }}>&times;</button>
                    </div>
                    {selectedCairn.raw_note && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>{selectedCairn.raw_note}</p>}

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="action-btn primary"
                            style={{ flex: 1, justifyContent: 'center' }}
                            onClick={() => {
                                const place = {
                                    name: selectedCairn.category.replace('_', ' '),
                                    formatted_address: selectedCairn.raw_note || 'POI Note',
                                    geometry: { location: { lat: selectedCairn.lat, lng: selectedCairn.lng } }
                                };
                                setPersistedDestination(place);
                                setSelectedCairn(null);
                            }}
                        >
                            <Navigation size={18} fill="white" /> Navigate
                        </button>

                        {userEmail === 'joshua@rakaviti.com' && (
                            <button
                                className="action-btn"
                                style={{
                                    width: 44,
                                    justifyContent: 'center',
                                    borderColor: '#ff3b30',
                                    background: 'rgba(255, 59, 48, 0.1)',
                                    padding: 0
                                }}
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (window.confirm('Delete this point of interest?')) {
                                        const { data, error } = await supabase.from('cairns').delete().eq('id', selectedCairn.id).select();
                                        if (error) {
                                            alert('Error deleting: ' + error.message);
                                        } else if (!data || data.length === 0) {
                                            alert('Deletion failed: You do not have permission to delete this item or the item does not exist. Your email: ' + (userEmail || 'Not logged in'));
                                        } else {
                                            setCairns(prev => prev.filter(c => c.id !== selectedCairn.id));
                                            setSelectedCairn(null);
                                        }
                                    }
                                }}
                                title="Delete POI"
                            >
                                <Trash2 size={18} color="#ff3b30" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Selected Google Place card */}
            {selectedGooglePlace && !persistedDestination && (
                <div className="cairn-info-card google-place-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: 18, color: 'var(--text-main)' }}>{selectedGooglePlace.name}</h3>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                {selectedGooglePlace.vicinity}
                            </p>
                            {selectedGooglePlace.rating && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>
                                    ★ {selectedGooglePlace.rating} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({selectedGooglePlace.user_ratings_total})</span>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setSelectedGooglePlace(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-main)', cursor: 'pointer' }}>&times;</button>
                    </div>

                    <button
                        className="action-btn primary"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => {
                            const place = {
                                name: selectedGooglePlace.name,
                                formatted_address: selectedGooglePlace.vicinity,
                                geometry: selectedGooglePlace.geometry
                            };
                            setPersistedDestination(place);
                            setSelectedGooglePlace(null);
                        }}
                    >
                        <Navigation size={18} fill="white" /> Navigate
                    </button>
                </div>
            )}

            {/* Custom POI Info Card */}
            {selectedPoi && !persistedDestination && (
                <div className="cairn-info-card google-place-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: 18, color: 'var(--text-main)' }}>{selectedPoi.name}</h3>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                {selectedPoi.formatted_address}
                            </p>
                        </div>
                        <button onClick={() => setSelectedPoi(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-main)', cursor: 'pointer', padding: '0 0 0 10px' }}>&times;</button>
                    </div>

                    {selectedPoi.photos && selectedPoi.photos.length > 0 && (
                        <div style={{ width: '100%', height: 140, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                            <img
                                src={selectedPoi.photos[0].getUrl({ maxWidth: 400 })}
                                alt={selectedPoi.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </div>
                    )}

                    <button
                        className="action-btn primary"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => {
                            setPersistedDestination(selectedPoi);
                            setSelectedPoi(null);
                        }}
                    >
                        <Navigation size={18} fill="white" /> Go there
                    </button>
                </div>
            )}

            {/* POI Loading Spinner */}
            {poiLoading && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 1000,
                    background: 'rgba(0,0,0,0.7)',
                    padding: 20,
                    borderRadius: 12,
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10
                }}>
                    <Loader size={30} className="spin" />
                    <span>Loading details...</span>
                </div>
            )}

            {persistedDestination && (
                <div className="explore-bottom-sheet">
                    <div className="sheet-handle"></div>

                    <div className="eta-tabs">
                        <div className={`eta-tab ${activeTab === 'driving' ? 'active' : ''}`} onClick={() => setActiveTab('driving')}>
                            <Car size={20} />
                            <span>{routeInfo.driving ? routeInfo.driving.duration : '...'}</span>
                        </div>
                        <div className={`eta-tab ${activeTab === 'walking' ? 'active' : ''}`} onClick={() => setActiveTab('walking')}>
                            <Footprints size={20} />
                            <span>{routeInfo.walking ? routeInfo.walking.duration : '...'}</span>
                        </div>
                    </div>

                    <div className="location-summary">
                        <div className="location-text">
                            <h2>{destName}</h2>
                            <p>{routeInfo[activeTab] ? `${routeInfo[activeTab].distance} via fastest route` : 'Calculating route...'}</p>
                        </div>
                        {streetViewUrl && destLoc && (
                            <div 
                                className="streetview-thumbnail" 
                                style={{ backgroundImage: `url(${streetViewUrl})`, cursor: 'pointer' }}
                                onClick={() => setShowInteractiveStreetView(true)}
                            >
                            </div>
                        )}
                    </div>

                    <div className="action-buttons-row">
                        <button
                            className="action-btn primary"
                            onClick={handleStartNavigation}
                            disabled={navLoading}
                            style={{ opacity: navLoading ? 0.7 : 1 }}
                        >
                            <Navigation size={20} fill="white" />
                            {navLoading ? 'Starting...' : 'Start'}
                        </button>
                        <button className="action-btn" onClick={() => setShowDeliveryModal(true)}>
                            <FileText size={20} color="var(--primary-action)" />
                            Delivery
                        </button>
                        <button className="action-btn" onClick={() => setShowExtrasModal(true)}>
                            <Video size={20} color="var(--primary-action)" />
                            Extras
                        </button>
                    </div>

                    <button
                        className="clear-destination-btn"
                        onClick={handleClear}
                    >
                        <X size={16} /> Clear Destination
                    </button>

                    {navError && (
                        <div style={{ color: '#ff3b30', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                            {navError}
                        </div>
                    )}
                </div>
            )}

            <div style={{
                position: 'fixed',
                bottom: persistedDestination ? 'calc(340px + env(safe-area-inset-bottom, 20px))' : '110px',
                right: '16px',
                display: 'flex',
                flexDirection: 'column-reverse',
                gap: '12px',
                zIndex: 100,
                alignItems: 'center',
                transition: 'bottom 0.3s ease-out'
            }}>
                <VoiceAssistantNode routeStops={routeStops || []} isStatic={true} isMuted={isMuted} />
                <button
                    className="add-poi-fab"
                    onClick={() => setIsMuted(!isMuted)}
                    title={isMuted ? "Unmute Navigation" : "Mute Navigation"}
                    style={{ background: isMuted ? '#ff3b30' : 'var(--primary-action)', width: '60px', height: '60px', borderRadius: '30px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                    {isMuted ? <VolumeX size={24} color="white" /> : <Volume2 size={24} color="white" />}
                </button>
                <button
                    className="add-poi-fab"
                    onClick={() => setShowAddHazard(true)}
                    title="Report Hazard"
                    style={{ background: '#ff3b30', width: '60px', height: '60px', borderRadius: '30px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                    <AlertTriangle size={24} color="white" />
                </button>

                <button
                    className="add-poi-fab"
                    onClick={() => setShowAddCairn(true)}
                    title="Add Point of Interest"
                    style={{ background: 'var(--primary-action)', width: '60px', height: '60px', borderRadius: '30px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                    <Plus size={28} color="white" />
                </button>

                {isDrifted && (
                    <button
                        className="add-poi-fab"
                        onClick={() => {
                            if (internalMap && userLocation) {
                                internalMap.panTo(userLocation);
                                internalMap.setZoom(18);
                                setIsDrifted(false);
                                window.sessionStorage.removeItem('exploreMapDrifted');
                            }
                        }}
                        title="Recenter Map"
                        style={{
                            background: 'var(--bg-card)',
                            width: '56px', height: '56px', borderRadius: '28px',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        <Navigation size={24} color="var(--primary-action)" fill="var(--primary-action)" />
                    </button>
                )}
            </div>

            {showDeliveryModal && persistedDestination && <DeliveryModal address={persistedDestination.formatted_address} onClose={() => setShowDeliveryModal(false)} />}
            {showExtrasModal && persistedDestination && <ExtrasModal address={persistedDestination.formatted_address} userEmail={userEmail} onClose={() => setShowExtrasModal(false)} />}
            {showAddCairn && userLocation && (
                <AddCairnModal
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
            )}

            {showAddHazard && userLocation && (
                <AddHazardModal
                    lat={userLocation.lat}
                    lng={userLocation.lng}
                    onClose={() => setShowAddHazard(false)}
                    onSaved={(hazard, err) => {
                        if (err) {
                            setToastInfo({ headline: 'Failed to Report', subtext: err });
                        } else if (hazard) {
                            setHazards(prev => [hazard, ...prev]);
                            setToastInfo({ headline: 'Hazard Reported', subtext: 'Warning shared with Robin network' });
                        }
                    }}
                />
            )}

            {showInteractiveStreetView && destLoc && (
                <StreetViewWrapper
                    lat={typeof destLoc.lat === 'function' ? destLoc.lat() : destLoc.lat}
                    lng={typeof destLoc.lng === 'function' ? destLoc.lng() : destLoc.lng}
                    onClose={() => setShowInteractiveStreetView(false)}
                    isFullscreen={true}
                />
            )}

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
