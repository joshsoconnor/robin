import React, { useState, useEffect } from 'react';
import { ArrivalPanel } from './ArrivalPanel';
import { Search, Key, Copy, Check, MapPin, Coffee, AlertTriangle, Video, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './IntelligenceFeed.css';

interface IntelItem {
    id: string;
    type: 'cairn' | 'hazard';
    category: string;
    note: string;
    lat: number;
    lng: number;
    gate_code?: string;
    created_at: string;
    metadata?: any;
}

interface IntelligenceFeedProps {
    userEmail?: string | null;
    activeAddress?: string | null;
}

export const IntelligenceFeed: React.FC<IntelligenceFeedProps> = ({ userEmail, activeAddress }) => {
    const [activeFilter, setActiveFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [intelItems, setIntelItems] = useState<IntelItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showAddIntel, setShowAddIntel] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const unifiedItems: IntelItem[] = [];

                // 1. Fetch Cairns
                const { data: cairns, error: cairnsError } = await supabase
                    .from('cairns')
                    .select('*');

                // 2. Fetch Hazards
                const { data: hazards, error: hazardsError } = await supabase
                    .from('hazards')
                    .select('*');

                if (cairnsError) console.error('Cairns fetch error:', cairnsError);
                if (hazardsError) console.error('Hazards fetch error:', hazardsError);

                if (cairns) {
                    cairns.forEach(c => unifiedItems.push({
                        id: c.id,
                        type: 'cairn',
                        category: c.category,
                        note: c.raw_note || '',
                        lat: c.lat,
                        lng: c.lng,
                        gate_code: c.gate_code,
                        created_at: c.created_at,
                        metadata: c
                    }));
                }

                if (hazards) {
                    hazards.forEach(h => unifiedItems.push({
                        id: h.id,
                        type: 'hazard',
                        category: h.restriction_type,
                        note: h.street_name ? `Hazard at ${h.street_name}` : 'Road restriction',
                        lat: h.lat,
                        lng: h.lng,
                        created_at: h.created_at,
                        metadata: h
                    }));
                }

                // 3. If we have an active address, fetch address-specific intel
                if (activeAddress) {
                    const cleanAddress = activeAddress.trim();

                    // Fetch Notes for this address
                    const { data: addrNotes } = await supabase
                        .from('location_notes')
                        .select('*')
                        .eq('address', cleanAddress);

                    if (addrNotes) {
                        addrNotes.forEach(n => unifiedItems.push({
                            id: n.id,
                            type: 'cairn', // Treating address notes as a "site instruction" cairn
                            category: 'parking',
                            note: n.delivery_notes || n.parking_instructions || 'Site Instruction',
                            lat: 0, lng: 0, // No specific coords for the note itself
                            created_at: n.created_at,
                            metadata: { ...n, isAddressIntel: true }
                        }));
                    }

                    // Fetch Photos for this address
                    const { data: addrPhotos } = await supabase
                        .from('location_photos')
                        .select('*')
                        .eq('address', cleanAddress);

                    if (addrPhotos) {
                        addrPhotos.forEach(p => unifiedItems.push({
                            id: p.id,
                            type: 'cairn',
                            category: 'delivery',
                            note: 'Site Photo',
                            lat: 0, lng: 0,
                            created_at: p.created_at,
                            metadata: { ...p, isAddressIntel: true, isPhoto: true }
                        }));
                    }

                    // Fetch Videos for this address
                    const { data: addrVideos } = await supabase
                        .from('location_videos')
                        .select('*')
                        .eq('address', cleanAddress);

                    if (addrVideos) {
                        if (addrVideos.length > 0) {
                            addrVideos.forEach(v => unifiedItems.push({
                                id: v.id,
                                type: 'cairn',
                                category: 'delivery',
                                note: 'Site Video',
                                lat: 0, lng: 0,
                                created_at: v.created_at,
                                metadata: { ...v, isAddressIntel: true, isVideo: true }
                            }));
                        }
                    }
                }

                // Sort by date newest first
                unifiedItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setIntelItems(unifiedItems);
            } catch (err) {
                console.error('Failed to fetch intel data', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const filters = ['All', 'Cairns', 'Hazards', 'Parking', 'Toilets'];

    const handleCopy = (code: string, id: string) => {
        navigator.clipboard.writeText(code);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDelete = async (id: string, type: 'cairn' | 'hazard') => {
        if (!window.confirm('Are you sure you want to delete this intelligence?')) return;

        const table = type === 'cairn' ? 'cairns' : 'hazards';
        const { data, error } = await supabase.from(table).delete().eq('id', id).select();

        if (error) {
            alert('Error deleting: ' + error.message);
        } else if (!data || data.length === 0) {
            alert('Deletion failed: Permission denied for ' + table + '. Your email: ' + (userEmail || 'Not logged in'));
        } else {
            setIntelItems(prev => prev.filter(item => item.id !== id));
        }
    };

    const filteredItems = intelItems.filter(item => {
        // Filter by tab
        if (activeFilter === 'Cairns' && item.type !== 'cairn') return false;
        if (activeFilter === 'Hazards' && item.type !== 'hazard') return false;
        if (activeFilter === 'Parking' && item.category !== 'parking') return false;
        if (activeFilter === 'Toilets' && item.category !== 'toilet') return false;

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (
                item.note.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query) ||
                (item.gate_code && item.gate_code.toLowerCase().includes(query))
            );
        }

        return true;
    });

    const renderIcon = (item: IntelItem) => {
        if (item.type === 'hazard') return <AlertTriangle size={18} color="#ff3b30" />;
        switch (item.category) {
            case 'parking': return <MapPin size={18} color="var(--primary-action)" />;
            case 'toilet': return <span style={{ fontSize: 18 }}>🚾</span>;
            case 'food': return <Coffee size={18} color="#8D6E63" />;
            case 'loading_zone':
                return (
                    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="9" y="2" width="14" height="28" rx="1.5" fill="white" stroke="#666" stroke-width="0.5" />
                        <rect x="10.5" y="4" width="11" height="8" rx="0.5" fill="#FF3B30" />
                        <rect x="12" y="6" width="8" height="1.2" rx="0.2" fill="white" />
                        <rect x="12" y="8.5" width="8" height="1.2" rx="0.2" fill="white" />
                        <path d="M11.5 24.5 h 9" stroke="#FF3B30" stroke-width="1.5" stroke-linecap="round" />
                        <path d="M11.5 24.5 l 2-2 M11.5 24.5 l 2 2" stroke="#FF3B30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M20.5 24.5 l -2-2 M20.5 24.5 l -2 2" stroke="#FF3B30" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                );
            case 'delivery':
                if (item.metadata?.isVideo) return <Video size={18} color="#FF3B30" />;
                return <MapPin size={18} color="#FF9500" />;
            default: return <MapPin size={18} color="var(--text-tertiary)" />;
        }
    };

    // Filter Logic:
    // If we have an active address AND no manual search/tab filtering, show only that address intel.
    const isNavigationActive = !!activeAddress && activeFilter === 'All' && !searchQuery;

    return (
        <div className="intelligence-feed">
            <header className="intelligence-header">
                <h1>Intelligence</h1>
            </header>
            <div className="search-header">
                <div className="search-bar">
                    <Search size={20} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search Intel..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="filters-container">
                {filters.map((filter) => (
                    <button
                        key={filter}
                        className={`filter-pill ${activeFilter === filter ? 'active' : ''}`}
                        onClick={() => setActiveFilter(filter)}
                    >
                        {filter}
                    </button>
                ))}
            </div>

            <div className="feed-content">
                {isNavigationActive && (
                    <div style={{ padding: '0 20px 16px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary-action)', fontSize: 13, fontWeight: 600, letterSpacing: '0.5px' }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-action)', animation: 'pulse 2s infinite' }} />
                                    SHOWING INTEL FOR CURRENT DESTINATION
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{activeAddress.split(',')[0]}</div>
                            </div>
                            <button
                                onClick={() => setShowAddIntel(!showAddIntel)}
                                className={`add-intel-toggle ${showAddIntel ? 'active' : ''}`}
                                style={{
                                    background: showAddIntel ? 'var(--bg-main)' : 'var(--primary-action)',
                                    color: showAddIntel ? 'var(--text-main)' : 'white',
                                    border: 'none', borderRadius: 20, padding: '8px 14px',
                                    fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                                    boxShadow: '0 2px 8px rgba(230, 92, 62, 0.2)'
                                }}
                            >
                                {showAddIntel ? <X size={16} /> : <Plus size={16} />}
                                {showAddIntel ? 'Close' : 'Add Intel'}
                            </button>
                        </div>

                        {showAddIntel && (
                            <div style={{ marginTop: 16, animation: 'slideDown 0.3s ease-out' }}>
                                <ArrivalPanel
                                    address={activeAddress}
                                    userEmail={userEmail}
                                    isAddOnly={true}
                                />
                            </div>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="empty-state">Loading intelligence...</div>
                ) : filteredItems.length === 0 ? (
                    <div className="empty-state">
                        {isNavigationActive
                            ? "No specific intel for this address yet. Tap 'All' to see global history."
                            : "No intel found for this search."
                        }
                    </div>
                ) : (
                    filteredItems
                        .filter(item => {
                            // If navigation is active, strictly only show address-specific intel
                            if (isNavigationActive) {
                                return item.metadata?.isAddressIntel;
                            }
                            return true;
                        })
                        .map((item) => (
                            <div key={item.id} className={`intel-card ${item.type}-card ${item.metadata?.isAddressIntel ? 'active-dest-card' : ''}`}>
                                <div className="card-header">
                                    <div className="header-icon">
                                        {renderIcon(item)}
                                    </div>
                                    <div className="header-text">
                                        <span className="location-name">{item.category.replace('_', ' ')}</span>
                                        {item.type === 'hazard' && <span className="hazard-badge">HAZARD</span>}
                                        {item.metadata?.isAddressIntel && <span className="dest-badge">DESTINATION</span>}
                                    </div>
                                    <div style={{ flex: 1 }}></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span className="time-ago">{new Date(item.created_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })}</span>
                                        {userEmail === 'joshua@rakaviti.com' && (
                                            <button
                                                onClick={() => handleDelete(item.id, item.type)}
                                                style={{
                                                    background: 'none', border: 'none', padding: '4px',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                                    color: '#ff3b30', opacity: 0.8
                                                }}
                                                title="Delete Intel"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="intel-note">
                                    {item.note}
                                </div>

                                {item.metadata?.isPhoto && (
                                    <div className="intel-media-preview">
                                        <img src={item.metadata.photo_url} alt="Site" />
                                    </div>
                                )}

                                {item.metadata?.isVideo && (
                                    <div className="intel-media-preview">
                                        <video
                                            src={item.metadata.video_url}
                                            controls
                                            style={{ width: '100%', borderRadius: 12, marginTop: 8 }}
                                        />
                                    </div>
                                )}

                                {item.gate_code && (
                                    <div className="gate-content">
                                        <div className="gate-info">
                                            <Key size={14} className="gate-icon" />
                                            <span className="gate-code">{item.gate_code}</span>
                                        </div>
                                        <button className="copy-btn-small" onClick={() => handleCopy(item.gate_code!, item.id)}>
                                            {copiedId === item.id ? <Check size={16} color="white" /> : <Copy size={16} color="white" />}
                                        </button>
                                    </div>
                                )}

                                {item.type === 'hazard' && item.metadata?.max_height && (
                                    <div className="hazard-detail">
                                        Max Height: <strong>{item.metadata.max_height}m</strong>
                                    </div>
                                )}
                            </div>
                        ))
                )}
            </div>
        </div>
    );
};
