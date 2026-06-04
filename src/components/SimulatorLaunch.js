import React, { useState, useEffect, useRef } from 'react';

export default function SimulatorLaunch() {
  const [launched, setLaunched] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    const handler = (e) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.();
    } else {
      document.exitFullscreen();
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        maxWidth: 700,
        margin: '0 auto',
        textAlign: 'center',
      }}
    >
      {!launched ? (
        <div
          onClick={() => setLaunched(true)}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#232340')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#1a1a2e')}
          style={{
            border: '2px dashed #444',
            borderRadius: 8,
            padding: '48px 24px',
            cursor: 'pointer',
            background: '#1a1a2e',
            transition: 'background 0.2s',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>⌨</div>
          <div
            style={{
              fontSize: 18,
              color: '#e94560',
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Launch NumCore Simulator
          </div>
          <div style={{ fontSize: 13, color: '#888' }}>
            Run the full firmware math engine in your browser
            <br />
            No download required &middot; 429 KB &middot; Works offline
          </div>
        </div>
      ) : (
        <>
          <iframe
            src="/simulator/index-standalone.html"
            title="NumCore Simulator"
            style={{
              border: 'none',
              borderRadius: 8,
              maxWidth: '100%',
              width: 700,
              height: 600,
            }}
          />
          <button
            onClick={toggleFullscreen}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'rgba(0,0,0,0.5)',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: 4,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 13,
              zIndex: 10,
            }}
          >
            ⛶ Fullscreen
          </button>
        </>
      )}
    </div>
  );
}
