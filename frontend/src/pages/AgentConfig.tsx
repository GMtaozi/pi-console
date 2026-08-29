import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Bot, Save, Plus, Trash2, CheckCircle, AlertCircle, TestTube } from 'lucide-react';

export function AgentConfig() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>({});
  const [isNew, setIsNew] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      const res = await api.agentConfig.list();
      const list = res.data || [];
      setConfigs(list);
      if (list.length > 0 && !selected.id) {
        setSelected({ ...list[0] });
      }
    } catch {
      setConfigs([]);
    }
  }

  async function handleSave() {
    try {
      if (isNew) {
        await api.agentConfig.create(selected);
        setIsNew(false);
      } else if (selected.id) {
        await api.agentConfig.updateById(selected.id, selected);
      } else {
        await api.agentConfig.update(selected);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      loadConfigs();
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this config?')) return;
    try {
      await api.agentConfig.delete(id);
      setConfigs(configs.filter((c) => c.id !== id));
      if (selected.id === id) {
        const remaining = configs.filter((c) => c.id !== id);
        setSelected(remaining.length > 0 ? { ...remaining[0] } : {});
      }
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await api.agentConfig.setDefault(id);
      loadConfigs();
    } catch (err: any) {
      alert('Set default failed: ' + err.message);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.agentConfig.test(selected.id);
      setTestResult({ success: true, message: res.response || 'Connection OK' });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  }

  function handleNew() {
    setIsNew(true);
    setSelected({ name: '', model: 'gpt-4o', temperature: 0.7, max_tokens: 2048, system_prompt: '', api_key: '', is_default: false });
    setTestResult(null);
  }

  function selectConfig(c: any) {
    setIsNew(false);
    setSelected({ ...c });
    setTestResult(null);
  }

  return (
    <div style={{ maxWidth: '960px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Bot size={24} /> Agent Configuration
      </h1>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Sidebar */}
        <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={handleNew} style={{ padding: '10px', background: '#3B82F6', borderRadius: '8px', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Plus size={16} /> New Config
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {configs.map((c) => (
              <div
                key={c.id}
                onClick={() => selectConfig(c)}
                style={{
                  padding: '12px',
                  background: selected.id === c.id ? 'rgba(59,130,246,0.15)' : '#1E293B',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: selected.id === c.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, color: '#F8FAFC', fontSize: '14px' }}>{c.name || 'Unnamed'}</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>{c.model} {c.is_default ? '(default)' : ''}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} style={{ color: '#94A3B8' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div style={{ flex: 1, background: '#1E293B', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>Agent Name</label>
            <input value={selected.name || ''} onChange={(e) => setSelected({ ...selected, name: e.target.value })} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>Model</label>
            <select value={selected.model || 'gpt-4o'} onChange={(e) => setSelected({ ...selected, model: e.target.value })} style={{ width: '100%' }}>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>API Key</label>
            <input
              type="password"
              placeholder="sk-... (OpenAI) or your Claude API key"
              value={selected.api_key || ''}
              onChange={(e) => setSelected({ ...selected, api_key: e.target.value })}
              style={{ width: '100%' }}
            />
            <p style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
              Your API key is stored securely and only used for LLM requests.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>Temperature</label>
              <input type="number" step="0.1" min="0" max="2" value={selected.temperature ?? 0.7} onChange={(e) => setSelected({ ...selected, temperature: parseFloat(e.target.value) })} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>Max Tokens</label>
              <input type="number" step="1" min="1" max="8192" value={selected.max_tokens ?? 2048} onChange={(e) => setSelected({ ...selected, max_tokens: parseInt(e.target.value, 10) })} style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>System Prompt</label>
            <textarea rows={6} value={selected.system_prompt || ''} onChange={(e) => setSelected({ ...selected, system_prompt: e.target.value })} style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={handleSave} style={{ padding: '10px 20px', background: '#3B82F6', borderRadius: '6px', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Save size={16} /> {isNew ? 'Create Config' : 'Save Config'}
            </button>
            {!isNew && selected.id && (
              <button onClick={handleTest} disabled={testing} style={{ padding: '10px 20px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TestTube size={16} /> {testing ? 'Testing...' : 'Test Connection'}
              </button>
            )}
            {!isNew && selected.id && !selected.is_default && (
              <button onClick={() => handleSetDefault(selected.id)} style={{ padding: '10px 20px', background: '#10B981', borderRadius: '6px', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={16} /> Set Default
              </button>
            )}
            {saved && <span style={{ color: '#10B981', fontSize: '14px' }}>Saved!</span>}
          </div>
          {testResult && (
            <div style={{
              padding: '12px',
              borderRadius: '8px',
              background: testResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${testResult.success ? '#10B981' : '#EF4444'}`,
              color: testResult.success ? '#10B981' : '#EF4444',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              {testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {testResult.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
