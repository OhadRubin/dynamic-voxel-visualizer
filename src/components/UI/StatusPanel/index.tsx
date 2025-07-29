import React from 'react';
import Panel from '../Panel';
import StatItem from './StatItem';
import ColorLegend from './ColorLegend';

interface StatusPanelProps {
  stats: {
    voxelCount: number;
    rate: number;
    uniqueCount: number;
    bounds: any;
    connectionStatus: string;
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
  return (
    <Panel title="Status" top="10px" left="10px">
      <StatItem label="Connection" value={stats.connectionStatus} />
      <StatItem label="Voxel Count" value={stats.voxelCount.toLocaleString()} />
      <StatItem label="Rate" value={`${stats.rate} voxels/s`} />
      <StatItem label="Unique Count" value={stats.uniqueCount.toLocaleString()} />
      
      <ColorLegend />
      
      <div>
        <button onClick={onClear}>Clear</button>
        <button onClick={onPause}>{isPaused ? 'Resume' : 'Pause'}</button>
        <button onClick={onCenter}>Center</button>
      </div>
    </Panel>
  );
};

export default StatusPanel;
