import { useState, useEffect, useCallback, useRef } from 'react';
import { perfTracker } from '../utils/performance-tracker';

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
  const voxelUpdateQueue = useRef<Map<string, VoxelData>>(new Map());
  
  const websocket = useRef<WebSocket | null>(null);
  const uniquePositions = useRef<Set<string>>(new Set());
  const recentVoxels = useRef<number[]>([]);
  const voxelCount = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const originOffset = useRef<{ x: number; y: number; z: number } | null>(null);

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

        const startTime = performance.now();
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'voxel') {
            // Only show certain voxel types
            if (!['WALKABLE', 'CURRENT_POSITION', 'CURRENT_TARGET'].includes(data.state)) {
              return;
            }

            // Set origin offset from the first voxel received
            if (originOffset.current === null) {
              originOffset.current = { x: data.x, y: data.y, z: data.z };
              console.log('Setting origin offset to:', originOffset.current);
            }

            // Apply offset so first voxel is at 0,0,0
            const voxelData: VoxelData = {
              x: data.x - originOffset.current.x,
              y: data.y - originOffset.current.y,
              z: data.z - originOffset.current.z,
              state: data.state
            };

            const key = `${voxelData.x},${voxelData.y},${voxelData.z}`;
            
            // Add to the update queue
            voxelUpdateQueue.current.set(key, voxelData);

          } else if (data.type === 'clear_target') {
            // Handle target clearing if needed
            console.log('TARGET_DEBUG: Clearing current target visualization');
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
        perfTracker.record('onmessage', performance.now() - startTime);
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

  // Initialize WebSocket connection and add test data
  useEffect(() => {
    connectWebSocket();

    // Add some test voxels if no WebSocket connection after 2 seconds
    const testDataTimeout = setTimeout(() => {
      if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) {
        console.log('Adding test voxel data since WebSocket is not connected');
        
        // Add test voxels to demonstrate the system
        const testVoxelData = [
          { x: 100, y: 50, z: 200, state: 'WALKABLE' },
          { x: 101, y: 50, z: 200, state: 'WALKABLE' },
          { x: 102, y: 50, z: 200, state: 'CURRENT_POSITION' },
          { x: 100, y: 51, z: 200, state: 'WALKABLE' },
          { x: 101, y: 51, z: 200, state: 'CURRENT_TARGET' },
          { x: 102, y: 51, z: 200, state: 'WALKABLE' },
        ];

        testVoxelData.forEach((data, index) => {
          setTimeout(() => {
            // Simulate WebSocket message processing
            if (!['WALKABLE', 'CURRENT_POSITION', 'CURRENT_TARGET'].includes(data.state)) {
              return;
            }

            // Set origin offset from the first voxel
            if (originOffset.current === null) {
              originOffset.current = { x: data.x, y: data.y, z: data.z };
              console.log('Setting origin offset to:', originOffset.current);
            }

            // Apply offset so first voxel is at 0,0,0
            const voxelData: VoxelData = {
              x: data.x - originOffset.current.x,
              y: data.y - originOffset.current.y,
              z: data.z - originOffset.current.z,
              state: data.state as VoxelState
            };

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

            console.log(`Test voxel ${voxelCount.current}: x=${voxelData.x}, y=${voxelData.y}, z=${voxelData.z}, state=${voxelData.state}`);
          }, index * 500); // Add each voxel with 500ms delay
        });
      }
    }, 2000);

    return () => {
      if (websocket.current) {
        websocket.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      clearTimeout(testDataTimeout);
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

  // Batch-process voxel updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (voxelUpdateQueue.current.size === 0) return;

      const updates = voxelUpdateQueue.current;
      voxelUpdateQueue.current = new Map();

      setVoxels(prev => {
        const newVoxels = new Map(prev);
        updates.forEach((value, key) => {
          newVoxels.set(key, value);
        });
        return newVoxels;
      });

      updates.forEach(voxelData => {
        const key = `${voxelData.x},${voxelData.y},${voxelData.z}`;
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
      });

    }, 100); // Process queue every 100ms

    return () => clearInterval(interval);
  }, []);

  const clearAllVoxels = useCallback(() => {
    setVoxels(new Map());
    uniquePositions.current.clear();
    recentVoxels.current = [];
    voxelCount.current = 0;
    originOffset.current = null; // Reset origin offset
    
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
