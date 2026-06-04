import React, { useState } from 'react';

export default function SimulatorLaunch() {
  const [launched, setLaunched] = useState(false);

  return (
    <div style={{ position: 'relative', maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
      {!launched ? (
        <div
          onClick={() => setLaunched(true)}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#232340')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#1a1a2e')}
          style={{
            border: '2px dashed #555',
            borderRadius: 8,
            padding: '40px 24px',
            cursor: 'pointer',
            background: '#1a1a2e',
            transition: 'background 0.2s',
          }}
        >
          <div style={{ fontSize: 14, color: '#e94560', fontWeight: 700, marginBottom: 8 }}>
            Launch NumCore Simulator
          </div>
          <div style={{ fontSize: 13, color: '#888' }}>
            Run the full firmware math engine in your browser
            <br />
            No download required &middot; 429 KB &middot; Works offline
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}
