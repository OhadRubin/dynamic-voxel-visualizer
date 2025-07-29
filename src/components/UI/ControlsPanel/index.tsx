import React from 'react';
import Panel from '../Panel';

const ControlsPanel: React.FC = () => {
  const contentStyle: React.CSSProperties = {
    fontSize: '12px'
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '15px'
  };

  const headerStyle: React.CSSProperties = {
    margin: '0 0 8px 0',
    fontWeight: 'bold'
  };

  return (
    <Panel title="🎮 Controls:" bottom="20px" left="20px">
      <div style={contentStyle}>
        <div style={sectionStyle}>
          • Left Mouse: Rotate<br/>
          • Right Mouse: Pan<br/>
          • Scroll: Zoom<br/>
          • Double-click: Focus on voxel
        </div>
        
        <div style={headerStyle}>📍 Debug Info:</div>
        <div>
          • Red axis = X<br/>
          • Green axis = Y<br/>
          • Blue axis = Z
        </div>
      </div>
    </Panel>
  );
};

export default ControlsPanel;
