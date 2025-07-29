import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VoxelData, VoxelState } from '../../hooks/useVoxelStream';

const CHUNK_SIZE = 16;
const MAX_INSTANCES_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE; // 4096

interface VoxelChunk {
  instancedMeshes: Record<VoxelState, THREE.InstancedMesh>;
  voxelInstances: Map<string, { state: VoxelState; instanceIndex: number }>;
  availableIndices: Record<VoxelState, number[]>;
  nextInstanceIndex: Record<VoxelState, number>;
}

export class ThreeManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private voxelGroup: THREE.Group;
  private voxelGeometry: THREE.BoxGeometry;
  private materials: Record<VoxelState, THREE.MeshLambertMaterial>;
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
    
    // Create voxel geometry
    this.voxelGeometry = new THREE.BoxGeometry(1, 1, 1);
    
    // Create materials for different voxel states - using MeshLambertMaterial for emissive support
    this.materials = {
      WALKABLE: new THREE.MeshLambertMaterial({ color: 0x00ff00 }),
      PASSABLE: new THREE.MeshLambertMaterial({ color: 0xffff00 }),
      WALL: new THREE.MeshLambertMaterial({ color: 0xff0000 }),
      UNKNOWN: new THREE.MeshLambertMaterial({ color: 0x00ffff }),
      CURRENT_POSITION: new THREE.MeshLambertMaterial({ color: 0x0000ff }),
      CURRENT_TARGET: new THREE.MeshLambertMaterial({ color: 0xff00ff }),
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
        instancedMeshes: {} as Record<VoxelState, THREE.InstancedMesh>,
        voxelInstances: new Map(),
        availableIndices: {
          WALKABLE: [],
          PASSABLE: [],
          WALL: [],
          UNKNOWN: [],
          CURRENT_POSITION: [],
          CURRENT_TARGET: [],
        },
        nextInstanceIndex: {
          WALKABLE: 0,
          PASSABLE: 0,
          WALL: 0,
          UNKNOWN: 0,
          CURRENT_POSITION: 0,
          CURRENT_TARGET: 0,
        }
      };

      // Create InstancedMesh for each voxel state in this chunk
      Object.keys(this.materials).forEach((state) => {
        const voxelState = state as VoxelState;
        const instancedMesh = new THREE.InstancedMesh(
          this.voxelGeometry,
          this.materials[voxelState],
          MAX_INSTANCES_PER_CHUNK
        );
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedMesh.count = 0;
        chunk.instancedMeshes[voxelState] = instancedMesh;
        this.voxelGroup.add(instancedMesh);
      });

      this.chunks.set(chunkKey, chunk);
    }

    return this.chunks.get(chunkKey)!;
  }

  private getAvailableInstanceIndex(chunk: VoxelChunk, state: VoxelState): number {
    // Check if there's a recycled index available
    if (chunk.availableIndices[state].length > 0) {
      return chunk.availableIndices[state].pop()!;
    }
    
    // Check if we need to expand the InstancedMesh capacity
    const instancedMesh = chunk.instancedMeshes[state];
    if (chunk.nextInstanceIndex[state] >= instancedMesh.count) {
      instancedMesh.count = chunk.nextInstanceIndex[state] + 1;
    }
    
    return chunk.nextInstanceIndex[state]++;
  }

  private releaseInstanceIndex(chunk: VoxelChunk, state: VoxelState, index: number): void {
    // Hide the instance by moving it far away
    const matrix = new THREE.Matrix4();
    matrix.setPosition(10000, 10000, 10000);
    chunk.instancedMeshes[state].setMatrixAt(index, matrix);
    chunk.instancedMeshes[state].instanceMatrix.needsUpdate = true;
    
    // Add to available indices for reuse
    chunk.availableIndices[state].push(index);
  }

  private setInstanceTransform(chunk: VoxelChunk, state: VoxelState, index: number, x: number, y: number, z: number): void {
    const matrix = new THREE.Matrix4();
    matrix.setPosition(x, y, z);
    chunk.instancedMeshes[state].setMatrixAt(index, matrix);
    chunk.instancedMeshes[state].instanceMatrix.needsUpdate = true;
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
  private readonly MAX_QUEUE_SIZE = 2000; // Drop old voxels if queue exceeds this
  private readonly SPATIAL_CULL_DISTANCE = 150; // Only process voxels within this distance

  private requestRender(): void {
    this.needsRender = true;
  }

  private shouldCullVoxel(voxelData: VoxelData): boolean {
    // Never cull critical voxels
    if (voxelData.state === 'CURRENT_POSITION' || voxelData.state === 'CURRENT_TARGET') {
      return false;
    }

    // Calculate distance from camera
    const distance = this.camera.position.distanceTo(
      new THREE.Vector3(voxelData.x, voxelData.y, voxelData.z)
    );
    
    return distance > this.SPATIAL_CULL_DISTANCE;
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

    // Check queue size limit
    if (this.voxelUpdateQueue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest items to make space
      const toRemove = this.voxelUpdateQueue.splice(0, 100); // Remove 100 oldest
      toRemove.forEach(item => this.queuedKeys.delete(item.key));
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
    let totalProcessed = 0;

    // Process multiple batches if time allows
    while ((performance.now() - startTime) < this.FRAME_BUDGET_MS) {
      processedCount = 0;
      
      // Process regular queue
      while (
        this.voxelUpdateQueue.length > 0 &&
        processedCount < this.BATCH_SIZE &&
        (performance.now() - startTime) < this.FRAME_BUDGET_MS
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
          this.releaseInstanceIndex(chunk, existingInstance.state, existingInstance.instanceIndex);
          chunk.voxelInstances.delete(key);
        }
      });
      return;
    }

    // This is an add/update operation
    const chunkCoords = this.getChunkCoords(voxelData.x, voxelData.y, voxelData.z);
    const chunk = this.getOrCreateChunk(chunkCoords);
    
    const existingInstance = chunk.voxelInstances.get(key);
    
    if (existingInstance) {
      // Check if state changed
      if (existingInstance.state !== voxelData.state) {
        // Release old instance and create new one with different state
        this.releaseInstanceIndex(chunk, existingInstance.state, existingInstance.instanceIndex);
        
        const newInstanceIndex = this.getAvailableInstanceIndex(chunk, voxelData.state);
        this.setInstanceTransform(chunk, voxelData.state, newInstanceIndex, voxelData.x, voxelData.y, voxelData.z);
        
        chunk.voxelInstances.set(key, {
          state: voxelData.state,
          instanceIndex: newInstanceIndex
        });
      } else {
        // Just update position (in case it moved)
        this.setInstanceTransform(chunk, voxelData.state, existingInstance.instanceIndex, voxelData.x, voxelData.y, voxelData.z);
      }
    } else {
      // Create new voxel instance
      const instanceIndex = this.getAvailableInstanceIndex(chunk, voxelData.state);
      this.setInstanceTransform(chunk, voxelData.state, instanceIndex, voxelData.x, voxelData.y, voxelData.z);
      
      chunk.voxelInstances.set(key, {
        state: voxelData.state,
        instanceIndex
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
      Object.values(chunk.instancedMeshes).forEach(instancedMesh => {
        instancedMesh.visible = true;
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
        Object.values(chunk.instancedMeshes).forEach(instancedMesh => {
          this.voxelGroup.remove(instancedMesh);
          instancedMesh.dispose();
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
      
      // Update chunk visibility based on culling settings
      this.updateChunkVisibility();
      
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
      Object.values(chunk.instancedMeshes).forEach(instancedMesh => {
        this.voxelGroup.remove(instancedMesh);
        instancedMesh.dispose();
      });
      chunk.voxelInstances.clear();
    });
    this.chunks.clear();

    // Dispose of materials
    Object.values(this.materials).forEach(material => material.dispose());

    // Dispose of geometry
    this.voxelGeometry.dispose();

    // Dispose of controls
    this.controls.dispose();

    // Dispose of renderer
    this.renderer.dispose();
  }
}
