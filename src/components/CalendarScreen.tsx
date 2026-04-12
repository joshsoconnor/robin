import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Search, LayoutGrid, List, Plus, ChevronLeft, ChevronRight, X, FileText, Camera, Video } from 'lucide-react';
import './CalendarScreen.css';

interface DeliveryRecord {
    id: string;
    address: string;
    delivery_date: string;
    created_at: string;
    notes?: any[];
    videos?: any[];
    photos?: any[];
}

export const CalendarScreen: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
    // Strips a full address to: street #, street name, suburb, postcode
    // e.g. "126 Jersey Rd, Dharruk NSW 2770, Australia" -> "126 Jersey Rd, Dharruk 2770"
    const formatShortAddress = (addr: string) => {
        const parts = addr.split(',').map(p => p.trim());
        // parts[0] = street, parts[1] = suburb + state + postcode, parts[2+] = country etc.
        const street = parts[0] || addr;
        if (parts.length < 2) return street;
        // Extract suburb and postcode from "Dharruk NSW 2770" -> "Dharruk 2770"
        const suburbPart = parts[1];
        // Remove known Australian state abbreviations
        const cleaned = suburbPart
            .replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        return `${street}, ${cleaned}`;
    };

    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Touch gesture state
    const touchStartY = useRef(0);

    useEffect(() => {
        fetchDeliveriesForMonth(currentDate);
    }, [currentDate]);

    const fetchDeliveriesForMonth = async (date: Date) => {
        const y = date.getFullYear();
        const m = date.getMonth();
        // Use YYYY-MM-DD strings for the query to match the database column format
        const startOfMonth = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const endOfMonth = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`;

        // 1. Fetch Deliveries
        const { data: routeData, error } = await supabase
            .from('deliveries')
            .select('*')
            .gte('delivery_date', startOfMonth)
            .lte('delivery_date', endOfMonth)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching deliveries:', error);
            return;
        }

        // 2. Fetch admin_run_routes for this date range so we can sort by stop_order
        // This fixes: batch-inserted deliveries all have identical created_at and appear random
        const { data: runRoutes } = await supabase
            .from('admin_run_routes')
            .select('address, stop_order, run_id, completed_at')
            .gte('created_at', startOfMonth + 'T00:00:00')
            .lte('created_at', endOfMonth + 'T23:59:59')
            .order('stop_order', { ascending: true });

        // Build a lookup: address -> { stop_order, completed_at }
        const routeDataMap: Record<string, { stop_order: number, completed_at: string | null }> = {};
        if (runRoutes) {
            for (const r of runRoutes) {
                const existing = routeDataMap[r.address];
                if (!existing || (r.completed_at && (!existing.completed_at || r.completed_at > existing.completed_at))) {
                    routeDataMap[r.address] = { stop_order: r.stop_order, completed_at: r.completed_at };
                }
            }
        }

        // 3. Fetch associated notes and videos for these addresses
        const addrs = routeData.map(d => d.address);
        const { data: notesData } = await supabase.from('location_notes').select('*').in('address', addrs);
        const { data: videosData } = await supabase.from('location_videos').select('*').in('address', addrs);
        const { data: photosData } = await supabase.from('location_photos').select('*').in('address', addrs);

        const enrichedDeliveries = routeData.map(d => {
            const rd = routeDataMap[d.address];
            return {
                ...d,
                notes: notesData?.filter(n => n.address === d.address) || [],
                videos: videosData?.filter(v => v.address === d.address) || [],
                photos: photosData?.filter(p => p.address === d.address) || [],
                _stopOrder: rd?.stop_order ?? 9999,
                _completedAt: rd?.completed_at || d.created_at,
            };
        });

        // Sort by date then _completedAt
        enrichedDeliveries.sort((a, b) => {
            if (a.delivery_date !== b.delivery_date) return a.delivery_date.localeCompare(b.delivery_date);
            if (a._completedAt && b._completedAt) return a._completedAt.localeCompare(b._completedAt);
            return a._stopOrder - b._stopOrder;
        });

        setDeliveries(enrichedDeliveries);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        const touchEndY = e.changedTouches[0].clientY;
        const diff = touchStartY.current - touchEndY;

        if (Math.abs(diff) > 50) { // minimum swipe distance
            if (diff > 0) {
                // Swipe Up -> Next Month
                changeMonth(1);
            } else {
                // Swipe Down -> Prev Month
                changeMonth(-1);
            }
        }
    };

    const changeMonth = (offset: number) => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
        setSelectedDate(null); // reset selection on month change
    };

    const formatSectionDate = (date: Date) => {
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const weekday = weekdays[date.getDay()];
        const month = months[date.getMonth()];
        const day = date.getDate();

        let suffix = 'th';
        if (day % 10 === 1 && day !== 11) suffix = 'st';
        else if (day % 10 === 2 && day !== 12) suffix = 'nd';
        else if (day % 10 === 3 && day !== 13) suffix = 'rd';

        return `${weekday}, ${month} ${day}${suffix}`;
    };

    // Calendar Generation Helpers
    const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const getFirstDayOfMonth = (date: Date) => {
        const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
        return (day + 6) % 7; // Adjust Sunday (0) to 6, Monday (1) to 0, etc.
    };

    const renderGrid = () => {
        const daysInMonth = getDaysInMonth(currentDate);
        const firstDay = getFirstDayOfMonth(currentDate);
        const days = [];

        // Empty slots for previous month
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
        }

        // Output actual days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayDeliveries = deliveries.filter(d => d.delivery_date === dateStr);
            const isSelected = selectedDate?.getDate() === day;

            const sydneyToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const isToday = sydneyToday === dateStr;

            days.push(
                <div
                    key={`day-${day}`}
                    className={`calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                    onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                >
                    <div className="day-circle">
                        {day}
                    </div>
                    {dayDeliveries.length > 0 && (
                        <div className="dot-indicator"></div>
                    )}
                </div>
            );
        }

        return days;
    };

    // Filter Logic
    const filteredDeliveries = deliveries.filter(d =>
        d.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeListDeliveries = selectedDate
        ? filteredDeliveries.filter(d => d.delivery_date === `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`)
        : [];

    return (
        <div className={`calendar-screen ${isDarkMode ? 'dark' : ''}`}>

            <div className={`calendar-top-bar ${isSearchFocused ? 'search-view-active' : ''}`}>
                {!isSearchFocused ? (
                    <>
                        <div className="month-nav">
                            <h2>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                            <div className="nav-arrows">
                                <button onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button>
                                <button onClick={() => changeMonth(1)}><ChevronRight size={20} /></button>
                            </div>
                        </div>

                        <div className="header-controls">
                            <button className="header-btn search-trigger" onClick={() => setIsSearchFocused(true)}>
                                <Search size={22} />
                            </button>
                            <button className={`header-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}><LayoutGrid size={16} /></button>
                            <button className={`header-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><List size={16} /></button>
                        </div>
                    </>
                ) : (
                    <div className="expanded-search-wrapper">
                        <Search size={18} className="search-icon" />
                        <input
                            autoFocus
                            id="cal-search"
                            className="search-input-full"
                            type="text"
                            placeholder="Search addresses..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onBlur={() => {
                                if (!searchQuery) setIsSearchFocused(false);
                            }}
                        />
                        <button className="search-close-btn" onClick={() => {
                            setSearchQuery('');
                            setIsSearchFocused(false);
                        }}>
                            <X size={18} />
                        </button>
                    </div>
                )}
            </div>

            <div className={`calendar-content ${viewMode}`}>

                {viewMode === 'grid' && (
                    <div className="calendar-card" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                        <div className="weekdays">
                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={`${d}-${i}`}>{d}</div>)}
                        </div>
                        <div className="days-grid">
                            {renderGrid()}
                        </div>
                    </div>
                )}

                {/* Day Details / List View area */}
                <div className="list-container">
                    {/* Replace old title with new Section Header matching screenshot */}
                    {(selectedDate || viewMode === 'list') && (
                        <div className="section-header">
                            <h3>
                                {selectedDate
                                    ? formatSectionDate(selectedDate)
                                    : "All Month Deliveries"}
                            </h3>
                            <button className="add-entry-btn" onClick={() => alert("Manual entry modal coming soon")}>
                                <Plus size={20} />
                            </button>
                        </div>
                    )}

                    <div className="entries-list">
                        {activeListDeliveries.length === 0 ? (
                            <div className="empty-state">No deliveries recorded.</div>
                        ) : (
                            activeListDeliveries.map(d => (
                                <div key={d.id} className={`entry-item ${expandedId === d.id ? 'expanded' : ''}`} onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                                    <div className="entry-main-content">
                                        <div className="entry-left">
                                            <div className="attachment-icons">
                                                {d.notes && d.notes.length > 0 && <FileText size={14} className="attachment-icon notes" />}
                                                {d.photos && d.photos.length > 0 && <Camera size={14} className="attachment-icon photos" />}
                                                {d.videos && d.videos.length > 0 && <Video size={14} className="attachment-icon videos" />}
                                                {(!d.notes?.length && !d.photos?.length && !d.videos?.length) && <div className="entry-dot"></div>}
                                            </div>
                                            <div className="entry-info">
                                                <span className="entry-address">{formatShortAddress(d.address)}</span>
                                            </div>
                                        </div>

                                        {(() => {
                                            if (!d.created_at) return null;
                                            const timeStr = new Date(d.created_at).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' });
                                            if (timeStr === 'Invalid Date') return null;
                                            // Only show if this entry has a unique timestamp (not a batch-sync artifact)
                                            const sameMinuteCount = activeListDeliveries.filter(other =>
                                                other.created_at && new Date(other.created_at).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }) === timeStr
                                            ).length;
                                            if (sameMinuteCount >= activeListDeliveries.length) return null; // all same — hide
                                            return (
                                                <span className="entry-time">
                                                    <span style={{ fontSize: '10px', display: 'block', opacity: 0.6, fontWeight: 400 }}>Logged at</span>
                                                    {timeStr}
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    {expandedId === d.id && (
                                        <div className="entry-expanded-content" onClick={(e) => e.stopPropagation()}>
                                            {d.notes && d.notes.length > 0 && (
                                                <div className="expanded-section">
                                                    <h4>Notes</h4>
                                                    {d.notes.map((n, i) => (
                                                        <div key={i} className="expanded-note">{n.delivery_notes || n.parking_instructions || 'Site Instruction'}</div>
                                                    ))}
                                                </div>
                                            )}
                                            {d.photos && d.photos.length > 0 && (
                                                <div className="expanded-section">
                                                    <h4>Photos</h4>
                                                    <div className="expanded-media-grid">
                                                        {d.photos.map((p, i) => (
                                                            <img key={i} src={p.photo_url} alt="Delivery" className="expanded-img" />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {d.videos && d.videos.length > 0 && (
                                                <div className="expanded-section">
                                                    <h4>Videos</h4>
                                                    <div className="expanded-media-grid">
                                                        {d.videos.map((v, i) => (
                                                            <video key={i} src={v.video_url} controls className="expanded-video" />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
