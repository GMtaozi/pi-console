import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Bot, Save } from 'lucide-react';

export function AgentConfig() {
  const [config, setConfig] = useState<any>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.agentConfig.get().then((c) => setConfig(c || {})).catch(() => setConfig({}));
  }, []);

  async function handleSave() {
    await api.agentConfig.update(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Bot size={24} /> Agent Configuration
      </h1>

      <div style={{ background: '#1E293B', borderRadius: '12px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>Agent Name</label>
          <input value={config.name || ''} onChange={(e) => setConfig({ ...config, name: e.target.value })} style={{ width: '100%' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>Model</label>
          <select value={config.model || 'gpt-4o'} onChange={(e) => setConfig({ ...config, model: e.target.value })} style={{ width: '100%' }}>
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
            value={config.api_key || ''}
            onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
            style={{ width: '100%' }}
          />
          <p style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
            Your API key is stored securely and only used for LLM requests.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>Temperature</label>
            <input type="number" step="0.1" min="0" max="2" value={config.temperature ?? 0.7} onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>Max Tokens</label>
            <input type="number" step="1" min="1" max="8192" value={config.max_tokens ?? 2048} onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value, 10) })} style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '14px', color: '#CBD5E1', marginBottom: '6px' }}>System Prompt</label>
          <textarea rows={6} value={config.system_prompt || ''} onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })} style={{ width: '100%', resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={handleSave} style={{ padding: '10px 20px', background: '#3B82F6', borderRadius: '6px', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Save size={16} /> Save Config
          </button>
          {saved && <span style={{ color: '#10B981', fontSize: '14px' }}>Saved!</span>}
        </div>
      </div>
    </div>
  );
}
