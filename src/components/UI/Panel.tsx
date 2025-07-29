import React, { useState } from 'react';

interface PanelProps {
  children: React.ReactNode;
  title: string;
  isMinimizable?: boolean;
  defaultMinimized?: boolean;
  top?: string;
  left?: string;
  bottom?: string;
  right?: string;
  minWidth?: string;
  className?: string;
}

const Panel: React.FC<PanelProps> = ({ 
  children, 
  title, 
  isMinimizable = false,
  defaultMinimized = false,
  top,
  left,
  bottom,
  right,
  minWidth,
  className = ''
}) => {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top,
    left,
    bottom,
    right,
    zIndex: 100,
    color: 'white',
    background: 'rgba(0, 0, 0, 0.8)',
    padding: '15px',
    borderRadius: '8px',
    fontSize: '14px',
    border: '1px solid #444',
    backdropFilter: 'blur(10px)',
    minWidth: isMinimized ? 'auto' : minWidth,
    fontFamily: "'Courier New', monospace"
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isMinimized ? '0' : '10px'
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: '14px',
    fontWeight: 'normal'
  };

  const buttonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#ccc',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: '3px',
    width: 'auto',
    margin: 0
  };

  const contentStyle: React.CSSProperties = {
    transition: 'all 0.3s ease'
  };

  return (
    <div 
      style={panelStyle} 
      className={`ui-panel ${isMinimized ? 'minimized' : ''} ${className}`}
    >
      <div style={headerStyle}>
        <h3 style={titleStyle}>{title}</h3>
        {isMinimizable && (
          <button 
            style={buttonStyle}
            onClick={() => setIsMinimized(!isMinimized)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#444';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#ccc';
            }}
          >
            {isMinimized ? '▼' : '▲'}
          </button>
        )}
      </div>
      {!isMinimized && (
        <div style={contentStyle} className="panel-content">
          {children}
        </div>
      )}
    </div>
  );
};

export default Panel;
