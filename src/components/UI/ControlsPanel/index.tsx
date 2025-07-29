import React from 'react';
import Panel from '../Panel';

const ControlsPanel: React.FC = () => {
  return (
    <Panel title="Controls" bottom="10px" left="10px">
      <div>
        <h4>Mouse Controls</h4>
        <ul>
          <li>Left click + drag: Rotate camera</li>
          <li>Right click + drag: Pan camera</li>
          <li>Mouse wheel: Zoom in/out</li>
          <li>Double click: Select voxel</li>
        </ul>
        
        <h4>Axis Colors</h4>
        <ul>
          <li><span style={{color: '#ff0000'}}>Red</span>: X-axis</li>
          <li><span style={{color: '#00ff00'}}>Green</span>: Y-axis</li>
          <li><span style={{color: '#0000ff'}}>Blue</span>: Z-axis</li>
        </ul>
      </div>
    </Panel>
  );
};

export default ControlsPanel;
