import React from 'react';
import { Play, StepForward, RotateCcw, Square } from 'lucide-react';

export type DebugMode = 'normal' | 'step' | 'breakpoint';

interface DebugToolbarProps {
  mode: DebugMode;
  onModeChange: (mode: DebugMode) => void;
  isRunning: boolean;
  isPaused: boolean;
  onStart: () => void;
  onStep: () => void;
  onResume: () => void;
  onAbort: () => void;
}

export function DebugToolbar({
  mode,
  onModeChange,
  isRunning,
  isPaused,
  onStart,
  onStep,
  onResume,
  onAbort,
}: DebugToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 14px',
        background: '#1E293B',
        borderBottom: '1px solid #334155',
      }}
    >
      <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 500 }}>Debug Mode</span>
      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value as DebugMode)}
        disabled={isRunning}
        style={{
          padding: '4px 8px',
          fontSize: '12px',
          background: '#0B1120',
          border: '1px solid #334155',
          borderRadius: '4px',
          color: '#F8FAFC',
        }}
      >
        <option value="normal">Normal</option>
        <option value="step">Step</option>
        <option value="breakpoint">Breakpoint</option>
      </select>

      <div style={{ width: '1px', height: '20px', background: '#334155', margin: '0 4px' }} />

      {!isRunning && !isPaused && (
        <button
          onClick={onStart}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 10px',
            background: '#10B981',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <Play size={13} /> Start
        </button>
      )}

      {isPaused && (
        <>
          <button
            onClick={onStep}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              background: '#3B82F6',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <StepForward size={13} /> Next Step
          </button>
          <button
            onClick={onResume}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              background: '#10B981',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <RotateCcw size={13} /> Continue
          </button>
        </>
      )}

      {(isRunning || isPaused) && (
        <button
          onClick={onAbort}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 10px',
            background: '#EF4444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <Square size={13} /> Abort
        </button>
      )}

      {isRunning && !isPaused && (
        <span style={{ fontSize: '12px', color: '#3B82F6', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="debug-pulse-dot" />
          Running
        </span>
      )}

      {isPaused && (
        <span style={{ fontSize: '12px', color: '#F59E0B', fontWeight: 500 }}>
          ⏸ Paused
        </span>
      )}
    </div>
  );
}
