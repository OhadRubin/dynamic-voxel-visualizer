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
  return (
    <div>
      <button onClick={onClear}>Clear</button>
      <button onClick={onPause}>
        {isPaused ? 'Resume' : 'Pause'}
      </button>
      <button onClick={onCenter}>Center</button>
    </div>
  );
};

export default ActionButtons;
