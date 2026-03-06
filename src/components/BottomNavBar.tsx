import React from 'react';
import { Compass, Calendar as CalendarIcon, Settings, Zap } from 'lucide-react';
import './BottomNavBar.css';

interface BottomNavBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isGuest?: boolean;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, setActiveTab, isGuest = false }) => {
  return (
    <div className="bottom-nav">
      <button
        className={`nav-item ${activeTab === 'explore' ? 'active' : ''}`}
        onClick={() => setActiveTab('explore')}
      >
        <Compass size={24} className="nav-icon" />
        <span className="nav-label">Explore</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'intel' ? 'active' : ''}`}
        onClick={() => setActiveTab('intel')}
      >
        <Zap size={24} className="nav-icon" />
        <span className="nav-label">Intel</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'route' ? 'active' : ''} ${isGuest ? 'disabled' : ''}`}
        onClick={() => !isGuest && setActiveTab('route')}
        style={isGuest ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon lucide lucide-map"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" /></svg>
        <span className="nav-label">Run</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
        onClick={() => setActiveTab('calendar')}
      >
        <CalendarIcon size={24} className="nav-icon" />
        <span className="nav-label">Calendar</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => setActiveTab('settings')}
      >
        <Settings size={24} className="nav-icon" />
        <span className="nav-label">Settings</span>
      </button>
    </div>
  );
};
