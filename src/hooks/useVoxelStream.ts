import { useState, useEffect, useCallback } from 'react';

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
