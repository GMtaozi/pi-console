import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Node, Edge } from '@xyflow/react';
import {
  Search,
  Tag,
  LayoutTemplate,
  Plus,
  Trash2,
  Edit3,
  X,
  Grid3X3,
  List,
  Clock,
  Layers,
  AlertCircle,
} from 'lucide-react';

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  nodes: Node[];
  edges: Edge[];
  source: 'system' | 'user';
  user_id?: string;
  created_at: string;
  updated_at: string;
}

export function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(false);
  const [detailModal, setDetailModal] = useState<TemplateItem | null>(null);
  const [editModal, setEditModal] = useState<TemplateItem | null>(null);
  const [createModal, setCreateModal] = useState(false);
  const [createData, setCreateData] = useState({ name: '', description: '', tags: '', category: '' });
  const [editData, setEditData] = useState({ name: '', description: '', tags: '', category: '' });
  const [sort, setSort] = useState('updated_at');
  const [order, setOrder] = useState('desc');
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const tagsParam = selectedTags.length > 0 ? selectedTags.join(',') : undefined;
      const res = await api.workflows.templates({
        search: search || undefined,
        tags: tagsParam,
        sort,
        order,
      });
      setTemplates(res.data || []);
    } catch (e: any) {
      console.error('Failed to fetch templates:', e);
      showToast('Failed to fetch templates: ' + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [search, selectedTags, sort, order, showToast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    api.workflows.templateTags().then((r) => setAllTags(r.data || [])).catch(() => {});
  }, []);

  // Debounced search input handler
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      // The actual fetch is triggered by useEffect on search change
    }, 300);
  };

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function useTemplate(templateId: string) {
    try {
      const wf = await api.workflows.fromTemplate(templateId);
      navigate(`/workflows`);
      sessionStorage.setItem('selectWorkflowId', wf.id);
      showToast('Workflow created from template', 'success');
    } catch (e: any) {
      showToast('Failed to create workflow from template: ' + (e.message || 'Unknown error'));
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await api.workflows.deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      showToast('Template deleted', 'success');
    } catch (e: any) {
      showToast('Failed to delete template: ' + (e.message || 'Unknown error'));
    }
  }

  async function handleCreateTemplate() {
    try {
      const tags = createData.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const t = await api.workflows.createTemplate({
        name: createData.name,
        description: createData.description,
        tags,
        category: createData.category,
        nodes: [],
        edges: [],
      });
      setTemplates((prev) => [t, ...prev]);
      setCreateModal(false);
      setCreateData({ name: '', description: '', tags: '', category: '' });
      showToast('Template created', 'success');
    } catch (e: any) {
      showToast('Failed to create template: ' + (e.message || 'Unknown error'));
    }
  }

  async function handleUpdateTemplate() {
    if (!editModal) return;
    try {
      const tags = editData.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const t = await api.workflows.updateTemplate(editModal.id, {
        name: editData.name,
        description: editData.description,
        tags,
        category: editData.category,
      });
      setTemplates((prev) => prev.map((item) => (item.id === t.id ? { ...item, ...t } : item)));
      setEditModal(null);
      showToast('Template updated', 'success');
    } catch (e: any) {
      showToast('Failed to update template: ' + (e.message || 'Unknown error'));
    }
  }

  function openEdit(template: TemplateItem) {
    setEditModal(template);
    setEditData({
      name: template.name,
      description: template.description || '',
      tags: (template.tags || []).join(', '),
      category: template.category || '',
    });
  }

  function nodeTypeCounts(nodes: Node[]) {
    const counts: Record<string, number> = {};
    (nodes || []).forEach((n) => {
      counts[n.type] = (counts[n.type] || 0) + 1;
    });
    return counts;
  }

  const categoryColors: Record<string, string> = {
    content: '#10B981',
    dev: '#F59E0B',
    data: '#3B82F6',
    conversation: '#8B5CF6',
    default: '#6B7280',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 200,
            padding: '12px 16px',
            borderRadius: '8px',
            background: toast.type === 'error' ? '#EF4444' : '#10B981',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <AlertCircle size={16} />
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#F8FAFC', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LayoutTemplate size={24} />
            Template Library
          </h1>
          <p style={{ color: '#94A3B8', fontSize: '14px' }}>Browse, search, and use workflow templates</p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          style={{ padding: '10px 16px', background: '#3B82F6', borderRadius: '8px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500 }}
        >
          <Plus size={16} /> New Template
        </button>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search templates..."
            style={{ width: '100%', padding: '10px 12px 10px 36px', background: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC', fontSize: '14px' }}
          />
        </div>
        <select
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(':');
            setSort(s);
            setOrder(o);
          }}
          style={{ padding: '10px 12px', background: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC', fontSize: '14px' }}
        >
          <option value="updated_at:desc">Recently Updated</option>
          <option value="created_at:desc">Recently Created</option>
          <option value="name:asc">Name A-Z</option>
          <option value="name:desc">Name Z-A</option>
        </select>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => setViewMode('grid')} style={{ padding: '10px', background: viewMode === 'grid' ? '#334155' : '#1E293B', borderRadius: '8px', color: '#F8FAFC', border: '1px solid #334155' }}>
            <Grid3X3 size={16} />
          </button>
          <button onClick={() => setViewMode('list')} style={{ padding: '10px', background: viewMode === 'list' ? '#334155' : '#1E293B', borderRadius: '8px', color: '#F8FAFC', border: '1px solid #334155' }}>
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Tag Cloud */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
          <Tag size={14} style={{ color: '#94A3B8' }} />
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              style={{
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '12px',
                border: '1px solid #334155',
                background: selectedTags.includes(tag) ? '#3B82F6' : '#1E293B',
                color: selectedTags.includes(tag) ? '#fff' : '#94A3B8',
                cursor: 'pointer',
              }}
            >
              {tag}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button onClick={() => setSelectedTags([])} style={{ fontSize: '12px', color: '#EF4444', background: 'transparent', cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Template Grid/List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>Loading templates...</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
          <LayoutTemplate size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
          <p>No templates found</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {templates.map((t) => (
            <div
              key={t.id}
              style={{
                background: '#1E293B',
                borderRadius: '12px',
                border: '1px solid #334155',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#475569'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#334155'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: categoryColors[t.category || 'default'] || categoryColors.default,
                    }}
                  />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>{t.name}</h3>
                </div>
                {t.source === 'user' && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => openEdit(t)} style={{ color: '#94A3B8', padding: '4px' }}>
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => deleteTemplate(t.id)} style={{ color: '#EF4444', padding: '4px' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.5, minHeight: '40px' }}>{t.description || 'No description'}</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(t.tags || []).map((tag) => (
                  <span key={tag} style={{ padding: '2px 8px', background: '#0B1120', borderRadius: '12px', fontSize: '11px', color: '#94A3B8' }}>
                    {tag}
                  </span>
                ))}
                {t.source === 'system' && (
                  <span style={{ padding: '2px 8px', background: 'rgba(59,130,246,0.15)', borderRadius: '12px', fontSize: '11px', color: '#3B82F6' }}>Preset</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748B', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #334155' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Layers size={12} /> {(t.nodes || []).length} nodes
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> {new Date(t.updated_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  onClick={() => setDetailModal(t)}
                  style={{ flex: 1, padding: '8px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', fontSize: '13px', fontWeight: 500 }}
                >
                  Preview
                </button>
                <button
                  onClick={() => useTemplate(t.id)}
                  style={{ flex: 1, padding: '8px', background: '#3B82F6', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 500 }}
                >
                  Use Template
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {templates.map((t) => (
            <div
              key={t.id}
              style={{
                background: '#1E293B',
                borderRadius: '10px',
                border: '1px solid #334155',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: categoryColors[t.category || 'default'] || categoryColors.default,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>{t.name}</h3>
                  {t.source === 'system' && (
                    <span style={{ padding: '2px 8px', background: 'rgba(59,130,246,0.15)', borderRadius: '12px', fontSize: '11px', color: '#3B82F6' }}>Preset</span>
                  )}
                </div>
                <p style={{ fontSize: '13px', color: '#94A3B8' }}>{t.description || 'No description'}</p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '200px' }}>
                {(t.tags || []).map((tag) => (
                  <span key={tag} style={{ padding: '2px 8px', background: '#0B1120', borderRadius: '12px', fontSize: '11px', color: '#94A3B8' }}>
                    {tag}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748B', flexShrink: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Layers size={12} /> {(t.nodes || []).length} nodes
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button onClick={() => setDetailModal(t)} style={{ padding: '6px 10px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', fontSize: '12px' }}>
                  Preview
                </button>
                <button onClick={() => useTemplate(t.id)} style={{ padding: '6px 10px', background: '#3B82F6', borderRadius: '6px', color: '#fff', fontSize: '12px' }}>
                  Use
                </button>
                {t.source === 'user' && (
                  <>
                    <button onClick={() => openEdit(t)} style={{ padding: '6px', background: '#334155', borderRadius: '6px', color: '#94A3B8' }}>
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => deleteTemplate(t.id)} style={{ padding: '6px', background: '#334155', borderRadius: '6px', color: '#EF4444' }}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setDetailModal(null)}
        >
          <div
            style={{
              background: '#1E293B',
              borderRadius: '16px',
              border: '1px solid #334155',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#F8FAFC' }}>{detailModal.name}</h2>
              <button onClick={() => setDetailModal(null)} style={{ color: '#94A3B8' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '16px' }}>{detailModal.description || 'No description'}</p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {(detailModal.tags || []).map((tag) => (
                <span key={tag} style={{ padding: '4px 10px', background: '#0B1120', borderRadius: '12px', fontSize: '12px', color: '#94A3B8' }}>
                  {tag}
                </span>
              ))}
              {detailModal.source === 'system' && (
                <span style={{ padding: '4px 10px', background: 'rgba(59,130,246,0.15)', borderRadius: '12px', fontSize: '12px', color: '#3B82F6' }}>Preset</span>
              )}
            </div>

            <div style={{ background: '#0B1120', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC', marginBottom: '12px' }}>Node Structure</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(nodeTypeCounts(detailModal.nodes)).map(([type, count]) => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: categoryColors[type] || '#6B7280' }} />
                    <span style={{ fontSize: '13px', color: '#F8FAFC', textTransform: 'capitalize', flex: 1 }}>{type}</span>
                    <span style={{ fontSize: '13px', color: '#94A3B8' }}>{count}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#94A3B8' }}>
                <span>Total nodes: {(detailModal.nodes || []).length}</span>
                <span>Total edges: {(detailModal.edges || []).length}</span>
              </div>
            </div>

            <button
              onClick={() => { useTemplate(detailModal.id); setDetailModal(null); }}
              style={{ width: '100%', padding: '12px', background: '#3B82F6', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 600 }}
            >
              Use This Template
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {createModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}
          onClick={() => setCreateModal(false)}
        >
          <div style={{ background: '#1E293B', borderRadius: '16px', border: '1px solid #334155', width: '100%', maxWidth: '440px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#F8FAFC', marginBottom: '16px' }}>Create Template</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Name</label>
                <input value={createData.name} onChange={(e) => setCreateData({ ...createData, name: e.target.value })} style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Description</label>
                <textarea value={createData.description} onChange={(e) => setCreateData({ ...createData, description: e.target.value })} rows={3} style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC', resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Tags (comma-separated)</label>
                <input value={createData.tags} onChange={(e) => setCreateData({ ...createData, tags: e.target.value })} placeholder="e.g. nlp, content" style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Category</label>
                <input value={createData.category} onChange={(e) => setCreateData({ ...createData, category: e.target.value })} placeholder="e.g. content, dev, data" style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setCreateModal(false)} style={{ flex: 1, padding: '10px', background: '#334155', borderRadius: '8px', color: '#F8FAFC' }}>Cancel</button>
              <button onClick={handleCreateTemplate} style={{ flex: 1, padding: '10px', background: '#3B82F6', borderRadius: '8px', color: '#fff' }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}
          onClick={() => setEditModal(null)}
        >
          <div style={{ background: '#1E293B', borderRadius: '16px', border: '1px solid #334155', width: '100%', maxWidth: '440px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#F8FAFC', marginBottom: '16px' }}>Edit Template</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Name</label>
                <input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Description</label>
                <textarea value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} rows={3} style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC', resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Tags (comma-separated)</label>
                <input value={editData.tags} onChange={(e) => setEditData({ ...editData, tags: e.target.value })} style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Category</label>
                <input value={editData.category} onChange={(e) => setEditData({ ...editData, category: e.target.value })} style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setEditModal(null)} style={{ flex: 1, padding: '10px', background: '#334155', borderRadius: '8px', color: '#F8FAFC' }}>Cancel</button>
              <button onClick={handleUpdateTemplate} style={{ flex: 1, padding: '10px', background: '#3B82F6', borderRadius: '8px', color: '#fff' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
