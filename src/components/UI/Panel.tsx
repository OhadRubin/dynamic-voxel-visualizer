import React, { useState } from 'react';

interface PanelProps {
  children: React.ReactNode;
  title: string;
  isMinimizable?: boolean;
  top?: string;
  left?: string;
  bottom?: string;
  right?: string;
}

const Panel: React.FC<PanelProps> = ({ 
  children, 
  title, 
  isMinimizable = false,
  top,
  left,
  bottom,
  right
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  const style = {
    position: 'absolute' as const,
    top,
    left,
    bottom,
    right,
    // TODO: Add panel styling (semi-transparent background, border, padding, etc.)
  };

  return (
    <div style={style}>
      <div>
        <h3>{title}</h3>
        {isMinimizable && (
          <button onClick={() => setIsMinimized(!isMinimized)}>
            {isMinimized ? '+' : '-'}
          </button>
        )}
      </div>
      {!isMinimized && children}
    </div>
  );
};

export default Panel;
