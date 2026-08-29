import React from 'react';
import { Settings as SettingsIcon, Monitor, Shield, Bell, Database } from 'lucide-react';

export function Settings() {
  return (
    <div style={{ maxWidth: '720px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <SettingsIcon size={24} /> Settings
      </h1>

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
