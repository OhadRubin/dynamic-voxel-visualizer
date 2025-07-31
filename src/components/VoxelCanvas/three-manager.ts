import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VoxelData, VoxelState } from '../../hooks/useVoxelStream';
import { perfTracker } from '../../utils/performance-tracker';

const CHUNK_SIZE = 16;
const MAX_VOXELS = 50000; // Increased capacity

// LOD (Level of Detail) system
enum LODLevel {
  HIGH = 0,    // Full detail voxels
  MEDIUM = 1,  // Simplified voxels
  LOW = 2,     // Point sprites
  CULLED = 3   // Not rendered
}

const LOD_DISTANCES = [150, 400, 1000]; // Adjusted distances for better distribution

// Voxel state colors
const STATE_COLORS: Record<VoxelState, THREE.Color> = {
  WALKABLE: new THREE.Color(0x00ff00),
  PASSABLE: new THREE.Color(0xffff00),
  WALL: new THREE.Color(0xff0000),
  UNKNOWN: new THREE.Color(0x00ffff),
  CURRENT_POSITION: new THREE.Color(0x0000ff),
  CURRENT_TARGET: new THREE.Color(0xff00ff),
};

interface VoxelInstance {
  key: string;
  state: VoxelState;
  lodLevel: LODLevel;
  instanceIndex: number;
}

