import React, { useRef, useEffect } from 'react';
import { ThreeManager } from './three-manager';
import { VoxelData } from '../../hooks/useVoxelStream';
import * as THREE from 'three';

interface VoxelCanvasProps {
  voxels: Map<string, VoxelData>;
  centerRequest: number;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

const VoxelCanvas: React.FC<VoxelCanvasProps> = ({ 
  voxels, 
  centerRequest, 
  bounds
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeManagerRef = useRef<ThreeManager | null>(null);

  useEffect(() => {
    // Initialize Three.js scene, camera, renderer, and controls
    if (canvasRef.current && !threeManagerRef.current) {
      threeManagerRef.current = new ThreeManager(canvasRef.current);
    }
    
    return () => {
      // Cleanup Three.js objects
      if (threeManagerRef.current) {
        threeManagerRef.current.dispose();
        threeManagerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Update Three.js scene when voxels change
    if (threeManagerRef.current) {
      threeManagerRef.current.updateVoxels(voxels);
    }
  }, [voxels]);

  useEffect(() => {
    // Center camera when centerRequest changes
    if (threeManagerRef.current && centerRequest > 0) {
      threeManagerRef.current.centerCamera(bounds);
    }
  }, [centerRequest, bounds]);

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
