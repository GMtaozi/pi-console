import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Search, Plus, Send, Trash2 } from 'lucide-react';

export function Sessions() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await api.sessions.list({ search, limit: 50 });
    setSessions(res.data || []);
  }

  useEffect(() => { load(); }, [search]);

  async function createSession() {
    const s = await api.sessions.create('New Session');
    setSessions([s, ...sessions]);
    setSelected(s);
  }

  async function openSession(id: string) {
    const s = await api.sessions.get(id);
    setSelected(s);
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selected) return;
    setLoading(true);
    const updated = await api.sessions.sendMessage(selected.id, 'user', newMsg.trim());
    setSelected(updated);
    setNewMsg('');
    setLoading(false);
    load();
  }

  async function deleteSession(id: string) {
    await api.sessions.delete(id);
    if (selected?.id === id) setSelected(null);
    load();
  }

  return (
    <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 48px)' }}>
      <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              placeholder="Search sessions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: '32px' }}
            />
          </div>
          <button onClick={createSession} style={{ padding: '8px 12px', background: '#3B82F6', borderRadius: '6px', color: '#fff' }}>
            <Plus size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => openSession(s.id)}
              style={{
                padding: '12px',
                background: selected?.id === s.id ? 'rgba(59,130,246,0.15)' : '#1E293B',
                borderRadius: '8px',
                cursor: 'pointer',
                border: selected?.id === s.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 500, color: '#F8FAFC', fontSize: '14px' }}>{s.title}</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>{new Date(s.updated_at).toLocaleString()}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} style={{ color: '#94A3B8' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, background: '#1E293B', borderRadius: '12px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
              <h3 style={{ color: '#F8FAFC', fontWeight: 600 }}>{selected.title}</h3>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(selected.messages || []).map((m: any) => (
                <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: m.role === 'user' ? '#3B82F6' : '#0B1120',
                    color: '#F8FAFC',
                    fontSize: '14px',
                    lineHeight: 1.5,
                  }}>
                    {m.content}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px', textAlign: m.role === 'user' ? 'right' : 'left' }}>
                    {m.role}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #334155', display: 'flex', gap: '8px' }}>
              <input
                placeholder="Type a message..."
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                style={{ flex: 1 }}
              />
              <button onClick={sendMessage} disabled={loading} style={{ padding: '8px 14px', background: '#3B82F6', borderRadius: '6px', color: '#fff' }}>
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
            Select a session to view messages
          </div>
        )}
      </div>
    </div>
  );
}
