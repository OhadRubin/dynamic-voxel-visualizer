import React from 'react';
import Panel from '../Panel';
import StatItem from './StatItem';
import ColorLegend from './ColorLegend';
import ActionButtons from '../../ActionButtons';

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
}

const StatusPanel: React.FC<StatusPanelProps> = ({ 
  stats, 
  onClear, 
  onPause, 
  onCenter, 
  isPaused 
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
      
      <ColorLegend />
    </Panel>
  );
};

export default StatusPanel;
