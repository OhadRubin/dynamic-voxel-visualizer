#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// File structure based on spec.md
const fileStructure = {
  'src/components/VoxelCanvas/index.tsx': `import React, { useRef, useEffect } from 'react';

interface VoxelCanvasProps {
  voxels: any[];
  centerRequest: number;
  onVoxelDoubleClick: (voxel: any) => void;
}

const VoxelCanvas: React.FC<VoxelCanvasProps> = ({ 
  voxels, 
  centerRequest, 
  onVoxelDoubleClick 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Initialize Three.js scene, camera, renderer, and controls
    // TODO: Implement Three.js initialization
    
    return () => {
      // Cleanup Three.js objects
      // TODO: Implement cleanup
    };
  }, []);

  useEffect(() => {
    // Update Three.js scene when voxels change
    // TODO: Implement voxel rendering logic
  }, [voxels]);

  useEffect(() => {
    // Center camera when centerRequest changes
    // TODO: Implement camera centering
  }, [centerRequest]);

  return <canvas ref={canvasRef} />;
};

export default VoxelCanvas;
`,

  'src/components/VoxelCanvas/three-manager.ts': `// Optional helper class to encapsulate Three.js logic
export class ThreeManager {
  private scene: any;
  private camera: any;
  private renderer: any;
  private controls: any;

  constructor(canvas: HTMLCanvasElement) {
    // TODO: Initialize Three.js objects
  }

  public updateVoxels(voxels: any[]): void {
    // TODO: Update voxel meshes in the scene
  }

  public centerCamera(): void {
    // TODO: Center the camera on the voxel data
  }

  public dispose(): void {
    // TODO: Clean up Three.js objects
  }
}
`,

  'src/components/UI/Panel.tsx': `import React, { useState } from 'react';

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
`,

  'src/components/UI/StatusPanel/index.tsx': `import React from 'react';
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
      <StatItem label="Rate" value={\`\${stats.rate} voxels/s\`} />
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
`,

  'src/components/UI/StatusPanel/StatItem.tsx': `import React from 'react';

interface StatItemProps {
  label: string;
  value: string | number;
}

const StatItem: React.FC<StatItemProps> = ({ label, value }) => {
  return (
    <div>
      <strong>{label}:</strong> {value}
    </div>
  );
};

export default StatItem;
`,

  'src/components/UI/StatusPanel/ColorLegend.tsx': `import React from 'react';

const voxelTypes = [
  { name: 'Type 1', color: '#ff0000' },
  { name: 'Type 2', color: '#00ff00' },
  { name: 'Type 3', color: '#0000ff' },
  // TODO: Add more voxel types as needed
];

const ColorLegend: React.FC = () => {
  return (
    <div>
      <h4>Voxel Types</h4>
      {voxelTypes.map((type, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
          <div 
            style={{ 
              width: '16px', 
              height: '16px', 
              backgroundColor: type.color,
              marginRight: '8px'
            }}
          />
          <span>{type.name}</span>
        </div>
      ))}
    </div>
  );
};

export default ColorLegend;
`,

  'src/components/UI/ControlsPanel/index.tsx': `import React from 'react';
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
`,

  'src/components/ActionButtons/index.tsx': `import React from 'react';

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
`,

  'src/hooks/useVoxelStream.ts': `import { useState, useEffect, useCallback } from 'react';

interface VoxelData {
  // TODO: Define voxel data structure
  id: string;
  x: number;
  y: number;
  z: number;
  type: string;
  color: string;
}

interface Stats {
  voxelCount: number;
  rate: number;
  uniqueCount: number;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
}

export const useVoxelStream = (websocketUrl: string) => {
  const [voxels, setVoxels] = useState<VoxelData[]>([]);
  const [stats, setStats] = useState<Stats>({
    voxelCount: 0,
    rate: 0,
    uniqueCount: 0,
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 }
    },
    connectionStatus: 'disconnected'
  });
  const [isPaused, setIsPaused] = useState(false);
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection
    const ws = new WebSocket(websocketUrl);
    
    ws.onopen = () => {
      setStats(prev => ({ ...prev, connectionStatus: 'connected' }));
    };
    
    ws.onmessage = (event) => {
      if (!isPaused) {
        // TODO: Parse incoming WebSocket messages and update voxels
        // const data = JSON.parse(event.data);
        // Process and add new voxels
      }
    };
    
    ws.onclose = () => {
      setStats(prev => ({ ...prev, connectionStatus: 'disconnected' }));
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStats(prev => ({ ...prev, connectionStatus: 'disconnected' }));
    };
    
    setWebsocket(ws);
    
    return () => {
      ws.close();
    };
  }, [websocketUrl, isPaused]);

  const clearAllVoxels = useCallback(() => {
    setVoxels([]);
    setStats(prev => ({
      ...prev,
      voxelCount: 0,
      uniqueCount: 0,
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 }
      }
    }));
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  return {
    voxels,
    stats,
    isPaused,
    clearAllVoxels,
    togglePause
  };
};
`
};

// Function to create directories recursively
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Function to create files
function createFiles() {
  console.log('Creating missing files based on spec.md...\n');

  Object.entries(fileStructure).forEach(([filePath, content]) => {
    const fullPath = path.join(__dirname, filePath);
    
    if (fs.existsSync(fullPath)) {
      console.log(`⚠️  File already exists: ${filePath}`);
      return;
    }

    ensureDirectoryExists(fullPath);
    fs.writeFileSync(fullPath, content);
    console.log(`✅ Created: ${filePath}`);
  });

  console.log('\n🎉 All missing files have been created!');
  console.log('\nNext steps:');
  console.log('1. Install Three.js: npm install three @types/three');
  console.log('2. Update src/App.tsx to use the new components');
  console.log('3. Implement the actual Three.js logic in VoxelCanvas');
  console.log('4. Configure your WebSocket URL in the useVoxelStream hook');
}

// Run the script
if (require.main === module) {
  createFiles();
}

module.exports = { createFiles };