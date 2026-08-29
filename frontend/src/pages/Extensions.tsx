import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Puzzle, Plus, Trash2 } from 'lucide-react';

export function Extensions() {
  const [extensions, setExtensions] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', version: '1.0.0' });

  async function load() {
    const res = await api.extensions.list();
    setExtensions(res.data || []);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.name) return;
    await api.extensions.create(form);
    setForm({ name: '', description: '', version: '1.0.0' });
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    await api.extensions.delete(id);
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Puzzle size={24} /> Extensions
        </h1>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '8px 14px', background: '#3B82F6', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
          <Plus size={16} /> Add Extension
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#1E293B', borderRadius: '12px', padding: '20px', border: '1px solid #334155', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} />
          <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%' }} />
          <input placeholder="Version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={create} style={{ padding: '8px 16px', background: '#3B82F6', borderRadius: '6px', color: '#fff' }}>Create</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: '#334155', borderRadius: '6px', color: '#F8FAFC' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {extensions.map((ext) => (
          <div key={ext.id} style={{ background: '#1E293B', borderRadius: '12px', padding: '16px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <h3 style={{ fontWeight: 600, color: '#F8FAFC' }}>{ext.name}</h3>
              <button onClick={() => remove(ext.id)} style={{ color: '#94A3B8' }}>
                <Trash2 size={14} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '8px' }}>{ext.description || 'No description'}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', padding: '2px 8px', background: '#0B1120', borderRadius: '4px', color: '#CBD5E1' }}>v{ext.version}</span>
              <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: ext.enabled ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)', color: ext.enabled ? '#10B981' : '#94A3B8' }}>
                {ext.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
