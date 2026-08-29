import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { MessageSquare, GitBranch, Bot, Puzzle, Activity } from 'lucide-react';

export function Dashboard() {
  const [stats, setStats] = useState({ sessions: 0, workflows: 0, extensions: 0 });
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.sessions.list({ limit: 1 }),
      api.workflows.list(),
      api.extensions.list(),
      api.sessions.list({ limit: 5 }),
    ]).then(([s, w, e, r]) => {
      setStats({ sessions: s.total || 0, workflows: w.data?.length || 0, extensions: e.data?.length || 0 });
      setRecent(r.data || []);
    }).catch(() => {});
  }, []);

  const cards = [
    { label: 'Sessions', value: stats.sessions, icon: MessageSquare, color: '#3B82F6' },
    { label: 'Workflows', value: stats.workflows, icon: GitBranch, color: '#10B981' },
    { label: 'Extensions', value: stats.extensions, icon: Puzzle, color: '#F59E0B' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#F8FAFC' }}>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: '#1E293B', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#94A3B8', fontSize: '14px' }}>{c.label}</span>
              <c.icon size={20} color={c.color} />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#F8FAFC' }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#1E293B', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#F8FAFC' }}>Recent Sessions</h3>
        {recent.length === 0 ? (
          <p style={{ color: '#94A3B8' }}>No sessions yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recent.map((s: any) => (
              <div key={s.id} style={{ padding: '12px', background: '#0B1120', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500, color: '#F8FAFC' }}>{s.title}</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>{new Date(s.updated_at).toLocaleString()}</div>
                </div>
                <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', background: s.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)', color: s.status === 'active' ? '#10B981' : '#94A3B8' }}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
