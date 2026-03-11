import React, { useState, useEffect } from 'react';
import { Truck, LogOut, ChevronRight, User, HelpCircle, MapPin, BarChart3, Sun, Moon, Package, AlertTriangle, Check, MoreVertical, FileText, Map } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getSydneyDate, formatDisplayDate } from '../lib/dateUtils';
import './SettingsScreen.css';

type Section = 'main' | 'account' | 'entries' | 'runs' | 'support' | 'addresses' | 'analytics' | 'vehicle';

interface SettingsScreenProps {
    isGuest: boolean;
    userEmail: string | null;
    isDarkMode: boolean;
    setDarkMode: (val: boolean) => void;
    isDeliveryMode: boolean;
    setDeliveryMode: (val: boolean) => void;
    handleLogout: () => void;
    onNavigateToLogin: () => void;
    routeStops?: any[];
    activeAddress?: string | null;
    onUpdateStops?: (stops: any[]) => void;
    onSwitchToIntel?: (address: string) => void;
}

// ----- Sub-components -----

const Toggle = ({ isActive, onToggle, disabled = false }: { isActive: boolean; onToggle: () => void; disabled?: boolean }) => (
    <div
        className={`toggle-switch ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => { if (!disabled) onToggle(); }}
        role="switch"
        aria-checked={isActive}
    >
        <div className="toggle-knob" />
    </div>
);

// ----- Account Sub-Section -----
const AccountSection = ({ userEmail, onNavigateToLogin, isGuest }: { userEmail: string | null; onNavigateToLogin: () => void; isGuest: boolean }) => {
    const [name, setName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setName(data.user?.user_metadata?.display_name || '');
        });
    }, []);

    const handleSave = async () => {
        if (isGuest) return;
        setSaving(true);
        setMessage(null);
        const updates: any = { data: { display_name: name } };
        if (newPassword) updates.password = newPassword;
        const { error } = await supabase.auth.updateUser(updates);
        setSaving(false);
        setMessage({ text: error ? error.message : 'Saved!', ok: !error });
        if (!error) setNewPassword('');
    };

    if (isGuest) {
        return (
            <div className="empty-state" style={{ padding: '40px 0' }}>
                <User size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <p>You're browsing as a guest.</p>
                <button className="primary-btn" style={{ marginTop: 24 }} onClick={onNavigateToLogin}>Login / Register</button>
            </div>
        );
    }

    return (
        <div>
            <div className="form-group">
                <label>Display Name</label>
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="form-group">
                <label>Email</label>
                <input className="form-input" value={userEmail || ''} disabled />
            </div>
            <div className="form-group">
                <label>New Password</label>
                <input className="form-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" />
            </div>
            {message && (
                <div className={`form-message ${message.ok ? 'ok' : 'err'}`}>
                    {message.ok ? <Check size={16} /> : <AlertTriangle size={16} />} {message.text}
                </div>
            )}
            <button className="primary-btn" onClick={handleSave} disabled={saving} style={{ marginTop: 24 }}>
                {saving ? 'Saving…' : 'Save Changes'}
            </button>
        </div>
    );
};

// ----- Entries Sub-Section -----
const EntriesSection = () => {
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            const { data: notes } = await supabase.from('location_notes').select('*').order('created_at', { ascending: false });
            const { data: videos } = await supabase.from('location_videos').select('*').order('created_at', { ascending: false });
            const combined = [
                ...(notes || []).map((n: any) => ({ ...n, type: 'note' })),
                ...(videos || []).map((v: any) => ({ ...v, type: 'video' })),
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setEntries(combined);
            setLoading(false);
        };
        fetch();
    }, []);


    if (loading) return <div className="empty-state">Loading…</div>;
    if (entries.length === 0) return <div className="empty-state">No entries yet.</div>;

    // Group entries by date
    const groupedEntries: Record<string, any[]> = {};
    entries.forEach(e => {
        const date = e.created_at.split('T')[0];
        if (!groupedEntries[date]) groupedEntries[date] = [];
        groupedEntries[date].push(e);
    });

    const sortedDates = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return (
        <div className="data-list">
            {sortedDates.map(date => (
                <div key={date} style={{ marginBottom: 24 }}>
                    <div className="data-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{formatDisplayDate(date)}</span>
                        <span className="entry-count-badge">{groupedEntries[date].length}</span>
                    </div>
                    {groupedEntries[date].map((e, i) => (
                        <div key={i} className="data-item">
                            <div className="data-item-icon">
                                {e.type === 'note' ? <FileText size={18} color="var(--primary-action)" /> : <Map size={18} color="var(--primary-action)" />}
                            </div>
                            <div className="data-item-body">
                                <div className="data-item-title">{e.address}</div>
                                <div className="data-item-sub">
                                    {e.type === 'note'
                                        ? (e.delivery_notes || e.parking_instructions || 'Note')
                                        : `Video · ${e.category}`}
                                </div>
                            </div>
                            {/* Optional: You can keep the date here or remove it since it's in the header */}
                            <div className="data-item-date" style={{ opacity: 0.4, fontSize: '10px' }}>
                                {new Date(e.created_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

// ----- Runs Sub-Section -----
const RunsSection = ({ routeStops, activeAddress, onUpdateStops, onSwitchToIntel }: { routeStops?: any[], activeAddress?: string | null, onUpdateStops?: (stops: any[]) => void, onSwitchToIntel?: (address: string) => void }) => {
    const [deliveries, setDeliveries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedActive, setExpandedActive] = useState(false);
    const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
    const [menuOpen, setMenuOpen] = useState<number | null>(null);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editAddress, setEditAddress] = useState('');

    useEffect(() => {
        supabase.from('deliveries').select('*').order('delivery_date', { ascending: false }).then(({ data }) => {
            setDeliveries(data || []);
            setLoading(false);
        });
    }, []);


    const handleAction = async (action: string, idx: number) => {
        if (!routeStops || !onUpdateStops) return;
        const newStops = [...routeStops];
        const stop = newStops[idx];
        setMenuOpen(null);

        switch (action) {
            case 'edit':
                setEditAddress(stop.address);
                setEditingIdx(idx);
                break;
            case 'complete':
                newStops[idx] = { ...stop, status: 'completed' };
                onUpdateStops(newStops);
                if (stop.id) await supabase.from('run_stops').update({ status: 'completed' }).eq('id', stop.id);

                // Add to history so it shows up in the runs list immediately
                const today = getSydneyDate();
                await supabase.from('deliveries').insert([{
                    address: stop.address,
                    delivery_date: today
                }]);

                // Refresh local deliveries list
                supabase.from('deliveries').select('*').order('delivery_date', { ascending: false }).then(({ data }) => {
                    setDeliveries(data || []);
                });
                break;
            case 'intel':
                if (onSwitchToIntel) onSwitchToIntel(stop.address);
                break;
            case 'delete':
                if (confirm('Delete this delivery from the run?')) {
                    const filtered = newStops.filter((_, i) => i !== idx);
                    onUpdateStops(filtered);
                    if (stop.id) await supabase.from('run_stops').delete().eq('id', stop.id);
                }
                break;
        }
    };

    const saveEditSettings = async () => {
        if (editingIdx === null || !routeStops || !onUpdateStops) return;
        const newStops = [...routeStops];
        const stop = newStops[editingIdx];

        newStops[editingIdx] = { ...stop, address: editAddress, lat: undefined, lng: undefined };
        onUpdateStops(newStops);
        if (stop.id) await supabase.from('run_stops').update({ address: editAddress }).eq('id', stop.id);

        setEditingIdx(null);
    };

    if (loading) return <div className="empty-state">Loading…</div>;
    if (deliveries.length === 0 && (!routeStops || routeStops.length === 0)) return <div className="empty-state">No runs recorded yet.</div>;

    // Group by run_id (fallback to delivery_date)
    const groupedRuns: Record<string, { date: string, items: any[] }> = {};
    deliveries.forEach(d => {
        const runId = d.run_id || d.delivery_date;
        if (!groupedRuns[runId]) groupedRuns[runId] = { date: d.delivery_date, items: [] };
        groupedRuns[runId].items.push(d);
    });

    const runList = Object.entries(groupedRuns)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const activePendingNum = routeStops?.filter(s => s.status === 'pending').length || 0;

    return (
        <div className="data-list">
            {/* Active Run Card */}
            {routeStops && routeStops.length > 0 && (
                <div className={`data-item active-run-card ${expandedActive ? 'expanded' : ''}`} style={{ display: 'block' }}>
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }} onClick={() => setExpandedActive(!expandedActive)}>
                        <div className="data-item-icon" style={{ background: 'var(--primary-action)', borderRadius: 12, padding: 8 }}>
                            <Truck size={18} color="white" />
                        </div>
                        <div className="data-item-body" style={{ marginLeft: 12 }}>
                            <div className="data-item-title" style={{ fontWeight: 700 }}>Active Run</div>
                            <div className="data-item-sub">
                                {activePendingNum} drop{activePendingNum !== 1 ? 's' : ''} remaining
                            </div>
                        </div>
                        <div className="settings-chevron" style={{ transform: expandedActive ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                            <ChevronRight size={18} />
                        </div>
                    </div>

                    {expandedActive && (
                        <div className="active-stops-list" style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                            {routeStops.map((s, i) => (
                                <div key={i} className="active-stop-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, position: 'relative' }}>
                                    <div style={{ width: 24, height: 24, borderRadius: 12, background: s.status === 'completed' ? '#eee' : 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: '1px solid var(--border-subtle)' }}>
                                        {i + 1}
                                    </div>
                                    <div style={{ flex: 1, fontSize: 13, opacity: s.status === 'completed' ? 0.5 : 1 }}>
                                        <div style={{ fontWeight: 600 }}>{s.address}</div>
                                        {s.manifest_notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>📋 {s.manifest_notes}</div>}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {s.status === 'completed' && <Check size={14} color="#34C759" />}
                                        {s.address === activeAddress && <div className="pulse-dot" style={{ width: 8, height: 8, background: 'var(--primary-action)', borderRadius: '50%' }} />}

                                        <button
                                            onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === i ? null : i); }}
                                            style={{ background: 'none', border: 'none', padding: 4, color: 'var(--text-secondary)', cursor: 'pointer' }}
                                        >
                                            <MoreVertical size={16} />
                                        </button>
                                    </div>

                                    {menuOpen === i && (
                                        <div className="stop-action-menu" style={{
                                            position: 'absolute', right: 30, top: 0,
                                            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                                            borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100,
                                            padding: '4px 0', minWidth: 140
                                        }}>
                                            <button onClick={() => handleAction('edit', i)} className="menu-action-btn">Edit Address</button>
                                            <button onClick={() => handleAction('complete', i)} className="menu-action-btn">Mark Completed</button>
                                            <button onClick={() => handleAction('intel', i)} className="menu-action-btn">Show Intel</button>
                                            <button onClick={() => handleAction('delete', i)} className="menu-action-btn" style={{ color: '#FF3B30' }}>Delete</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {runList.map((run) => (
                <div key={run.id} style={{ marginBottom: 12 }}>
                    <div className="data-section-label">{formatDisplayDate(run.date)}</div>

                    <div className={`data-item ${expandedRuns[run.id] ? 'expanded' : ''}`} onClick={() => setExpandedRuns(prev => ({ ...prev, [run.id]: !prev[run.id] }))} style={{ cursor: 'pointer', display: 'block' }}>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                            <div className="data-item-icon"><Package size={18} color="var(--primary-action)" /></div>
                            <div className="data-item-body" style={{ marginLeft: 12 }}>
                                <div className="data-item-title" style={{ fontWeight: 600 }}>Runsheet {run.id.substring(0, 8)}</div>
                                <div className="data-item-sub">{run.items.length} deliveries</div>
                            </div>
                            <div className="settings-chevron" style={{ transform: expandedRuns[run.id] ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                                <ChevronRight size={18} />
                            </div>
                        </div>

                        {expandedRuns[run.id] && (
                            <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                                {run.items.map((r, i) => (
                                    <div key={i} style={{ padding: '8px 0', fontSize: 13, borderBottom: i < run.items.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                        <div style={{ fontWeight: 500 }}>{r.address}</div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Delivery ID: #{r.id.substring(0, 6)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ))}

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
                            <button className="edit-save-btn" onClick={saveEditSettings}>Save Changes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ----- Support Sub-Section -----
const SupportSection = ({ userEmail, isGuest }: { userEmail: string | null; isGuest: boolean }) => {
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!comment.trim()) return;
        setSubmitting(true);
        setError(null);
        const { error } = await supabase.from('support_tickets').insert([{
            user_email: userEmail || 'guest@robin.app',
            comment: comment.trim(),
        }]);
        setSubmitting(false);
        if (error) {
            setError(error.message);
        } else {
            setSubmitted(true);
            setComment('');
        }
    };

    if (submitted) {
        return (
            <div className="empty-state">
                <Check size={40} color="#34C759" style={{ margin: '0 auto 16px' }} />
                <p style={{ fontWeight: 600 }}>Thanks for reaching out!</p>
                <p style={{ marginTop: 8 }}>We'll get back to you shortly.</p>
                <button className="primary-btn" style={{ marginTop: 24 }} onClick={() => setSubmitted(false)}>Send another</button>
            </div>
        );
    }

    return (
        <div>
            <div className="form-group">
                <label>Email</label>
                <input className="form-input" value={isGuest ? 'guest@robin.app' : (userEmail || '')} disabled />
            </div>
            <div className="form-group">
                <label>Comments</label>
                <textarea
                    className="form-textarea"
                    placeholder="How can we help? Describe your issue or feedback…"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={5}
                />
            </div>
            {error && <div className="form-message err"><AlertTriangle size={16} /> {error}</div>}
            <button className="primary-btn" onClick={handleSubmit} disabled={submitting || !comment.trim()} style={{ marginTop: 16 }}>
                {submitting ? 'Sending…' : 'Submit'}
            </button>
        </div>
    );
};

// ----- Saved Addresses Sub-Section -----
const AddressesSection = () => {
    const [addresses, setAddresses] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.from('deliveries').select('address').then(({ data }) => {
            const unique = [...new Set((data || []).map((d: any) => d.address))];
            setAddresses(unique as string[]);
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="empty-state">Loading…</div>;
    if (addresses.length === 0) return <div className="empty-state">No saved addresses yet.</div>;

    return (
        <div className="data-list">
            {addresses.map((a, i) => (
                <div key={i} className="data-item">
                    <div className="data-item-icon"><MapPin size={18} color="var(--primary-action)" /></div>
                    <div className="data-item-body">
                        <div className="data-item-title">{a}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// ----- Analytics Sub-Section -----
const AnalyticsSection = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        thisWeek: 0, thisMonth: 0, thisYear: 0, total: 0,
        suburbs: [] as { name: string; count: number }[],
        sameAddress: [] as { address: string; count: number }[],
    });
    const [weekStart, setWeekStart] = useState<'monday' | 'sunday'>('monday');

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            const { data } = await supabase.from('deliveries').select('*');
            if (!data) { setLoading(false); return; }

            const now = new Date();

            // Week boundaries
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const dayOfWeek = today.getDay(); // 0=Sun
            const weekOffset = weekStart === 'monday'
                ? (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
                : dayOfWeek;
            const weekStartDate = new Date(today);
            weekStartDate.setDate(today.getDate() - weekOffset);
            const weekEndDate = new Date(weekStartDate);
            weekEndDate.setDate(weekStartDate.getDate() + 6);

            const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const thisYear = String(now.getFullYear());

            const inRange = (dateStr: string, from: Date, to: Date) => {
                const d = new Date(dateStr);
                return d >= from && d <= to;
            };

            const wk = data.filter(d => inRange(d.delivery_date, weekStartDate, weekEndDate)).length;
            const mo = data.filter(d => d.delivery_date.startsWith(thisMonth)).length;
            const yr = data.filter(d => d.delivery_date.startsWith(thisYear)).length;
            const tot = data.length;

            // Suburb extraction (last part of address before postcode)
            const suburbMap: Record<string, number> = {};
            data.forEach((d: any) => {
                const parts = d.address.split(',');
                const suburb = parts.length > 1 ? parts[parts.length - 2].trim().split(' ').slice(0, -1).join(' ') || parts[1].trim() : 'Unknown';
                suburbMap[suburb] = (suburbMap[suburb] || 0) + 1;
            });
            const suburbs = Object.entries(suburbMap).map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count).slice(0, 8);

            // Same address repeated visits
            const addrMap: Record<string, number> = {};
            data.forEach((d: any) => { addrMap[d.address] = (addrMap[d.address] || 0) + 1; });
            const sameAddress = Object.entries(addrMap)
                .filter(([, count]) => count > 1)
                .map(([address, count]) => ({ address, count }))
                .sort((a, b) => b.count - a.count);

            setStats({ thisWeek: wk, thisMonth: mo, thisYear: yr, total: tot, suburbs, sameAddress });
            setLoading(false);
        };
        fetchStats();
    }, [weekStart]);

    if (loading) return <div className="empty-state">Loading analytics…</div>;

    return (
        <div>
            {/* Week start toggle */}
            <div className="analytics-week-toggle">
                <span className="analytics-label">Week starts on</span>
                <div className="pill-toggle">
                    <button className={weekStart === 'monday' ? 'active' : ''} onClick={() => setWeekStart('monday')}>Mon</button>
                    <button className={weekStart === 'sunday' ? 'active' : ''} onClick={() => setWeekStart('sunday')}>Sun</button>
                </div>
            </div>

            {/* Delivery Count Cards */}
            <div className="analytics-card-grid">
                {[
                    { label: 'This Week', value: stats.thisWeek },
                    { label: 'This Month', value: stats.thisMonth },
                    { label: 'This Year', value: stats.thisYear },
                    { label: 'Total', value: stats.total },
                ].map(({ label, value }) => (
                    <div key={label} className="analytics-card">
                        <div className="analytics-card-value">{value}</div>
                        <div className="analytics-card-label">{label}</div>
                    </div>
                ))}
            </div>

            {/* Most Visited Suburbs */}
            <div className="analytics-section-title">Most Visited Suburbs</div>
            {stats.suburbs.length === 0
                ? <div className="empty-state" style={{ padding: '16px 0' }}>No data yet.</div>
                : stats.suburbs.map(({ name, count }) => (
                    <div key={name} className="analytics-bar-row">
                        <span className="analytics-bar-label">{name}</span>
                        <div className="analytics-bar-track">
                            <div className="analytics-bar-fill" style={{ width: `${Math.min(100, (count / stats.total) * 100 * 2)}%` }} />
                        </div>
                        <span className="analytics-bar-count">{count}</span>
                    </div>
                ))}

            {/* Same Deliveries */}
            <div className="analytics-section-title" style={{ marginTop: 24 }}>Repeat Deliveries</div>
            {stats.sameAddress.length === 0
                ? <div className="empty-state" style={{ padding: '16px 0' }}>No repeat addresses yet.</div>
                : stats.sameAddress.map(({ address, count }) => (
                    <div key={address} className="data-item" style={{ marginBottom: 8 }}>
                        <div className="data-item-icon"><MapPin size={16} color="var(--primary-action)" /></div>
                        <div className="data-item-body">
                            <div className="data-item-title" style={{ fontSize: 13 }}>{address}</div>
                        </div>
                        <div className="analytics-repeat-badge">{count}×</div>
                    </div>
                ))}
        </div>
    );
};

// ----- Vehicle Profile Sub-Section -----
const VehicleSection = ({ isGuest }: { isGuest: boolean }) => {
    const [profile, setProfile] = useState<{ type: string; height: string; weight: string; length: string }>({
        type: 'van', height: '', weight: '', length: ''
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (isGuest) return;
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) return;
            const { data } = await supabase.from('profiles').select('vehicle_type, vehicle_height, vehicle_weight, vehicle_length').eq('id', user.user.id).single();
            if (data) {
                setProfile({
                    type: data.vehicle_type || 'van',
                    height: data.vehicle_height ? String(data.vehicle_height) : '',
                    weight: data.vehicle_weight ? String(data.vehicle_weight) : '',
                    length: data.vehicle_length ? String(data.vehicle_length) : '',
                });
            }
        };
        fetchProfile();
    }, [isGuest]);

    const handlePresetChange = (preset: string) => {
        if (preset === 'van') setProfile({ type: 'van', height: '2.5', weight: '3.5', length: '6.0' });
        else if (preset === 'rigid') setProfile({ type: 'rigid', height: '3.8', weight: '12.0', length: '8.5' });
        else if (preset === 'semi') setProfile({ type: 'semi', height: '4.3', weight: '42.5', length: '19.0' });
        else setProfile({ ...profile, type: preset });
    };

    const handleSave = async () => {
        if (isGuest) return;
        setSaving(true);
        setMessage(null);
        const { data: user } = await supabase.auth.getUser();
        if (user.user) {
            const { error } = await supabase.from('profiles').update({
                vehicle_type: profile.type,
                vehicle_height: profile.height ? parseFloat(profile.height) : null,
                vehicle_weight: profile.weight ? parseFloat(profile.weight) : null,
                vehicle_length: profile.length ? parseFloat(profile.length) : null,
            }).eq('id', user.user.id);
            setSaving(false);
            setMessage({ text: error ? error.message : 'Vehicle Profile Saved!', ok: !error });
        }
    };

    if (isGuest) {
        return (
            <div className="empty-state">
                <Truck size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <p>Login to set your vehicle routing profile.</p>
            </div>
        );
    }

    return (
        <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
                Set your vehicle dimensions to enable Robin's intelligent hazard avoidance routing (bypassing low bridges and weight limits).
            </p>
            <div className="form-group">
                <label>Vehicle Class Preset</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button className={`secondary-btn ${profile.type === 'van' ? 'active' : ''}`} onClick={() => handlePresetChange('van')} style={{ flex: 1, padding: 8, background: profile.type === 'van' ? 'var(--primary-action)' : 'var(--bg-card)', color: profile.type === 'van' ? '#fff' : 'var(--text-main)', border: 'none', borderRadius: 8 }}>Van</button>
                    <button className={`secondary-btn ${profile.type === 'rigid' ? 'active' : ''}`} onClick={() => handlePresetChange('rigid')} style={{ flex: 1, padding: 8, background: profile.type === 'rigid' ? 'var(--primary-action)' : 'var(--bg-card)', color: profile.type === 'rigid' ? '#fff' : 'var(--text-main)', border: 'none', borderRadius: 8 }}>Rigid</button>
                    <button className={`secondary-btn ${profile.type === 'semi' ? 'active' : ''}`} onClick={() => handlePresetChange('semi')} style={{ flex: 1, padding: 8, background: profile.type === 'semi' ? 'var(--primary-action)' : 'var(--bg-card)', color: profile.type === 'semi' ? '#fff' : 'var(--text-main)', border: 'none', borderRadius: 8 }}>Semi</button>
                </div>
            </div>

            <div className="form-group">
                <label>Height (meters)</label>
                <input className="form-input" type="number" step="0.1" value={profile.height} onChange={e => setProfile({ ...profile, height: e.target.value })} placeholder="e.g. 3.2" />
            </div>
            <div className="form-group">
                <label>Gross Weight (tonnes)</label>
                <input className="form-input" type="number" step="0.1" value={profile.weight} onChange={e => setProfile({ ...profile, weight: e.target.value })} placeholder="e.g. 15.5" />
            </div>
            <div className="form-group">
                <label>Total Length (meters)</label>
                <input className="form-input" type="number" step="0.1" value={profile.length} onChange={e => setProfile({ ...profile, length: e.target.value })} placeholder="e.g. 10.0" />
            </div>

            {message && (
                <div className={`form-message ${message.ok ? 'ok' : 'err'}`}>
                    {message.ok ? <Check size={16} /> : <AlertTriangle size={16} />} {message.text}
                </div>
            )}
            <button className="primary-btn" onClick={handleSave} disabled={saving} style={{ marginTop: 24 }}>
                {saving ? 'Saving…' : 'Save Profile'}
            </button>
        </div>
    );
};

// ================================================
// Main Settings Screen
// ================================================

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
    isGuest, userEmail, isDarkMode, setDarkMode, isDeliveryMode, setDeliveryMode, handleLogout, onNavigateToLogin, routeStops, activeAddress
}) => {
    const [activeSection, setActiveSection] = useState<Section>('main');

    const sectionTitle: Record<Section, string> = {
        main: 'Settings',
        account: 'Account',
        entries: 'Entries',
        runs: 'Runs',
        support: 'Support',
        addresses: 'Saved Addresses',
        analytics: 'Analytics',
        vehicle: 'Vehicle Profile',
    };

    const renderBackButton = () => (
        <button className="back-btn" onClick={() => setActiveSection('main')}>
            <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} /> Settings
        </button>
    );

    const renderSubContent = () => {
        switch (activeSection) {
            case 'account': return <AccountSection userEmail={userEmail} isGuest={isGuest} onNavigateToLogin={onNavigateToLogin} />;
            case 'entries': return <EntriesSection />;
            case 'runs': return <RunsSection routeStops={routeStops} activeAddress={activeAddress} />;
            case 'support': return <SupportSection userEmail={userEmail} isGuest={isGuest} />;
            case 'addresses': return <AddressesSection />;
            case 'analytics': return <AnalyticsSection />;
            case 'vehicle': return <VehicleSection isGuest={isGuest} />;
            default: return null;
        }
    };

    if (activeSection !== 'main') {
        return (
            <div className="settings-screen">
                {renderBackButton()}
                <h1 className="settings-header">{sectionTitle[activeSection]}</h1>
                {renderSubContent()}
            </div>
        );
    }

    // ── Main settings menu ──
    const navItem = (
        label: string,
        icon: React.ReactNode,
        section: Section,
        value?: string,
        locked?: boolean
    ) => (
        <div
            className={`settings-item clickable ${locked ? 'disabled' : ''}`}
            onClick={() => !locked && setActiveSection(section)}
        >
            <div className="settings-item-left">
                {icon}
                <span className="settings-label">{label}</span>
            </div>
            <div className="settings-item-right">
                {value && <span className="settings-value">{value}</span>}
                <ChevronRight size={18} className="settings-chevron" />
            </div>
        </div>
    );

    return (
        <div className="settings-screen">
            <h1 className="settings-header">Settings</h1>

            {/* Account */}
            <div className="settings-group">
                {navItem('Account', <User size={20} className="settings-icon" />, 'account',
                    isGuest ? 'Guest User' : (userEmail || undefined))}
            </div>

            {/* Toggles */}
            <div className="settings-group">
                <div className="settings-item">
                    <div className="settings-item-left">
                        {isDarkMode ? <Moon size={20} className="settings-icon" /> : <Sun size={20} className="settings-icon" />}
                        <span className="settings-label">Dark Mode</span>
                    </div>
                    <Toggle isActive={isDarkMode} onToggle={() => setDarkMode(!isDarkMode)} />
                </div>
                <div className="settings-item">
                    <div className="settings-item-left">
                        <Package size={20} className={`settings-icon ${isGuest ? '' : ''}`} />
                        <div>
                            <span className="settings-label">Delivery Mode</span>
                            {isGuest && <div className="settings-value" style={{ fontSize: 11 }}>Login required</div>}
                        </div>
                    </div>
                    <Toggle isActive={isDeliveryMode} onToggle={() => setDeliveryMode(!isDeliveryMode)} disabled={isGuest} />
                </div>
            </div>

            {/* Vehicle Profile */}
            <div className="settings-group">
                {navItem('Vehicle Routing Profile', <Truck size={20} className="settings-icon" />, 'vehicle', undefined, isGuest)}
            </div>

            {/* Data Features */}
            <div className="settings-group">
                {navItem('Entries', <FileText size={20} className="settings-icon" />, 'entries', undefined, isGuest)}
                {navItem('Runs', <Map size={20} className="settings-icon" />, 'runs', undefined, isGuest)}
                {navItem('Saved Addresses', <MapPin size={20} className="settings-icon" />, 'addresses', undefined, isGuest)}
                {navItem('Analytics', <BarChart3 size={20} className="settings-icon" />, 'analytics', undefined, isGuest)}
            </div>

            {/* Support */}
            <div className="settings-group">
                {navItem('Support', <HelpCircle size={20} className="settings-icon" />, 'support')}
            </div>

            {/* Auth */}
            <div className="settings-group">
                <div className="settings-item clickable" onClick={isGuest ? onNavigateToLogin : handleLogout}>
                    <div className="settings-item-left">
                        {isGuest ? <Sun size={20} className="settings-icon" /> : <LogOut size={20} className="settings-icon" style={{ color: '#FF3B30' }} />}
                        <span className="settings-label" style={{ color: isGuest ? 'var(--text-main)' : '#FF3B30' }}>{isGuest ? 'Login / Register' : 'Logout'}</span>
                    </div>
                    <ChevronRight size={18} className="settings-chevron" />
                </div>
            </div>
        </div>
    );
};
