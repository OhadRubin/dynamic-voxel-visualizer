import { useState, useEffect, useCallback, useRef } from 'react';

export type VoxelState = 'WALKABLE' | 'PASSABLE' | 'WALL' | 'UNKNOWN' | 'CURRENT_POSITION' | 'CURRENT_TARGET';

export interface VoxelData {
  x: number;
  y: number;
  z: number;
  state: VoxelState;
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
  const [voxels, setVoxels] = useState<Map<string, VoxelData>>(new Map());
  const [stats, setStats] = useState<Stats>({
    voxelCount: 0,
    rate: 0,
    uniqueCount: 0,
    bounds: {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity }
    },
    connectionStatus: 'disconnected'
  });
  const [isPaused, setIsPaused] = useState(false);
  const [centerRequest, setCenterRequest] = useState(0);
  
  const websocket = useRef<WebSocket | null>(null);
  const uniquePositions = useRef<Set<string>>(new Set());
  const recentVoxels = useRef<number[]>([]);
  const voxelCount = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const connectWebSocket = useCallback(() => {
    if (websocket.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStats(prev => ({ ...prev, connectionStatus: 'connecting' }));

    try {
      const ws = new WebSocket(websocketUrl);
      websocket.current = ws;

      ws.onopen = () => {
        console.log('Connected to voxel stream');
        setStats(prev => ({ ...prev, connectionStatus: 'connected' }));
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }
      };

      ws.onmessage = (event) => {
        if (isPaused) return;

        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'voxel') {
            const voxelData: VoxelData = {
              x: data.x,
              y: data.y,
              z: data.z,
              state: data.state
            };

            // Only show certain voxel types
            if (!['WALKABLE', 'CURRENT_POSITION', 'CURRENT_TARGET'].includes(voxelData.state)) {
              return;
            }

            const key = `${voxelData.x},${voxelData.y},${voxelData.z}`;

            setVoxels(prev => {
              const newVoxels = new Map(prev);
              newVoxels.set(key, voxelData);
              return newVoxels;
            });

            uniquePositions.current.add(key);
            voxelCount.current++;

            // Update bounds
            setStats(prev => ({
              ...prev,
              voxelCount: voxelCount.current,
              uniqueCount: uniquePositions.current.size,
              bounds: {
                min: {
                  x: Math.min(prev.bounds.min.x, voxelData.x),
                  y: Math.min(prev.bounds.min.y, voxelData.y),
                  z: Math.min(prev.bounds.min.z, voxelData.z)
                },
                max: {
                  x: Math.max(prev.bounds.max.x, voxelData.x),
                  y: Math.max(prev.bounds.max.y, voxelData.y),
                  z: Math.max(prev.bounds.max.z, voxelData.z)
                }
              }
            }));

            // Track for rate calculation
            const now = Date.now();
            recentVoxels.current.push(now);
            const fiveSecondsAgo = now - 5000;
            recentVoxels.current = recentVoxels.current.filter(time => time > fiveSecondsAgo);

            // Debug logging
            if (voxelCount.current < 10 || voxelCount.current % 1000 === 0) {
              console.log(`Voxel ${voxelCount.current}: x=${voxelData.x}, y=${voxelData.y}, z=${voxelData.z}, state=${voxelData.state}`);
            }
          } else if (data.type === 'clear_target') {
            // Handle target clearing if needed
            console.log('TARGET_DEBUG: Clearing current target visualization');
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from voxel stream');
        setStats(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        
        // Auto-reconnect after 2 seconds
        reconnectTimeout.current = setTimeout(() => {
          connectWebSocket();
        }, 2000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStats(prev => ({ ...prev, connectionStatus: 'disconnected' }));
      };

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      reconnectTimeout.current = setTimeout(() => {
        connectWebSocket();
      }, 2000);
    }
  }, [websocketUrl, isPaused]);

  // Initialize WebSocket connection
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (websocket.current) {
        websocket.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connectWebSocket]);

  // Update rate calculation
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const oneSecondAgo = now - 1000;
      const voxelsInLastSecond = recentVoxels.current.filter(time => time > oneSecondAgo).length;
      
      setStats(prev => ({
        ...prev,
        rate: voxelsInLastSecond
      }));
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const clearAllVoxels = useCallback(() => {
    setVoxels(new Map());
    uniquePositions.current.clear();
    recentVoxels.current = [];
    voxelCount.current = 0;
    
    setStats(prev => ({
      ...prev,
      voxelCount: 0,
      uniqueCount: 0,
      bounds: {
        min: { x: Infinity, y: Infinity, z: Infinity },
        max: { x: -Infinity, y: -Infinity, z: -Infinity }
      }
    }));
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  const centerCamera = useCallback(() => {
    setCenterRequest(prev => prev + 1);
  }, []);

  return {
    voxels,
    stats,
    isPaused,
    centerRequest,
    clearAllVoxels,
    togglePause,
    centerCamera
  };
};
