import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CAIRN_CATEGORIES } from '../lib/cairns';

export interface Cairn {
    id: string;
    lat: number;
    lng: number;
    category: string;
    raw_note?: string;
    gate_code?: string;
    created_at: string;
}

export const AddCairnModal = ({ lat, lng, onClose, onSaved }: { lat: number, lng: number, onClose: () => void, onSaved: (cairn: Cairn | null, error?: string) => void }) => {
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
        <div className="modal-overlay" style={{ zIndex: 20000 }}>
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Add Point of Interest</h3>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>Dropping pin at your location</p>
                <div className="category-select" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {CAIRN_CATEGORIES.map(cat => (
                        <button
                            key={cat.key}
                            className={`cat-btn ${category === cat.key ? 'active' : ''}`}
                            onClick={() => setCategory(cat.key)}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 6,
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                                background: category === cat.key ? 'var(--primary-action)' : 'var(--bg-main)',
                                color: category === cat.key ? 'white' : 'var(--text-main)',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
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
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-main)',
                        color: 'var(--text-main)',
                        fontSize: '14px',
                        marginBottom: '16px',
                        resize: 'none'
                    }}
                />
                <button 
                    className="action-btn primary" 
                    onClick={handleSave} 
                    disabled={saving} 
                    style={{ 
                        marginTop: 8, 
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'var(--primary-action)',
                        color: 'white',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                    }}
                >
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>
        </div>
    );
};

export const AddHazardModal = ({ lat, lng, onClose, onSaved }: { lat: number, lng: number, onClose: () => void, onSaved: (hazard: any | null, error?: string) => void }) => {
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
        { key: 'road_closure', label: 'Road Closure' },
    ];

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            const { data, error } = await supabase.from('hazards').insert([{
                lat, lng,
                restriction_type: restrictionType,
                max_height: maxHeight ? parseFloat(maxHeight) : null,
                max_weight: maxWeight ? parseFloat(maxWeight) : null,
                street_name: streetName.trim() || null,
                reported_by: userData.user?.id
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
        <div className="modal-overlay" style={{ zIndex: 20000 }}>
            <div className="modal-content">
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AlertTriangle size={24} color="#ff3b30" />
                        <h3 style={{ margin: 0 }}>Report Hazard</h3>
                    </div>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>Share a road restriction at your location</p>

                <div className="category-select" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {HAZARD_TYPES.map(type => (
                        <button
                            key={type.key}
                            className={`cat-btn ${restrictionType === type.key ? 'active' : ''}`}
                            onClick={() => setRestrictionType(type.key)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid',
                                background: restrictionType === type.key ? '#ff3b30' : 'var(--bg-main)',
                                borderColor: restrictionType === type.key ? '#ff3b30' : 'var(--border-subtle)',
                                color: restrictionType === type.key ? 'white' : 'var(--text-main)',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer'
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
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-main)',
                            color: 'var(--text-main)',
                            fontSize: '14px'
                        }}
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
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--bg-main)',
                                color: 'var(--text-main)',
                                fontSize: '14px'
                            }}
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
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--bg-main)',
                                color: 'var(--text-main)',
                                fontSize: '14px'
                            }}
                        />
                    </div>
                )}

                <button
                    className="action-btn primary"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ 
                        background: '#ff3b30', 
                        borderColor: '#ff3b30', 
                        marginTop: 8, 
                        width: '100%', 
                        padding: '12px',
                        borderRadius: '8px',
                        color: 'white',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {saving ? 'Reporting...' : 'Publish Hazard Report'}
                </button>
            </div>
        </div>
    );
};
