import React, { useState, useEffect } from 'react';
import { Search, Key, Copy, Check, MapPin, Coffee, AlertTriangle } from 'lucide-react';
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
}

export const IntelligenceFeed: React.FC<IntelligenceFeedProps> = ({ userEmail }) => {
    const [activeFilter, setActiveFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [intelItems, setIntelItems] = useState<IntelItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Cairns
                const { data: cairns, error: cairnsError } = await supabase
                    .from('cairns')
                    .select('*');

                // Fetch Hazards
                const { data: hazards, error: hazardsError } = await supabase
                    .from('hazards')
                    .select('*');

                if (cairnsError) console.error('Cairns fetch error:', cairnsError);
                if (hazardsError) console.error('Hazards fetch error:', hazardsError);

                const unifiedItems: IntelItem[] = [];

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
        const { error } = await supabase.from(table).delete().eq('id', id);

        if (error) {
            alert('Error deleting: ' + error.message);
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
            default: return <MapPin size={18} color="var(--text-tertiary)" />;
        }
    };

    return (
        <div className="intelligence-feed">
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
                {loading ? (
                    <div className="empty-state">Loading intelligence...</div>
                ) : filteredItems.length === 0 ? (
                    <div className="empty-state">No intel found for this search.</div>
                ) : (
                    filteredItems.map((item) => (
                        <div key={item.id} className={`intel-card ${item.type}-card`}>
                            <div className="card-header">
                                <div className="header-icon">
                                    {renderIcon(item)}
                                </div>
                                <div className="header-text">
                                    <span className="location-name">{item.category.replace('_', ' ')}</span>
                                    {item.type === 'hazard' && <span className="hazard-badge">HAZARD</span>}
                                </div>
                                <div style={{ flex: 1 }}></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span className="time-ago">{new Date(item.created_at).toLocaleDateString()}</span>
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
