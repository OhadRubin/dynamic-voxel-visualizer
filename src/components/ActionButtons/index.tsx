import React from 'react';

interface ActionButtonsProps {
  isPaused: boolean;
  onClear: () => void;
  onPause: () => void;
  onCenter: () => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ 
  isPaused, 
  onClear, 
  onPause, 
  onCenter 
}) => {
  const buttonStyle: React.CSSProperties = {
    background: '#333',
    color: 'white',
    border: '1px solid #666',
    padding: '8px 16px',
    margin: '5px 0',
    cursor: 'pointer',
    borderRadius: '4px',
    width: '100%'
  };

  return (
    <div>
      <button 
        style={buttonStyle}
        onClick={onClear}
        onMouseEnter={(e) => e.currentTarget.style.background = '#444'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#333'}
      >
        Clear All Voxels
      </button>
      <button 
        style={buttonStyle}
        onClick={onPause}
        onMouseEnter={(e) => e.currentTarget.style.background = '#444'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#333'}
      >
        {isPaused ? 'Resume Stream' : 'Pause Stream'}
      </button>
      <button 
        style={buttonStyle}
        onClick={onCenter}
        onMouseEnter={(e) => e.currentTarget.style.background = '#444'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#333'}
      >
        Center Camera
      </button>
    </div>
  );
};

export default ActionButtons;
