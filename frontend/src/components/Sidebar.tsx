import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  LayoutTemplate,
  Bot,
  Puzzle,
  Settings,
  LogOut,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sessions', icon: MessageSquare, label: 'Sessions' },
  { to: '/workflows', icon: GitBranch, label: 'Workflows' },
  { to: '/templates', icon: LayoutTemplate, label: 'Templates' },
  { to: '/agent-config', icon: Bot, label: 'Agent Config' },
  { to: '/extensions', icon: Puzzle, label: 'Extensions' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside
      style={{
        width: '220px',
        height: '100vh',
        background: '#0f172a',
        borderRight: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ padding: '20px 16px', borderBottom: '1px solid #1e293b' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '28px', height: '28px', background: '#3B82F6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
            π
          </span>
          Pi Console
        </h2>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                color: active ? '#F8FAFC' : '#94A3B8',
                background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.15s',
                textDecoration: 'none',
              }}
            >
              <Icon size={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div style={{ padding: '12px 8px', borderTop: '1px solid #1e293b' }}>
        <button
          onClick={async () => {
            // SEC-016: Call backend logout to clear httpOnly cookie and blacklist token
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
            window.location.reload();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            color: '#94A3B8',
            fontSize: '14px',
            fontWeight: 500,
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}
