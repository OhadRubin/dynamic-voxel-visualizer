import React, { useRef, useEffect } from 'react';
import { ThreeManager } from './three-manager';
import { VoxelData } from '../../hooks/useVoxelStream';
import * as THREE from 'three';
import { perfTracker } from '../../utils/performance-tracker';

interface CameraControls {
  setCameraFollowing: (enabled: boolean) => void;
  resetCameraToDefault: () => void;
}

interface VoxelCanvasProps {
  voxels: Map<string, VoxelData>;
  centerRequest: number;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  cullingEnabled?: boolean;
  cullingDistance?: number;
  onCameraSettingsChange?: (settings: { following: boolean; userControlled: boolean }) => void;
  onCameraControlsReady?: (controls: CameraControls) => void;
}

const VoxelCanvas: React.FC<VoxelCanvasProps> = ({ 
  voxels, 
  centerRequest, 
  bounds,
  cullingEnabled = false,
  cullingDistance = 100,
  onCameraSettingsChange,
  onCameraControlsReady
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeManagerRef = useRef<ThreeManager | null>(null);

  useEffect(() => {
    // Initialize Three.js scene, camera, renderer, and controls
    if (canvasRef.current && !threeManagerRef.current) {
      console.log('VoxelCanvas: Initializing ThreeManager');
      threeManagerRef.current = new ThreeManager(canvasRef.current);
    }
    
    return () => {
      // Cleanup Three.js objects
      if (threeManagerRef.current) {
        console.log('VoxelCanvas: Disposing ThreeManager');
        threeManagerRef.current.dispose();
        threeManagerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Update Three.js scene when voxels change
    if (threeManagerRef.current) {
      const startTime = performance.now();
      threeManagerRef.current.updateVoxels(voxels);
      perfTracker.record('VoxelCanvas.updateVoxels', performance.now() - startTime);
    }
  }, [voxels]);

  useEffect(() => {
    // Center camera when centerRequest changes
    if (threeManagerRef.current && centerRequest > 0) {
      threeManagerRef.current.centerCamera(bounds);
    }
  }, [centerRequest, bounds]);

  useEffect(() => {
    // Update culling enabled state
    if (threeManagerRef.current) {
      threeManagerRef.current.setCullingEnabled(cullingEnabled);
    }
  }, [cullingEnabled]);

  useEffect(() => {
    // Update culling distance
    if (threeManagerRef.current) {
      threeManagerRef.current.setCullingDistance(cullingDistance);
    }
  }, [cullingDistance]);

  useEffect(() => {
    // Monitor camera settings and notify parent
    const checkCameraSettings = () => {
      if (threeManagerRef.current && onCameraSettingsChange) {
        const settings = threeManagerRef.current.getCameraSettings();
        onCameraSettingsChange(settings);
      }
    };

    const interval = setInterval(checkCameraSettings, 100); // Check every 100ms
    return () => clearInterval(interval);
  }, [onCameraSettingsChange]);

  // Create camera control methods
  const cameraControls: CameraControls = {
    setCameraFollowing: (enabled: boolean) => {
      if (threeManagerRef.current) {
        threeManagerRef.current.setCameraFollowing(enabled);
      }
    },
    resetCameraToDefault: () => {
      if (threeManagerRef.current) {
        threeManagerRef.current.resetCameraToDefault();
      }
    }
  };

  // Notify parent when camera controls are ready
  useEffect(() => {
    if (onCameraControlsReady && threeManagerRef.current) {
      onCameraControlsReady(cameraControls);
    }
  }, [onCameraControlsReady]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        display: 'block',
        width: '100vw',
        height: '100vh'
      }} 
    />
  );
};

export default VoxelCanvas;
export type { CameraControls };
