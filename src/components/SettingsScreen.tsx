import React, { useState, useEffect } from 'react';
import {
    User, FileText, Map, HelpCircle, MapPin,
    BarChart3, LogOut, ChevronRight, Sun, Moon,
    Package, AlertTriangle, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import './SettingsScreen.css';
import { Truck } from 'lucide-react';

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

    const fmt = (iso: string) => {
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    if (loading) return <div className="empty-state">Loading…</div>;
    if (entries.length === 0) return <div className="empty-state">No entries yet.</div>;

    return (
        <div className="data-list">
            {entries.map((e, i) => (
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
                    <div className="data-item-date">{fmt(e.created_at)}</div>
                </div>
            ))}
        </div>
    );
};

// ----- Runs Sub-Section -----
const RunsSection = () => {
    const [deliveries, setDeliveries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.from('deliveries').select('*').order('delivery_date', { ascending: false }).then(({ data }) => {
            setDeliveries(data || []);
            setLoading(false);
        });
    }, []);

    const fmt = (iso: string) => {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    };

    if (loading) return <div className="empty-state">Loading…</div>;
    if (deliveries.length === 0) return <div className="empty-state">No runs recorded yet.</div>;

    // Group by delivery_date
    const grouped: Record<string, any[]> = {};
    deliveries.forEach(d => {
        if (!grouped[d.delivery_date]) grouped[d.delivery_date] = [];
        grouped[d.delivery_date].push(d);
    });

    return (
        <div className="data-list">
            {Object.entries(grouped).map(([date, runs]) => (
                <div key={date}>
                    <div className="data-section-label">{fmt(date)}</div>
                    {runs.map((r, i) => (
                        <div key={i} className="data-item">
                            <div className="data-item-icon"><Package size={18} color="var(--primary-action)" /></div>
                            <div className="data-item-body">
                                <div className="data-item-title">{r.address}</div>
                                <div className="data-item-sub">Run #{r.id.substring(0, 6)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            ))}
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
    isGuest, userEmail, isDarkMode, setDarkMode, isDeliveryMode, setDeliveryMode, handleLogout, onNavigateToLogin
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
            case 'runs': return <RunsSection />;
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
