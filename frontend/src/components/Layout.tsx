import React from 'react';
import { Sidebar } from './Sidebar';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh', background: '#0B1120' }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: '220px',
          padding: '24px',
          overflow: 'auto',
          minHeight: '100vh',
        }}
      >
        {children}
      </main>
    </div>
  );
}
