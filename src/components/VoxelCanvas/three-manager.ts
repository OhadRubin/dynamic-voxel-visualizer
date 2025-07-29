import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VoxelData, VoxelState } from '../../hooks/useVoxelStream';

const CHUNK_SIZE = 16;
const MAX_INSTANCES_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE; // 4096

// LOD (Level of Detail) system
enum LODLevel {
  HIGH = 0,    // 0-225 units: Full detail voxels
  MEDIUM = 1,  // 225-600 units: Simplified voxels (0.7x scale)
  LOW = 2,     // 600-1200 units: Point sprites
  CULLED = 3   // 1200+ units: Not rendered
}

const LOD_DISTANCES = [225, 600, 1200];

interface VoxelChunk {
  instancedMeshes: Record<VoxelState, Record<LODLevel, THREE.InstancedMesh>>;
  voxelInstances: Map<string, { state: VoxelState; instanceIndex: number; lodLevel: LODLevel }>;
  availableIndices: Record<VoxelState, Record<LODLevel, number[]>>;
  nextInstanceIndex: Record<VoxelState, Record<LODLevel, number>>;
}

export class ThreeManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private voxelGroup: THREE.Group;
  private voxelGeometries: Record<LODLevel, THREE.BufferGeometry>;
  private materials: Record<VoxelState, THREE.MeshLambertMaterial>;
  private pointMaterials: Record<VoxelState, THREE.PointsMaterial>;
  private chunks: Map<string, VoxelChunk>;
  private currentPositionKey: string | null = null;
  private currentTargetKey: string | null = null;
  private animationId: number | null = null;
  
  // Camera following variables
  private cameraFollowTarget: THREE.Vector3 = new THREE.Vector3();
  private isFollowingEnabled: boolean = true;
  private followLerpFactor: number = 0.05;
  private cameraOffset: THREE.Vector3 = new THREE.Vector3(30, 30, 30);
  private defaultCameraOffset: THREE.Vector3 = new THREE.Vector3(30, 30, 30);
  private userControlledCamera: boolean = false;
  private lastCameraPosition: THREE.Vector3 = new THREE.Vector3();
  private lastControlsTarget: THREE.Vector3 = new THREE.Vector3();
  
  // Culling variables
  private cullingEnabled: boolean = false; // Disabled by default
  private cullingDistance: number = 100; // Maximum render distance
  private frustum: THREE.Frustum = new THREE.Frustum();
  private cameraMatrix: THREE.Matrix4 = new THREE.Matrix4();

  constructor(canvas: HTMLCanvasElement) {
    // Initialize Three.js objects
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.voxelGroup = new THREE.Group();
    
    // Create geometries for different LOD levels
    this.voxelGeometries = {
      [LODLevel.HIGH]: new THREE.BoxGeometry(1, 1, 1),      // Full detail
      [LODLevel.MEDIUM]: new THREE.BoxGeometry(0.7, 0.7, 0.7), // Simplified
      [LODLevel.LOW]: this.createPointGeometry(),            // Point sprites
      [LODLevel.CULLED]: new THREE.BoxGeometry(1, 1, 1)     // Dummy (not used)
    };
    
    // Create materials for different voxel states - using MeshLambertMaterial for mesh LODs
    this.materials = {
      WALKABLE: new THREE.MeshLambertMaterial({ color: 0x00ff00 }),
      PASSABLE: new THREE.MeshLambertMaterial({ color: 0xffff00 }),
      WALL: new THREE.MeshLambertMaterial({ color: 0xff0000 }),
      UNKNOWN: new THREE.MeshLambertMaterial({ color: 0x00ffff }),
      CURRENT_POSITION: new THREE.MeshLambertMaterial({ color: 0x0000ff }),
      CURRENT_TARGET: new THREE.MeshLambertMaterial({ color: 0xff00ff }),
    };

    // Create point materials for LOD level 2 (point sprites)
    this.pointMaterials = {
      WALKABLE: new THREE.PointsMaterial({ color: 0x00ff00, size: 3 }),
      PASSABLE: new THREE.PointsMaterial({ color: 0xffff00, size: 3 }),
      WALL: new THREE.PointsMaterial({ color: 0xff0000, size: 3 }),
      UNKNOWN: new THREE.PointsMaterial({ color: 0x00ffff, size: 3 }),
      CURRENT_POSITION: new THREE.PointsMaterial({ color: 0x0000ff, size: 5 }),
      CURRENT_TARGET: new THREE.PointsMaterial({ color: 0xff00ff, size: 5 }),
    };

    // Initialize chunk management
    this.chunks = new Map();

    this.initializeScene();
    this.setupControls();
    
    // Initialize camera tracking positions
    this.lastCameraPosition.copy(this.camera.position);
    this.lastControlsTarget.copy(this.controls.target);
    
    this.startRenderLoop();
  }

  private createPointGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    // Create buffer for MAX_INSTANCES_PER_CHUNK points
    const positions = new Float32Array(MAX_INSTANCES_PER_CHUNK * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0); // Initially draw 0 points
    return geometry;
  }

  private getChunkCoords(x: number, y: number, z: number): [number, number, number] {
    return [
      Math.floor(x / CHUNK_SIZE),
      Math.floor(y / CHUNK_SIZE),
      Math.floor(z / CHUNK_SIZE)
    ];
  }

  private getChunkKey(chunkX: number, chunkY: number, chunkZ: number): string {
    return `${chunkX},${chunkY},${chunkZ}`;
  }

  private getLocalCoords(x: number, y: number, z: number): [number, number, number] {
    return [
      ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    ];
  }

  private getOrCreateChunk([chunkX, chunkY, chunkZ]: [number, number, number]): VoxelChunk {
    const chunkKey = this.getChunkKey(chunkX, chunkY, chunkZ);
    
    if (!this.chunks.has(chunkKey)) {
      // Create new chunk
      const chunk: VoxelChunk = {
        instancedMeshes: {} as Record<VoxelState, Record<LODLevel, THREE.InstancedMesh>>,
        voxelInstances: new Map(),
        availableIndices: {} as Record<VoxelState, Record<LODLevel, number[]>>,
        nextInstanceIndex: {} as Record<VoxelState, Record<LODLevel, number>>
      };

      // Initialize arrays for each voxel state and LOD level
      Object.keys(this.materials).forEach((state) => {
        const voxelState = state as VoxelState;
        chunk.instancedMeshes[voxelState] = {} as Record<LODLevel, THREE.InstancedMesh>;
        chunk.availableIndices[voxelState] = {} as Record<LODLevel, number[]>;
        chunk.nextInstanceIndex[voxelState] = {} as Record<LODLevel, number>;

        // Create InstancedMesh for each LOD level
        [LODLevel.HIGH, LODLevel.MEDIUM, LODLevel.LOW].forEach((lodLevel) => {
          let instancedMesh: THREE.InstancedMesh | THREE.Points;
          
          if (lodLevel === LODLevel.LOW) {
            // Use Points for low LOD - create unique geometry per chunk
            const pointGeometry = this.createPointGeometry();
            instancedMesh = new THREE.Points(
              pointGeometry,
              this.pointMaterials[voxelState]
            ) as any; // Type assertion for compatibility
          } else {
            // Use InstancedMesh for high and medium LOD
            instancedMesh = new THREE.InstancedMesh(
              this.voxelGeometries[lodLevel],
              this.materials[voxelState],
              MAX_INSTANCES_PER_CHUNK
            );
            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          }
          
          (instancedMesh as any).count = 0;
          chunk.instancedMeshes[voxelState][lodLevel] = instancedMesh as THREE.InstancedMesh;
          chunk.availableIndices[voxelState][lodLevel] = [];
          chunk.nextInstanceIndex[voxelState][lodLevel] = 0;
          this.voxelGroup.add(instancedMesh);
        });
      });

      this.chunks.set(chunkKey, chunk);
    }

    return this.chunks.get(chunkKey)!;
  }

  private getAvailableInstanceIndex(chunk: VoxelChunk, state: VoxelState, lodLevel: LODLevel): number {
    // Check if there's a recycled index available
    if (chunk.availableIndices[state][lodLevel].length > 0) {
      return chunk.availableIndices[state][lodLevel].pop()!;
    }
    
    // Check if we need to expand the InstancedMesh capacity
    const instancedMesh = chunk.instancedMeshes[state][lodLevel];
    if (chunk.nextInstanceIndex[state][lodLevel] >= instancedMesh.count) {
      instancedMesh.count = chunk.nextInstanceIndex[state][lodLevel] + 1;
    }
    
    return chunk.nextInstanceIndex[state][lodLevel]++;
  }

  private releaseInstanceIndex(chunk: VoxelChunk, state: VoxelState, lodLevel: LODLevel, index: number): void {
    if (lodLevel === LODLevel.LOW) {
      // For points, mark position as invalid and add to available indices
      const pointsMesh = chunk.instancedMeshes[state][lodLevel] as any as THREE.Points;
      const geometry = pointsMesh.geometry as THREE.BufferGeometry;
      const positions = geometry.attributes.position.array as Float32Array;
      
      if (index * 3 + 2 < positions.length) {
        // Move point far away to hide it
        positions[index * 3] = 100000;
        positions[index * 3 + 1] = 100000;
        positions[index * 3 + 2] = 100000;
        geometry.attributes.position.needsUpdate = true;
      }
      
      chunk.availableIndices[state][lodLevel].push(index);
      return;
    }

    // Hide the instance by moving it far away
    const matrix = new THREE.Matrix4();
    matrix.setPosition(10000, 10000, 10000);
    chunk.instancedMeshes[state][lodLevel].setMatrixAt(index, matrix);
    chunk.instancedMeshes[state][lodLevel].instanceMatrix.needsUpdate = true;
    
    // Add to available indices for reuse
    chunk.availableIndices[state][lodLevel].push(index);
  }

  private setInstanceTransform(chunk: VoxelChunk, state: VoxelState, lodLevel: LODLevel, index: number, x: number, y: number, z: number): void {
    if (lodLevel === LODLevel.LOW) {
      // For points, update the geometry directly
      const pointsMesh = chunk.instancedMeshes[state][lodLevel] as any as THREE.Points;
      const geometry = pointsMesh.geometry as THREE.BufferGeometry;
      const positions = geometry.attributes.position.array as Float32Array;
      
      if (index * 3 + 2 < positions.length) {
        positions[index * 3] = x;
        positions[index * 3 + 1] = y;
        positions[index * 3 + 2] = z;
        geometry.attributes.position.needsUpdate = true;
        
        // Update draw range to include this point
        const currentCount = (pointsMesh as any).count || 0;
        if (index >= currentCount) {
          geometry.setDrawRange(0, index + 1);
          (pointsMesh as any).count = index + 1;
        }
      }
      return;
    }

    const matrix = new THREE.Matrix4();
    matrix.setPosition(x, y, z);
    chunk.instancedMeshes[state][lodLevel].setMatrixAt(index, matrix);
    chunk.instancedMeshes[state][lodLevel].instanceMatrix.needsUpdate = true;
  }

  public setCullingEnabled(enabled: boolean): void {
    this.cullingEnabled = enabled;
  }

  public setCullingDistance(distance: number): void {
    this.cullingDistance = Math.max(10, distance); // Minimum distance of 10
  }

  public getCullingSettings(): { enabled: boolean; distance: number } {
    return {
      enabled: this.cullingEnabled,
      distance: this.cullingDistance
    };
  }

  public getCameraSettings(): { following: boolean; userControlled: boolean } {
    return {
      following: this.isFollowingEnabled,
      userControlled: this.userControlledCamera
    };
  }

  public setCameraFollowing(enabled: boolean): void {
    this.isFollowingEnabled = enabled;
    if (enabled) {
      this.userControlledCamera = false;
    }
  }

  public resetCameraToDefault(): void {
    this.isFollowingEnabled = true;
    this.userControlledCamera = false;
    this.cameraOffset.copy(this.defaultCameraOffset);
    
    // If we have a current position, immediately move camera to default offset
    if (this.currentPositionKey) {
      const targetPosition = new THREE.Vector3().copy(this.cameraFollowTarget);
      const desiredPosition = targetPosition.clone().add(this.cameraOffset);
      
      this.camera.position.copy(desiredPosition);
      this.controls.target.copy(targetPosition);
      this.controls.update();
      this.requestRender();
    }
  }

  private detectUserCameraControl(): void {
    // Check if camera position or controls target changed from user interaction
    const cameraPositionChanged = !this.camera.position.equals(this.lastCameraPosition);
    const controlsTargetChanged = !this.controls.target.equals(this.lastControlsTarget);
    
    // If position changed and we're not currently doing automatic following, user is controlling
    if ((cameraPositionChanged || controlsTargetChanged) && !this.isAutomaticallyMovingCamera) {
      this.userControlledCamera = true;
    }
    
    // Update last known positions
    this.lastCameraPosition.copy(this.camera.position);
    this.lastControlsTarget.copy(this.controls.target);
  }

  private isAutomaticallyMovingCamera: boolean = false;
  
  // Render-on-demand variables
  private needsRender: boolean = true;
  private isUserInteracting: boolean = false;

  // Batch processing variables
  private voxelUpdateQueue: Array<{key: string, voxelData: VoxelData | null}> = [];
  private queuedKeys = new Set<string>(); // Track queued keys for deduplication
  private isProcessingBatch: boolean = false;
  private readonly BATCH_SIZE = 300; // Process up to 300 voxels per frame
  private readonly FRAME_BUDGET_MS = 14; // Max 14ms per frame for voxel processing
  private readonly MAX_QUEUE_SIZE = 1000; // Drop old voxels if queue exceeds this (reduced)
  private readonly SPATIAL_CULL_DISTANCE = 1200; // Only process voxels within this distance (matches LOD_DISTANCES[2])
  private readonly MAX_TOTAL_VOXELS = 8000; // Maximum total voxels to prevent memory bloat
  private readonly CLEANUP_DISTANCE = 2000; // Remove voxels beyond this distance periodically
  private lastCleanupTime = 0;
  private readonly CLEANUP_INTERVAL_MS = 5000; // Clean up every 5 seconds
  
  // Performance monitoring
  private frameCount = 0;
  private lastPerformanceLog = 0;

  private requestRender(): void {
    this.needsRender = true;
  }

  private calculateLODLevel(voxelData: VoxelData): LODLevel {
    // Always use high LOD for critical voxels
    if (voxelData.state === 'CURRENT_POSITION' || voxelData.state === 'CURRENT_TARGET') {
      return LODLevel.HIGH;
    }

    // Calculate distance from camera
    const distance = this.camera.position.distanceTo(
      new THREE.Vector3(voxelData.x, voxelData.y, voxelData.z)
    );
    
    // Determine LOD level based on distance
    if (distance < LOD_DISTANCES[0]) return LODLevel.HIGH;
    if (distance < LOD_DISTANCES[1]) return LODLevel.MEDIUM;
    if (distance < LOD_DISTANCES[2]) return LODLevel.LOW;
    return LODLevel.CULLED;
  }

  private shouldCullVoxel(voxelData: VoxelData): boolean {
    return this.calculateLODLevel(voxelData) === LODLevel.CULLED;
  }

  private getTotalVoxelCount(): number {
    let total = 0;
    this.chunks.forEach(chunk => {
      total += chunk.voxelInstances.size;
    });
    return total;
  }

  private performPeriodicCleanup(): void {
    const now = performance.now();
    if (now - this.lastCleanupTime < this.CLEANUP_INTERVAL_MS) {
      return;
    }
    this.lastCleanupTime = now;

    const cameraPos = this.camera.position;
    const voxelsToRemove: Array<{chunk: VoxelChunk, key: string}> = [];

    // Find voxels beyond cleanup distance
    this.chunks.forEach((chunk) => {
      chunk.voxelInstances.forEach((instance, key) => {
        // Parse coordinates from key
        const [x, y, z] = key.split(',').map(Number);
        const distance = cameraPos.distanceTo(new THREE.Vector3(x, y, z));
        
        // Don't remove critical voxels
        if (instance.state === 'CURRENT_POSITION' || instance.state === 'CURRENT_TARGET') {
          return;
        }

        if (distance > this.CLEANUP_DISTANCE) {
          voxelsToRemove.push({ chunk, key });
        }
      });
    });

    // Remove distant voxels
    voxelsToRemove.forEach(({ chunk, key }) => {
      const instance = chunk.voxelInstances.get(key);
      if (instance) {
        this.releaseInstanceIndex(chunk, instance.state, instance.lodLevel, instance.instanceIndex);
        chunk.voxelInstances.delete(key);
      }
    });

    if (voxelsToRemove.length > 0) {
      console.log(`Cleaned up ${voxelsToRemove.length} distant voxels`);
      this.cleanupEmptyChunks();
    }
  }

  private enforceVoxelLimit(): void {
    const totalVoxels = this.getTotalVoxelCount();
    
    if (totalVoxels <= this.MAX_TOTAL_VOXELS) {
      return;
    }

    const excessVoxels = totalVoxels - this.MAX_TOTAL_VOXELS;
    const cameraPos = this.camera.position;
    
    // Collect all voxels with their distances
    const voxelsByDistance: Array<{
      chunk: VoxelChunk,
      key: string,
      distance: number,
      instance: { state: VoxelState; instanceIndex: number; lodLevel: LODLevel }
    }> = [];

    this.chunks.forEach((chunk) => {
      chunk.voxelInstances.forEach((instance, key) => {
        // Don't remove critical voxels
        if (instance.state === 'CURRENT_POSITION' || instance.state === 'CURRENT_TARGET') {
          return;
        }

        const [x, y, z] = key.split(',').map(Number);
        const distance = cameraPos.distanceTo(new THREE.Vector3(x, y, z));
        
        voxelsByDistance.push({ chunk, key, distance, instance });
      });
    });

    // Sort by distance (farthest first) and remove excess
    voxelsByDistance.sort((a, b) => b.distance - a.distance);
    const toRemove = voxelsByDistance.slice(0, Math.min(excessVoxels, voxelsByDistance.length));

    toRemove.forEach(({ chunk, key, instance }) => {
      this.releaseInstanceIndex(chunk, instance.state, instance.lodLevel, instance.instanceIndex);
      chunk.voxelInstances.delete(key);
    });

    if (toRemove.length > 0) {
      console.log(`Removed ${toRemove.length} excess voxels (limit: ${this.MAX_TOTAL_VOXELS})`);
      this.cleanupEmptyChunks();
    }
  }

  private logPerformance(): void {
    this.frameCount++;
    const now = performance.now();
    
    if (now - this.lastPerformanceLog > 10000) { // Every 10 seconds
      const totalVoxels = this.getTotalVoxelCount();
      const queueSize = this.voxelUpdateQueue.length;
      const chunkCount = this.chunks.size;
      
      console.log(`Performance: ${totalVoxels} voxels, ${chunkCount} chunks, ${queueSize} queued, ~${(this.frameCount / 10).toFixed(1)} fps`);
      
      this.frameCount = 0;
      this.lastPerformanceLog = now;
    }
  }

  private addToQueue(key: string, voxelData: VoxelData | null): void {
    // Skip if already queued (deduplication)
    if (this.queuedKeys.has(key)) {
      // Update existing entry by finding and replacing it
      const existingIndex = this.voxelUpdateQueue.findIndex(item => item.key === key);
      if (existingIndex !== -1) {
        this.voxelUpdateQueue[existingIndex] = { key, voxelData };
      }
      return;
    }

    // Check queue size limit (more aggressive)
    if (this.voxelUpdateQueue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest items to make space
      const toRemove = this.voxelUpdateQueue.splice(0, 200); // Remove 200 oldest (increased)
      toRemove.forEach(item => this.queuedKeys.delete(item.key));
    }

    this.voxelUpdateQueue.push({ key, voxelData });
    this.queuedKeys.add(key);
  }

  private processBatchedVoxelUpdates(): void {
    if (this.voxelUpdateQueue.length === 0 || this.isProcessingBatch) {
      return;
    }

    // If queue is getting too large, be more aggressive
    const isQueueOverloaded = this.voxelUpdateQueue.length > this.MAX_QUEUE_SIZE * 0.8;
    const currentBatchSize = isQueueOverloaded ? this.BATCH_SIZE * 2 : this.BATCH_SIZE;
    const currentFrameBudget = isQueueOverloaded ? this.FRAME_BUDGET_MS * 1.5 : this.FRAME_BUDGET_MS;

    this.isProcessingBatch = true;
    const startTime = performance.now();
    let processedCount = 0;
    let totalProcessed = 0;

    // Process multiple batches if time allows
    while ((performance.now() - startTime) < currentFrameBudget) {
      processedCount = 0;
      
      // Process regular queue
      while (
        this.voxelUpdateQueue.length > 0 &&
        processedCount < currentBatchSize &&
        (performance.now() - startTime) < currentFrameBudget
      ) {
        const update = this.voxelUpdateQueue.shift()!;
        this.queuedKeys.delete(update.key); // Remove from deduplication set
        this.processVoxelUpdate(update.key, update.voxelData);
        processedCount++;
        totalProcessed++;
      }

      // If we didn't process anything this iteration, break
      if (processedCount === 0) {
        break;
      }
    }

    // If we processed any voxels, request a render and cleanup empty chunks
    if (totalProcessed > 0) {
      this.cleanupEmptyChunks();
      this.requestRender();
    }

    // If there are still items in queue, continue processing next frame
    if (this.voxelUpdateQueue.length > 0) {
      this.requestRender();
    }

    this.isProcessingBatch = false;
  }

  private processVoxelUpdate(key: string, voxelData: VoxelData | null): void {
    if (voxelData === null) {
      // This is a removal operation
      this.chunks.forEach((chunk) => {
        const existingInstance = chunk.voxelInstances.get(key);
        if (existingInstance) {
          this.releaseInstanceIndex(chunk, existingInstance.state, existingInstance.lodLevel, existingInstance.instanceIndex);
          chunk.voxelInstances.delete(key);
        }
      });
      return;
    }

    // Calculate LOD level for this voxel
    const lodLevel = this.calculateLODLevel(voxelData);
    
    // Skip if culled
    if (lodLevel === LODLevel.CULLED) {
      return;
    }

    // This is an add/update operation
    const chunkCoords = this.getChunkCoords(voxelData.x, voxelData.y, voxelData.z);
    const chunk = this.getOrCreateChunk(chunkCoords);
    
    const existingInstance = chunk.voxelInstances.get(key);
    
    if (existingInstance) {
      // Check if state or LOD level changed
      if (existingInstance.state !== voxelData.state || existingInstance.lodLevel !== lodLevel) {
        // Release old instance and create new one with different state/LOD
        this.releaseInstanceIndex(chunk, existingInstance.state, existingInstance.lodLevel, existingInstance.instanceIndex);
        
        const newInstanceIndex = this.getAvailableInstanceIndex(chunk, voxelData.state, lodLevel);
        this.setInstanceTransform(chunk, voxelData.state, lodLevel, newInstanceIndex, voxelData.x, voxelData.y, voxelData.z);
        
        chunk.voxelInstances.set(key, {
          state: voxelData.state,
          instanceIndex: newInstanceIndex,
          lodLevel: lodLevel
        });
      } else {
        // Just update position (in case it moved)
        this.setInstanceTransform(chunk, voxelData.state, lodLevel, existingInstance.instanceIndex, voxelData.x, voxelData.y, voxelData.z);
      }
    } else {
      // Create new voxel instance
      const instanceIndex = this.getAvailableInstanceIndex(chunk, voxelData.state, lodLevel);
      this.setInstanceTransform(chunk, voxelData.state, lodLevel, instanceIndex, voxelData.x, voxelData.y, voxelData.z);
      
      chunk.voxelInstances.set(key, {
        state: voxelData.state,
        instanceIndex,
        lodLevel: lodLevel
      });
    }

    // Handle special voxel types
    if (voxelData.state === 'CURRENT_POSITION') {
      this.currentPositionKey = key;
      
      // Update camera follow target
      if (this.isFollowingEnabled) {
        this.cameraFollowTarget.set(voxelData.x, voxelData.y, voxelData.z);
      }
    }
    
    if (voxelData.state === 'CURRENT_TARGET') {
      this.currentTargetKey = key;
    }
  }

  private updateChunkVisibility(): void {
    // Always ensure all chunks are visible - culling disabled for stability
    this.chunks.forEach((chunk) => {
      Object.values(chunk.instancedMeshes).forEach(stateMeshes => {
        Object.values(stateMeshes).forEach(instancedMesh => {
          instancedMesh.visible = true;
        });
      });
    });
    
    // Skip culling logic entirely to prevent current position disappearing
    return;
    
    // Original culling logic kept but disabled
    /*
    if (!this.cullingEnabled) {
      // If culling is disabled, ensure all chunks are visible
      this.chunks.forEach((chunk) => {
        Object.values(chunk.instancedMeshes).forEach(instancedMesh => {
          instancedMesh.visible = true;
        });
      });
      return;
    }

    // Update frustum for culling calculations
    this.cameraMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.cameraMatrix);

    const cameraPosition = this.camera.position;

    this.chunks.forEach((chunk, chunkKey) => {
      // Parse chunk coordinates from key
      const [chunkX, chunkY, chunkZ] = chunkKey.split(',').map(Number);
      
      // Calculate chunk center world position
      const chunkCenterX = chunkX * CHUNK_SIZE + CHUNK_SIZE / 2;
      const chunkCenterY = chunkY * CHUNK_SIZE + CHUNK_SIZE / 2;
      const chunkCenterZ = chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2;
      
      // Distance culling
      const distanceToChunk = cameraPosition.distanceTo(
        new THREE.Vector3(chunkCenterX, chunkCenterY, chunkCenterZ)
      );
      
      // Never cull chunk containing current position
      const hasCurrentPosition = this.currentPositionKey && chunk.voxelInstances.has(this.currentPositionKey);
      const isVisible = hasCurrentPosition || distanceToChunk <= this.cullingDistance;
      
      // Update visibility for all InstancedMesh objects in this chunk
      Object.values(chunk.instancedMeshes).forEach(instancedMesh => {
        instancedMesh.visible = isVisible;
      });
    });
    */
  }

  private cleanupEmptyChunks(): void {
    const chunksToRemove: string[] = [];
    
    this.chunks.forEach((chunk, chunkKey) => {
      if (chunk.voxelInstances.size === 0) {
        // Remove all InstancedMesh objects from the scene
        Object.values(chunk.instancedMeshes).forEach(stateMeshes => {
          Object.values(stateMeshes).forEach(instancedMesh => {
            this.voxelGroup.remove(instancedMesh);
            // Dispose geometry only for Points (LOW LOD level has unique geometry per chunk)
            if ((instancedMesh as any).isPoints) {
              instancedMesh.geometry.dispose();
            }
          });
        });
        chunksToRemove.push(chunkKey);
      }
    });

    chunksToRemove.forEach(chunkKey => this.chunks.delete(chunkKey));
  }

  private initializeScene(): void {
    // Setup renderer
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    
    // Setup scene
    this.scene.background = new THREE.Color(0x0a0a0a);
    
    // Camera position
    this.camera.position.set(30, 30, 30);
    this.camera.lookAt(0, 0, 0);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 100, 50);
    this.scene.add(directionalLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 0.8, 200);
    pointLight.position.set(0, 50, 0);
    this.scene.add(pointLight);
    
    // Add voxel group to scene
    this.scene.add(this.voxelGroup);
    
    // Grid helper
    const gridHelper = new THREE.GridHelper(200, 100, 0x444444, 0x222222);
    this.scene.add(gridHelper);
    
    // Axes helper
    const axesHelper = new THREE.AxesHelper(50);
    this.scene.add(axesHelper);
    
  }

  private setupControls(): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 200;
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;

    // Add event listeners for render-on-demand
    this.controls.addEventListener('start', () => {
      this.isUserInteracting = true;
      this.requestRender();
    });
    
    this.controls.addEventListener('change', () => {
      this.requestRender();
    });
    
    this.controls.addEventListener('end', () => {
      this.isUserInteracting = false;
    });

    // Add double-click listener directly to controls' dom element
    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick.bind(this));

    // Window resize handler
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private handleDoubleClick = (event: MouseEvent) => {
    // Raycasting to find clicked voxel
    const mouse = new THREE.Vector2();
    const rect = this.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const intersects = raycaster.intersectObjects(this.voxelGroup.children);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      if (intersect.instanceId !== undefined) {
        // For InstancedMesh, we get the instance position from the matrix
        const instanceMatrix = new THREE.Matrix4();
        (intersect.object as THREE.InstancedMesh).getMatrixAt(intersect.instanceId, instanceMatrix);
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(instanceMatrix);
        
        this.controls.target.copy(position);
        this.controls.update();
        this.requestRender();
        console.log('Focused on voxel at:', position);
      }
    }
  };


  private startRenderLoop(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      
      let shouldRender = this.needsRender;
      
      // Detect if user is manually controlling the camera
      this.detectUserCameraControl();
      
      // Smooth camera following logic
      if (this.isFollowingEnabled && this.currentPositionKey && !this.userControlledCamera) {
        this.isAutomaticallyMovingCamera = true;
        
        // Calculate desired camera position (target + offset)
        const desiredPosition = new THREE.Vector3().copy(this.cameraFollowTarget).add(this.cameraOffset);
        
        // Calculate delta for smooth interpolation
        const delta = new THREE.Vector3().subVectors(desiredPosition, this.camera.position).multiplyScalar(this.followLerpFactor);
        
        // Only continue following if there's significant movement
        if (delta.length() > 0.001) {
          // Update camera position
          this.camera.position.add(delta);
          
          // Update controls target to look at the current position
          const targetDelta = new THREE.Vector3().subVectors(this.cameraFollowTarget, this.controls.target).multiplyScalar(this.followLerpFactor);
          this.controls.target.add(targetDelta);
          
          shouldRender = true;
        }
        
        this.isAutomaticallyMovingCamera = false;
      } else if (this.isFollowingEnabled && this.currentPositionKey && this.userControlledCamera) {
        // User has manual control but following is enabled - update only the target to follow
        // but maintain the user's chosen camera angle and distance
        this.isAutomaticallyMovingCamera = true;
        
        // Calculate current offset from target
        const currentOffset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
        
        // Smoothly move target to follow the current position
        const targetDelta = new THREE.Vector3().subVectors(this.cameraFollowTarget, this.controls.target).multiplyScalar(this.followLerpFactor);
        
        // Only update if there's significant movement
        if (targetDelta.length() > 0.001) {
          this.controls.target.add(targetDelta);
          
          // Move camera to maintain the same relative offset
          this.camera.position.copy(this.controls.target).add(currentOffset);
          
          shouldRender = true;
        }
        
        this.isAutomaticallyMovingCamera = false;
      }
      
      // Process batched voxel updates
      this.processBatchedVoxelUpdates();
      
      // Perform periodic cleanup and enforce limits
      this.performPeriodicCleanup();
      this.enforceVoxelLimit();
      
      // Update chunk visibility based on culling settings
      this.updateChunkVisibility();
      
      // Performance monitoring
      this.logPerformance();
      
      // Only render if something changed
      if (shouldRender || this.isUserInteracting) {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
      }
    };
    animate();
  }

  public updateVoxels(voxelsMap: Map<string, VoxelData>): void {
    // Find voxels to remove (not in new data)
    const currentKeys = new Set<string>();
    this.chunks.forEach((chunk) => {
      chunk.voxelInstances.forEach((_, key) => {
        currentKeys.add(key);
      });
    });

    // Queue removals for voxels not in the new data
    currentKeys.forEach(key => {
      if (!voxelsMap.has(key)) {
        this.addToQueue(key, null);
      }
    });

    // Process voxels with immediate handling for critical ones
    voxelsMap.forEach((voxelData, key) => {
      // Process CURRENT_POSITION and CURRENT_TARGET immediately for responsiveness
      if (voxelData.state === 'CURRENT_POSITION' || voxelData.state === 'CURRENT_TARGET') {
        this.processVoxelUpdate(key, voxelData);
        this.requestRender();
        return;
      }

      // Apply spatial culling for regular voxels
      if (this.shouldCullVoxel(voxelData)) {
        return; // Skip distant voxels
      }

      // Add regular voxels to queue
      this.addToQueue(key, voxelData);
    });

    // Handle first voxel auto-centering (immediate processing for UX)
    if (this.chunks.size === 0 && voxelsMap.size === 1) {
      const firstVoxel = Array.from(voxelsMap.values())[0];
      console.log('Centering camera on first voxel at:', firstVoxel.x, firstVoxel.y, firstVoxel.z);
      this.controls.target.set(firstVoxel.x, firstVoxel.y, firstVoxel.z);
      this.camera.position.set(firstVoxel.x + 30, firstVoxel.y + 30, firstVoxel.z + 30);
      this.camera.lookAt(firstVoxel.x, firstVoxel.y, firstVoxel.z);
      this.controls.update();
      this.requestRender();
    }

    // Request render since voxels were queued for updates
    this.requestRender();
  }

  public centerCamera(bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): void {
    let totalVoxels = 0;
    this.chunks.forEach(chunk => {
      totalVoxels += chunk.voxelInstances.size;
    });
    if (totalVoxels === 0) return;

    // Calculate center of all voxels
    const center = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2
    );

    // Calculate size of bounding box
    const size = new THREE.Vector3(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2;

    console.log('Centering camera on bounds:', bounds);
    console.log('Center:', center);
    console.log('Size:', size);

    // Set camera position
    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + distance,
      center.y + distance,
      center.z + distance
    );
    this.camera.lookAt(center);
    this.controls.update();
    this.requestRender();
  }


  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.requestRender();
  }

  public dispose(): void {
    // Stop animation loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    // Clear processing queues
    this.voxelUpdateQueue.length = 0;
    this.queuedKeys.clear();

    // Remove event listeners
    this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick.bind(this));
    window.removeEventListener('resize', this.onWindowResize.bind(this));

    // Dispose of all chunks and their InstancedMesh objects
    this.chunks.forEach((chunk) => {
      Object.values(chunk.instancedMeshes).forEach(stateMeshes => {
        Object.values(stateMeshes).forEach(instancedMesh => {
          this.voxelGroup.remove(instancedMesh);
          // Dispose geometry only for Points (LOW LOD level has unique geometry per chunk)
          if ((instancedMesh as any).isPoints) {
            instancedMesh.geometry.dispose();
          }
        });
      });
      chunk.voxelInstances.clear();
    });
    this.chunks.clear();

    // Dispose of materials
    Object.values(this.materials).forEach(material => material.dispose());
    Object.values(this.pointMaterials).forEach(material => material.dispose());

    // Dispose of geometries
    Object.values(this.voxelGeometries).forEach(geometry => geometry.dispose());

    // Dispose of controls
    this.controls.dispose();

    // Dispose of renderer
    this.renderer.dispose();
  }
}
