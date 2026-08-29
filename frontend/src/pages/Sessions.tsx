import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { Search, Plus, Send, Trash2, Download, ChevronDown, Square } from 'lucide-react';

export function Sessions() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const exportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function load() {
    const res = await api.sessions.list({ search, limit: 50 });
    setSessions(res.data || []);
  }

  useEffect(() => { load(); }, [search]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selected?.messages, streamingContent]);

  async function createSession() {
    const s = await api.sessions.create('New Session');
    setSessions([s, ...sessions]);
    setSelected(s);
  }

  async function openSession(id: string) {
    const s = await api.sessions.get(id);
    setSelected(s);
    setStreamingContent('');
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selected) return;
    setLoading(true);
    setStreamingContent('');

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // Optimistically add user message to UI
      const userMsg = { id: `temp_${Date.now()}`, role: 'user', content: newMsg.trim(), created_at: new Date().toISOString() };
      const tempSelected = { ...selected, messages: [...(selected.messages || []), userMsg] };
      setSelected(tempSelected);
      const msgContent = newMsg.trim();
      setNewMsg('');

      // Use SSE streaming with abort support
      await api.sessions.sendMessageStream(selected.id, 'user', msgContent, (chunk, done) => {
        if (done) {
          setStreamingContent('');
          openSession(selected.id);
        } else {
          setStreamingContent((prev) => prev + chunk);
        }
      }, abortControllerRef.current.signal);
    } catch (err: any) {
      // Silently handle user-initiated abort
      if (err.name === 'AbortError') {
        setStreamingContent('');
        openSession(selected.id);
      } else {
        alert('Send failed: ' + err.message);
        setStreamingContent('');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  async function deleteSession(id: string) {
    await api.sessions.delete(id);
    if (selected?.id === id) setSelected(null);
    load();
  }

  function sanitizeFilename(input: string): string {
    return input.replace(/[\\/:*?"<>|]/g, '-').trim();
  }

  async function handleExport(format: 'markdown' | 'json') {
    if (!selected) return;
    setExportOpen(false);
    setExportLoading(true);
    try {
      const res = await fetch(`/api/sessions/${selected.id}/export?format=${format}`);
      if (!res.ok) {
        if (res.status === 404) {
          alert('会话未找到');
        } else {
          alert('导出失败，请稍后重试');
        }
        return;
      }
      const blob = await res.blob();
      const safeTitle = sanitizeFilename(selected.title || 'untitled');
      const ext = format === 'markdown' ? 'md' : 'json';
      const filename = `session-${selected.id}-${safeTitle}.${ext}`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('导出失败，请检查网络连接');
    } finally {
      setExportLoading(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayMessages = selected ? [...(selected.messages || [])] : [];
  // If streaming, add a temporary assistant message at the end
  if (streamingContent) {
    displayMessages.push({ id: 'streaming', role: 'assistant', content: streamingContent, created_at: new Date().toISOString() });
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
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#F8FAFC', fontWeight: 600, margin: 0 }}>{selected.title}</h3>
              <div ref={exportRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setExportOpen((prev) => !prev)}
                  disabled={exportLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    background: '#0F172A',
                    color: '#CBD5E1',
                    cursor: exportLoading ? 'not-allowed' : 'pointer',
                    opacity: exportLoading ? 0.6 : 1,
                    fontSize: '13px',
                  }}
                >
                  <Download size={14} />
                  {exportLoading ? '导出中…' : '导出'}
                  <ChevronDown size={14} />
                </button>
                {exportOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    background: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 1000,
                    minWidth: '160px',
                    overflow: 'hidden',
                  }}>
                    <div
                      onClick={() => handleExport('markdown')}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        color: '#F8FAFC',
                        fontSize: '13px',
                        borderBottom: '1px solid #334155',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#334155'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      导出为 Markdown
                    </div>
                    <div
                      onClick={() => handleExport('json')}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        color: '#F8FAFC',
                        fontSize: '13px',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#334155'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      导出为 JSON
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {displayMessages.map((m: any) => (
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
                    {m.id === 'streaming' && (
                      <span style={{ display: 'inline-block', width: '6px', height: '14px', background: '#3B82F6', marginLeft: '4px', animation: 'blink 1s infinite', verticalAlign: 'middle' }} />
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px', textAlign: m.role === 'user' ? 'right' : 'left' }}>
                    {m.role}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #334155', display: 'flex', gap: '8px' }}>
              <input
                placeholder="Type a message..."
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && sendMessage()}
                disabled={loading}
                style={{ flex: 1 }}
              />
              {loading && streamingContent ? (
                <button
                  onClick={stopGeneration}
                  style={{ padding: '8px 14px', background: '#EF4444', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Stop generation"
                >
                  <Square size={14} fill="currentColor" /> Stop
                </button>
              ) : (
                <button onClick={sendMessage} disabled={loading} style={{ padding: '8px 14px', background: '#3B82F6', borderRadius: '6px', color: '#fff' }}>
                  <Send size={16} />
                </button>
              )}
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
