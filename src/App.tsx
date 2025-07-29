import React, { useState } from 'react';
import * as THREE from 'three';
import { useVoxelStream } from './hooks/useVoxelStream';
import VoxelCanvas, { CameraControls } from './components/VoxelCanvas';
import StatusPanel from './components/UI/StatusPanel';
import ControlsPanel from './components/UI/ControlsPanel';
import './App.css';

function App() {
  // Culling state
  const [cullingEnabled, setCullingEnabled] = useState(false);
  const [cullingDistance, setCullingDistance] = useState(100);

  // Camera state
  const [cameraSettings, setCameraSettings] = useState({ following: true, userControlled: false });
  const [cameraControls, setCameraControls] = useState<CameraControls | null>(null);

  const {
    voxels,
    stats,
    isPaused,
    centerRequest,
    clearAllVoxels,
    togglePause,
    centerCamera
  } = useVoxelStream('ws://localhost:8080');

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
        cullingEnabled={cullingEnabled}
        cullingDistance={cullingDistance}
        onCameraSettingsChange={setCameraSettings}
        onCameraControlsReady={setCameraControls}
      />
      
      {/* UI Panels */}
      <StatusPanel
        stats={stats}
        isPaused={isPaused}
        onClear={clearAllVoxels}
        onPause={togglePause}
        onCenter={centerCamera}
        cullingEnabled={cullingEnabled}
        cullingDistance={cullingDistance}
        onCullingEnabledChange={setCullingEnabled}
        onCullingDistanceChange={setCullingDistance}
        cameraSettings={cameraSettings}
        cameraControls={cameraControls}
      />
      
      <ControlsPanel />
    </div>
  );
}

export default App;
