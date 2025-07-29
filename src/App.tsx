import React from 'react';
import * as THREE from 'three';
import { useVoxelStream } from './hooks/useVoxelStream';
import VoxelCanvas from './components/VoxelCanvas';
import StatusPanel from './components/UI/StatusPanel';
import ControlsPanel from './components/UI/ControlsPanel';
import './App.css';

function App() {
  const {
    voxels,
    stats,
    isPaused,
    centerRequest,
    clearAllVoxels,
    togglePause,
    centerCamera
  } = useVoxelStream('ws://localhost:8080');

  const handleVoxelDoubleClick = (position: THREE.Vector3) => {
    console.log('Double-clicked voxel at:', position);
  };

  return (
    <div style={{ 
      margin: 0, 
      padding: 0, 
      background: '#000', 
      color: '#fff', 
      fontFamily: "'Courier New', monospace", 
      overflow: 'hidden',
      height: '100vh',
      width: '100vw'
    }}>
      {/* Three.js Canvas */}
      <VoxelCanvas
        voxels={voxels}
        centerRequest={centerRequest}
        bounds={stats.bounds}
        onVoxelDoubleClick={handleVoxelDoubleClick}
      />
      
      {/* UI Panels */}
      <StatusPanel
        stats={stats}
        isPaused={isPaused}
        onClear={clearAllVoxels}
        onPause={togglePause}
        onCenter={centerCamera}
      />
      
      <ControlsPanel />
    </div>
  );
}

export default App;
