import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  Settings as SettingsIcon,
  Monitor,
  Shield,
  Bell,
  Database,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Key,
} from 'lucide-react';

interface EnvVar {
  id: string;
  key: string;
  value: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export function Settings() {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => {
    loadEnvVars();
  }, []);

  async function loadEnvVars() {
    setLoading(true);
    setError('');
    try {
      const res = await api.settings.listEnvVars();
      setEnvVars(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load environment variables');
    } finally {
      setLoading(false);
    }
  }

  async function createEnvVar() {
    if (!newKey.trim() || !newValue.trim()) return;
    setError('');
    try {
      await api.settings.createEnvVar({
        key: newKey.trim(),
        value: newValue,
        description: newDesc,
      });
      setNewKey('');
      setNewValue('');
      setNewDesc('');
      setShowCreate(false);
      loadEnvVars();
    } catch (err: any) {
      setError(err.message || 'Failed to create variable');
    }
  }

  async function updateEnvVar(id: string) {
    if (!editKey.trim() || !editValue.trim()) return;
    setError('');
    try {
      await api.settings.updateEnvVar(id, {
        key: editKey.trim(),
        value: editValue,
        description: editDesc,
      });
      setEditingId(null);
      loadEnvVars();
    } catch (err: any) {
      setError(err.message || 'Failed to update variable');
    }
  }

  async function deleteEnvVar(id: string) {
    if (!confirm('Are you sure you want to delete this variable?')) return;
    setError('');
    try {
      await api.settings.deleteEnvVar(id);
      loadEnvVars();
    } catch (err: any) {
      setError(err.message || 'Failed to delete variable');
    }
  }

  function startEdit(v: EnvVar) {
    setEditingId(v.id);
    setEditKey(v.key);
    setEditValue(v.value);
    setEditDesc(v.description || '');
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditKey('');
    setEditValue('');
    setEditDesc('');
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <SettingsIcon size={24} /> Settings
      </h1>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', color: '#EF4444', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Environment Variables Section */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={18} color="#3B82F6" /> Environment Variables
          </h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{ padding: '6px 12px', background: '#3B82F6', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Plus size={14} /> Add Variable
          </button>
        </div>

        {showCreate && (
          <div style={{ padding: '16px', background: '#1E293B', borderRadius: '12px', border: '1px solid #334155', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>Key</label>
                  <input
                    placeholder="e.g. API_BASE_URL"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>Value</label>
                  <input
                    placeholder="e.g. https://api.example.com"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>Description (optional)</label>
                <input
                  placeholder="Brief description of this variable"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCreate(false)} style={{ padding: '6px 12px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', fontSize: '13px' }}>
                  Cancel
                </button>
                <button onClick={createEnvVar} style={{ padding: '6px 12px', background: '#3B82F6', borderRadius: '6px', color: '#fff', fontSize: '13px' }}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>Loading...</div>
        ) : envVars.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '14px', background: '#1E293B', borderRadius: '12px', border: '1px solid #334155' }}>
            No environment variables yet. Click "Add Variable" to create one.
          </div>
        ) : (
          <div style={{ background: '#1E293B', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', background: '#0B1120' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94A3B8', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Key</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94A3B8', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Value</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94A3B8', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Description</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: '#94A3B8', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {envVars.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #334155' }}>
                    {editingId === v.id ? (
                      <>
                        <td style={{ padding: '10px 16px' }}>
                          <input value={editKey} onChange={(e) => setEditKey(e.target.value)} style={{ width: '100%', fontSize: '13px' }} />
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <input value={editValue} onChange={(e) => setEditValue(e.target.value)} style={{ width: '100%', fontSize: '13px' }} />
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ width: '100%', fontSize: '13px' }} />
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button onClick={() => updateEnvVar(v.id)} style={{ padding: '4px 8px', background: '#10B981', borderRadius: '4px', color: '#fff' }} title="Save">
                              <Check size={14} />
                            </button>
                            <button onClick={cancelEdit} style={{ padding: '4px 8px', background: '#334155', borderRadius: '4px', color: '#F8FAFC' }} title="Cancel">
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '12px 16px', color: '#F8FAFC', fontFamily: 'monospace', fontSize: '13px' }}>{v.key}</td>
                        <td style={{ padding: '12px 16px', color: '#CBD5E1', fontFamily: 'monospace', fontSize: '13px' }}>{v.value}</td>
                        <td style={{ padding: '12px 16px', color: '#94A3B8', fontSize: '13px' }}>{v.description || '-'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button onClick={() => startEdit(v)} style={{ padding: '4px 8px', background: '#334155', borderRadius: '4px', color: '#F8FAFC' }} title="Edit">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => deleteEnvVar(v.id)} style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.15)', borderRadius: '4px', color: '#EF4444' }} title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Static Info Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <SettingCard
          icon={Monitor}
          title="Appearance"
          description="Dark mode is always enabled. Light mode coming soon."
        />
        <SettingCard
          icon={Shield}
          title="Security"
          description="JWT-based authentication with bcrypt password hashing."
        />
        <SettingCard
          icon={Bell}
          title="Notifications"
          description="Configure alert channels and webhook endpoints."
        />
        <SettingCard
          icon={Database}
          title="Data & Storage"
          description="SQLite database path and backup settings."
        />
      </div>

      <div style={{ marginTop: '32px', padding: '20px', background: '#1E293B', borderRadius: '12px', border: '1px solid #334155' }}>
        <h3 style={{ fontWeight: 600, color: '#F8FAFC', marginBottom: '12px' }}>About Pi Console</h3>
        <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: 1.6 }}>
          Pi Console is the management interface for the Pi Agent platform. It provides
          real-time session monitoring, visual workflow design, agent configuration, and
          extension management. Built with React 18, Vite, TypeScript, and Fastify.
        </p>
        <div style={{ marginTop: '12px', fontSize: '13px', color: '#64748B' }}>Version 1.0.0 MVP</div>
      </div>
    </div>
  );
}

function SettingCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div style={{ padding: '16px 20px', background: '#1E293B', borderRadius: '12px', border: '1px solid #334155', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
      <div style={{ padding: '8px', background: 'rgba(59,130,246,0.15)', borderRadius: '8px' }}>
        <Icon size={18} color="#3B82F6" />
      </div>
      <div>
        <h3 style={{ fontWeight: 600, color: '#F8FAFC', marginBottom: '4px' }}>{title}</h3>
        <p style={{ fontSize: '14px', color: '#94A3B8' }}>{description}</p>
      </div>
    </div>
  );
}