export class ThreeManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  // Optimized rendering objects
  private instancedMeshes: Record<LODLevel, THREE.InstancedMesh | THREE.Points>;
  private availableIndices: Record<LODLevel, number[]> = {
    [LODLevel.HIGH]: [],
    [LODLevel.MEDIUM]: [],
    [LODLevel.LOW]: [],
    [LODLevel.CULLED]: [],
  };
  private nextInstanceIndex: Record<LODLevel, number> = { [LODLevel.HIGH]: 0, [LODLevel.MEDIUM]: 0, [LODLevel.LOW]: 0, [LODLevel.CULLED]: 0 };
  private dirtyBuffers: Set<LODLevel> = new Set();

  private voxelInstances: Map<string, VoxelInstance> = new Map();

  private currentPositionKey: string | null = null;
  private animationId: number | null = null;
  
  // Camera following variables
  private cameraFollowTarget: THREE.Vector3 = new THREE.Vector3();
  private isFollowingEnabled: boolean = true;
  private followLerpFactor: number = 0.05;
  private cameraOffset: THREE.Vector3 = new THREE.Vector3(30, 30, 30);
  private defaultCameraOffset: THREE.Vector3 = new THREE.Vector3(30, 30, 30);
  private userControlledCamera: boolean = false;
  
  // Culling variables
  private cullingEnabled: boolean = false;
  private cullingDistance: number = 100;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    this.instancedMeshes = this.createInstancedMeshes();
    this.initializeAvailableIndices();

    this.initializeScene();
    this.setupControls();
    
    this.startRenderLoop();
  }

  private createInstancedMeshes(): Record<LODLevel, THREE.InstancedMesh | THREE.Points> {
    const geometries = {
      [LODLevel.HIGH]: new THREE.BoxGeometry(1, 1, 1),
      [LODLevel.MEDIUM]: new THREE.BoxGeometry(0.7, 0.7, 0.7),
      [LODLevel.LOW]: new THREE.BufferGeometry(),
    };

    // Add color attributes
    geometries[LODLevel.HIGH].setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(MAX_VOXELS * 3), 3));
    geometries[LODLevel.MEDIUM].setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(MAX_VOXELS * 3), 3));
    geometries[LODLevel.LOW].setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_VOXELS * 3), 3));
    geometries[LODLevel.LOW].setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_VOXELS * 3), 3));

    const materials = {
      [LODLevel.HIGH]: new THREE.MeshLambertMaterial(),
      [LODLevel.MEDIUM]: new THREE.MeshLambertMaterial(),
      [LODLevel.LOW]: new THREE.PointsMaterial({ vertexColors: true, size: 3 }),
    };

    const meshes: any = {};

    meshes[LODLevel.HIGH] = new THREE.InstancedMesh(geometries[LODLevel.HIGH], materials[LODLevel.HIGH], MAX_VOXELS);
    meshes[LODLevel.MEDIUM] = new THREE.InstancedMesh(geometries[LODLevel.MEDIUM], materials[LODLevel.MEDIUM], MAX_VOXELS);
    meshes[LODLevel.LOW] = new THREE.Points(geometries[LODLevel.LOW], materials[LODLevel.LOW]);

    Object.values(meshes).forEach((mesh: any) => {
        if (mesh.instanceMatrix) {
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        }
        this.scene.add(mesh);
    });

    return meshes;
  }

  private initializeAvailableIndices() {
      for (let i = 0; i < MAX_VOXELS; i++) {
          this.availableIndices[LODLevel.HIGH].push(i);
          this.availableIndices[LODLevel.MEDIUM].push(i);
          this.availableIndices[LODLevel.LOW].push(i);
      }
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

  private getAvailableInstanceIndex(lodLevel: LODLevel): number | undefined {
    return this.availableIndices[lodLevel].pop();
  }

  private releaseInstanceIndex(lodLevel: LODLevel, index: number): void {
    this.availableIndices[lodLevel].push(index);
    // Hide the instance
    this.setInstanceTransform(lodLevel, index, new THREE.Vector3(0, -10000, 0), 'UNKNOWN');
  }

  private setInstanceTransform(lodLevel: LODLevel, index: number, position: THREE.Vector3, state: VoxelState): void {
    const color = STATE_COLORS[state];
    if (lodLevel === LODLevel.LOW) {
        const points = this.instancedMeshes[LODLevel.LOW] as THREE.Points;
        const positions = points.geometry.attributes.position as THREE.BufferAttribute;
        const colors = points.geometry.attributes.color as THREE.BufferAttribute;
        positions.setXYZ(index, position.x, position.y, position.z);
        colors.setXYZ(index, color.r, color.g, color.b);
        positions.needsUpdate = true;
        colors.needsUpdate = true;
    } else {
        const mesh = this.instancedMeshes[lodLevel] as THREE.InstancedMesh;
        const matrix = new THREE.Matrix4();
        matrix.setPosition(position);
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, color);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.dirtyBuffers.add(lodLevel);
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
    
    if (this.currentPositionKey) {
        const targetPosition = this.cameraFollowTarget;
        const desiredPosition = targetPosition.clone().add(this.cameraOffset);
        this.camera.position.copy(desiredPosition);
        this.controls.target.copy(targetPosition);
        this.controls.update();
        this.requestRender();
    }
  }

  private isAutomaticallyMovingCamera: boolean = false;
  private needsRender: boolean = true;
  private isUserInteracting: boolean = false;

  private voxelUpdateQueue: Array<{key: string, voxelData: VoxelData | null}> = [];
  private queuedKeys = new Set<string>();
  private isProcessingBatch: boolean = false;
  private readonly BATCH_SIZE = 500; // Increased batch size
  private readonly FRAME_BUDGET_MS = 16;
  
  private frameCount = 0;
  private lastPerformanceLog = 0;

  private requestRender(): void {
    this.needsRender = true;
  }

  private calculateLODLevel(voxelData: VoxelData): LODLevel {
    if (voxelData.state === 'CURRENT_POSITION' || voxelData.state === 'CURRENT_TARGET') {
      return LODLevel.HIGH;
    }

    const distance = this.camera.position.distanceTo(new THREE.Vector3(voxelData.x, voxelData.y, voxelData.z));
    
    if (distance < LOD_DISTANCES[0]) return LODLevel.HIGH;
    if (distance < LOD_DISTANCES[1]) return LODLevel.MEDIUM;
    if (distance < LOD_DISTANCES[2]) return LODLevel.LOW;
    return LODLevel.CULLED;
  }

  private logPerformance(): void {
    this.frameCount++;
    const now = performance.now();
    
    if (now - this.lastPerformanceLog > 10000) { // Every 10 seconds
      const totalVoxels = this.voxelInstances.size;
      const queueSize = this.voxelUpdateQueue.length;
      
      console.log(`Performance: ${totalVoxels} voxels, ${queueSize} queued, ~${(this.frameCount / 10).toFixed(1)} fps`);
      
      this.frameCount = 0;
      this.lastPerformanceLog = now;
    }
  }

  private addToQueue(key: string, voxelData: VoxelData | null): void {
    if (this.queuedKeys.has(key)) {
      const existingIndex = this.voxelUpdateQueue.findIndex(item => item.key === key);
      if (existingIndex !== -1) {
        this.voxelUpdateQueue[existingIndex] = { key, voxelData };
      }
      return;
    }

    this.voxelUpdateQueue.push({ key, voxelData });
    this.queuedKeys.add(key);
  }

  private processBatchedVoxelUpdates(): void {
    if (this.voxelUpdateQueue.length === 0 || this.isProcessingBatch) {
      return;
    }

    this.isProcessingBatch = true;
    const startTime = performance.now();
    let processedCount = 0;

    while (this.voxelUpdateQueue.length > 0 && (performance.now() - startTime) < this.FRAME_BUDGET_MS) {
        const update = this.voxelUpdateQueue.shift()!;
        this.queuedKeys.delete(update.key);
        this.processVoxelUpdate(update.key, update.voxelData);
        processedCount++;
        if (processedCount >= this.BATCH_SIZE) break;
    }

    if (processedCount > 0) {
      this.requestRender();
    }

    this.isProcessingBatch = false;
  }

  private processVoxelUpdate(key: string, voxelData: VoxelData | null): void {
    const existingInstance = this.voxelInstances.get(key);

    if (voxelData === null) { // Removal
      if (existingInstance) {
        this.releaseInstanceIndex(existingInstance.lodLevel, existingInstance.instanceIndex);
        this.voxelInstances.delete(key);
      }
      return;
    }

    const lodLevel = this.calculateLODLevel(voxelData);
    const position = new THREE.Vector3(voxelData.x, voxelData.y, voxelData.z);

    if (existingInstance) { // Update
      if (existingInstance.lodLevel !== lodLevel) {
        this.releaseInstanceIndex(existingInstance.lodLevel, existingInstance.instanceIndex);
        const newInstanceIndex = this.getAvailableInstanceIndex(lodLevel);
        if (newInstanceIndex !== undefined) {
          this.setInstanceTransform(lodLevel, newInstanceIndex, position, voxelData.state);
          existingInstance.lodLevel = lodLevel;
          existingInstance.instanceIndex = newInstanceIndex;
          existingInstance.state = voxelData.state;
        } else {
            this.voxelInstances.delete(key); // No space left
        }
      } else {
        this.setInstanceTransform(lodLevel, existingInstance.instanceIndex, position, voxelData.state);
        existingInstance.state = voxelData.state;
      }
    } else { // Addition
      if (lodLevel === LODLevel.CULLED) return;
      const newInstanceIndex = this.getAvailableInstanceIndex(lodLevel);
      if (newInstanceIndex !== undefined) {
        this.setInstanceTransform(lodLevel, newInstanceIndex, position, voxelData.state);
        this.voxelInstances.set(key, { key, state: voxelData.state, lodLevel, instanceIndex: newInstanceIndex });
      }
    }

    if (voxelData.state === 'CURRENT_POSITION') {
      this.currentPositionKey = key;
      if (this.isFollowingEnabled) {
        this.cameraFollowTarget.copy(position);
      }
    }
  }

  private updateDirtyBuffers() {
      this.dirtyBuffers.forEach(lodLevel => {
          const mesh = this.instancedMeshes[lodLevel];
          if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
              const instancedMesh = mesh as THREE.InstancedMesh;
              instancedMesh.instanceMatrix.needsUpdate = true;
              if (instancedMesh.instanceColor) {
                  instancedMesh.instanceColor.needsUpdate = true;
              }
          } else if ((mesh as THREE.Points).isPoints) {
              const points = mesh as THREE.Points;
              points.geometry.attributes.position.needsUpdate = true;
              points.geometry.attributes.color.needsUpdate = true;
          }
      });
      this.dirtyBuffers.clear();
  }

  private initializeScene(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.scene.background = new THREE.Color(0x0a0a0a);
    this.camera.position.set(30, 30, 30);
    this.camera.lookAt(0, 0, 0);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 100, 50);
    this.scene.add(directionalLight);
    
    const gridHelper = new THREE.GridHelper(200, 100, 0x444444, 0x222222);
    this.scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(50);
    this.scene.add(axesHelper);
  }

  private setupControls(): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 1500;

    this.controls.addEventListener('start', () => { 
        this.isUserInteracting = true; 
        this.userControlledCamera = true;
        this.requestRender(); 
    });
    this.controls.addEventListener('change', () => { this.requestRender(); });
    this.controls.addEventListener('end', () => { this.isUserInteracting = false; });

    this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick.bind(this));
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private handleDoubleClick = (event: MouseEvent) => {
    const mouse = new THREE.Vector2();
    const rect = this.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const intersects = raycaster.intersectObjects(Object.values(this.instancedMeshes));

    if (intersects.length > 0) {
      const intersect = intersects[0];
      if (intersect.instanceId !== undefined) {
        const instanceMatrix = new THREE.Matrix4();
        (intersect.object as THREE.InstancedMesh).getMatrixAt(intersect.instanceId, instanceMatrix);
        const position = new THREE.Vector3().setFromMatrixPosition(instanceMatrix);
        
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
      
      const loopStartTime = performance.now();
      let shouldRender = this.needsRender;
      
      const batchStartTime = performance.now();
      this.processBatchedVoxelUpdates();
      perfTracker.record('processBatchedVoxelUpdates', performance.now() - batchStartTime);

      if (this.isFollowingEnabled && this.currentPositionKey && !this.userControlledCamera) {
        const desiredPosition = new THREE.Vector3().copy(this.cameraFollowTarget).add(this.cameraOffset);
        const delta = new THREE.Vector3().subVectors(desiredPosition, this.camera.position).multiplyScalar(this.followLerpFactor);
        
        if (delta.length() > 0.001) {
          this.camera.position.add(delta);
          const targetDelta = new THREE.Vector3().subVectors(this.cameraFollowTarget, this.controls.target).multiplyScalar(this.followLerpFactor);
          this.controls.target.add(targetDelta);
          shouldRender = true;
        }
      }
      
      this.logPerformance();
      
      if (shouldRender || this.isUserInteracting || this.dirtyBuffers.size > 0) {
        this.updateDirtyBuffers();
        const renderStartTime = performance.now();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
        perfTracker.record('render', performance.now() - renderStartTime);
      }
      
      perfTracker.record('renderLoop', performance.now() - loopStartTime);
      perfTracker.summarize();
    };
    animate();
  }

  public updateVoxels(voxelsMap: Map<string, VoxelData>): void {
    const newKeys = new Set(voxelsMap.keys());

    // Single pass for additions, updates, and removals
    const allKeys = new Set([...Array.from(newKeys), ...Array.from(this.voxelInstances.keys())]);

    allKeys.forEach(key => {
        const newVoxelData = voxelsMap.get(key) || null;
        this.addToQueue(key, newVoxelData);
    });

    this.requestRender();
  }

  public centerCamera(bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): void {
    if (this.voxelInstances.size === 0) return;

    const center = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2
    );

    const size = new THREE.Vector3(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.5; // Adjust distance for better framing

    this.controls.target.copy(center);
    this.camera.position.set(center.x + distance, center.y + distance, center.z + distance);
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
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.voxelUpdateQueue.length = 0;
    this.queuedKeys.clear();

    this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick.bind(this));
    window.removeEventListener('resize', this.onWindowResize.bind(this));

    this.scene.children.forEach(child => {
        this.scene.remove(child);
        if ((child as any).geometry) {
            (child as any).geometry.dispose();
        }
        if ((child as any).material) {
            (child as any).material.dispose();
        }
    });

    this.voxelInstances.clear();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
