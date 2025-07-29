import React from 'react';
import Panel from '../Panel';
import StatItem from './StatItem';
import ColorLegend from './ColorLegend';
import ActionButtons from '../../ActionButtons';
import { CameraControls } from '../../VoxelCanvas';

interface StatusPanelProps {
  stats: {
    voxelCount: number;
    rate: number;
    uniqueCount: number;
    bounds: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
    connectionStatus: 'connected' | 'connecting' | 'disconnected';
  };
  onClear: () => void;
  onPause: () => void;
  onCenter: () => void;
  isPaused: boolean;
  cullingEnabled: boolean;
  cullingDistance: number;
  onCullingEnabledChange: (enabled: boolean) => void;
  onCullingDistanceChange: (distance: number) => void;
  cameraSettings: { following: boolean; userControlled: boolean };
  cameraControls: CameraControls | null;
}

const StatusPanel: React.FC<StatusPanelProps> = ({ 
  stats, 
  onClear, 
  onPause, 
  onCenter, 
  isPaused,
  cullingEnabled,
  cullingDistance,
  onCullingEnabledChange,
  onCullingDistanceChange,
  cameraSettings,
  cameraControls
}) => {
  const getConnectionStatusDisplay = () => {
    const statusStyle: React.CSSProperties = {
      display: 'inline-block',
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      marginRight: '5px'
    };

    let backgroundColor = '#ff4444'; // disconnected
    let statusText = 'Disconnected';

    if (stats.connectionStatus === 'connected') {
      backgroundColor = '#44ff44';
      statusText = 'Connected';
    } else if (stats.connectionStatus === 'connecting') {
      backgroundColor = '#ffaa44';
      statusText = 'Connecting...';
    }

    return (
      <>
        <span style={{ ...statusStyle, background: backgroundColor }} />
        <span>{statusText}</span>
      </>
    );
  };

  const getBoundsDisplay = () => {
    if (stats.voxelCount === 0) {
      return 'N/A';
    }
    
    const { min, max } = stats.bounds;
    if (min.x === Infinity || max.x === -Infinity) {
      return 'N/A';
    }

    return `X: ${min.x.toFixed(0)} to ${max.x.toFixed(0)}, ` +
           `Y: ${min.y.toFixed(0)} to ${max.y.toFixed(0)}, ` +
           `Z: ${min.z.toFixed(0)} to ${max.z.toFixed(0)}`;
  };

  const voxelCounterStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center',
    margin: '10px 0',
    color: '#00ffff'
  };

  const voxelSubtitleStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize: '12px',
    marginTop: '-5px'
  };

  const hrStyle: React.CSSProperties = {
    borderColor: '#444',
    margin: '10px 0'
  };

  const boundsStyle: React.CSSProperties = {
    fontSize: '10px'
  };

  return (
    <Panel 
      title="🔮 Voxel Stream Visualizer" 
      top="20px" 
      left="20px" 
      minWidth="250px"
      isMinimizable={true}
      defaultMinimized={true}
    >
      <StatItem 
        label="WebSocket" 
        value={getConnectionStatusDisplay()} 
      />
      
      <div style={voxelCounterStyle}>
        {stats.voxelCount.toLocaleString()}
      </div>
      <div style={voxelSubtitleStyle}>voxels received</div>
      
      <hr style={hrStyle} />
      
      <StatItem label="Rate" value={`${stats.rate} voxels/s`} />
      <StatItem label="Unique positions" value={stats.uniqueCount.toLocaleString()} />
      <StatItem 
        label="Bounds" 
        value={getBoundsDisplay()} 
        className="bounds-info"
      />
      
      <ActionButtons
        isPaused={isPaused}
        onClear={onClear}
        onPause={onPause}
        onCenter={onCenter}
      />
      
      <hr style={hrStyle} />
      
      {/* Culling Controls */}
      <div style={{ fontSize: '12px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🎯 Culling Controls:</div>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={cullingEnabled}
              onChange={(e) => onCullingEnabledChange(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Enable Distance Culling
          </label>
        </div>
        
        <div style={{ opacity: cullingEnabled ? 1 : 0.5 }}>
          <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>
            Distance: {cullingDistance}
          </div>
          <input
            type="range"
            min="10"
            max="500"
            step="10"
            value={cullingDistance}
            onChange={(e) => onCullingDistanceChange(parseInt(e.target.value))}
            disabled={!cullingEnabled}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: '10px', color: '#888', textAlign: 'center' }}>
            10 - 500 units
          </div>
        </div>
      </div>
      
      <hr style={hrStyle} />
      
      {/* Camera Controls */}
      <div style={{ fontSize: '12px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>📷 Camera Controls:</div>
        
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: cameraSettings.userControlled ? '#ffaa44' : '#44ff44' }}>
            Status: {cameraSettings.userControlled ? 'Manual Control' : 'Auto Following'}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => cameraControls?.setCameraFollowing(!cameraSettings.following)}
            disabled={!cameraControls}
            style={{
              fontSize: '10px',
              padding: '4px 8px',
              background: cameraSettings.following ? '#44ff44' : '#666',
              color: cameraSettings.following ? '#000' : '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: cameraControls ? 'pointer' : 'not-allowed'
            }}
          >
            {cameraSettings.following ? '✓ Following' : 'Enable Follow'}
          </button>
          
          <button
            onClick={() => cameraControls?.resetCameraToDefault()}
            disabled={!cameraControls}
            style={{
              fontSize: '10px',
              padding: '4px 8px',
              background: '#ff6644',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: cameraControls ? 'pointer' : 'not-allowed'
            }}
          >
            Reset to Default
          </button>
        </div>
        
        <div style={{ fontSize: '9px', color: '#888', marginTop: '5px' }}>
          Use mouse to manually control camera. Reset to restore following.
        </div>
      </div>
      
      <ColorLegend />
    </Panel>
  );
};

export default StatusPanel;
