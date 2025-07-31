import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VoxelData, VoxelState } from '../../hooks/useVoxelStream';
import { perfTracker } from '../../utils/performance-tracker';

const CHUNK_SIZE = 16;
const MAX_VOXELS_PER_CHUNK = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

// LOD (Level of Detail) system
enum LODLevel {
  HIGH = 0,
  MEDIUM = 1,
  LOW = 2,
  CULLED = 3,
}

const LOD_DISTANCES = [150, 400, 1000];

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
  position: THREE.Vector3;
}

class Chunk {
  public voxels: Map<string, VoxelInstance> = new Map(); // Voxel's world key -> VoxelInstance
  private needsUpdate: Set<LODLevel> = new Set();

  private scene: THREE.Scene;
  private chunkPosition: THREE.Vector3;

  public meshes: {
    [LODLevel.HIGH]: THREE.InstancedMesh;
    [LODLevel.MEDIUM]: THREE.InstancedMesh;
    [LODLevel.LOW]: THREE.Points;
  };
  private availableIndices: Record<
    LODLevel.HIGH | LODLevel.MEDIUM | LODLevel.LOW,
    number[]
  >;
  private usedIndices: Record<
    LODLevel.HIGH | LODLevel.MEDIUM | LODLevel.LOW,
    Set<number>
  >;

  constructor(chunkKey: string, scene: THREE.Scene, private requestRender: () => void) {
    this.scene = scene;
    const [chunkX, chunkY, chunkZ] = chunkKey.split(',').map(Number);
    this.chunkPosition = new THREE.Vector3(
      chunkX * CHUNK_SIZE,
      chunkY * CHUNK_SIZE,
      chunkZ * CHUNK_SIZE
    );

    this.meshes = this.createMeshes();
    this.availableIndices = {
      [LODLevel.HIGH]: [],
      [LODLevel.MEDIUM]: [],
      [LODLevel.LOW]: [],
    };
    this.usedIndices = {
      [LODLevel.HIGH]: new Set(),
      [LODLevel.MEDIUM]: new Set(),
      [LODLevel.LOW]: new Set(),
    };
    this.initializeAvailableIndices();
  }

  private createMeshes() {
    const highGeom = new THREE.BoxGeometry(1, 1, 1);
    const highMat = new THREE.MeshLambertMaterial();
    const highMesh = new THREE.InstancedMesh(
      highGeom,
      highMat,
      MAX_VOXELS_PER_CHUNK
    );
    highMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (highMesh.instanceColor)
      highMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    highMesh.position.copy(this.chunkPosition);
    this.scene.add(highMesh);

    const medGeom = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const medMat = new THREE.MeshLambertMaterial();
    const medMesh = new THREE.InstancedMesh(
      medGeom,
      medMat,
      MAX_VOXELS_PER_CHUNK
    );
    medMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (medMesh.instanceColor)
      medMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    medMesh.position.copy(this.chunkPosition);
    this.scene.add(medMesh);

    const lowGeom = new THREE.BufferGeometry();
    lowGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_VOXELS_PER_CHUNK * 3), 3)
    );
    lowGeom.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(MAX_VOXELS_PER_CHUNK * 3), 3)
    );
    const lowMat = new THREE.PointsMaterial({ size: 3, vertexColors: true });
    const lowPoints = new THREE.Points(lowGeom, lowMat);
    lowPoints.position.copy(this.chunkPosition);
    this.scene.add(lowPoints);

    return {
      [LODLevel.HIGH]: highMesh,
      [LODLevel.MEDIUM]: medMesh,
      [LODLevel.LOW]: lowPoints,
    };
  }

  private initializeAvailableIndices() {
    for (let i = 0; i < MAX_VOXELS_PER_CHUNK; i++) {
      this.availableIndices[LODLevel.HIGH].push(i);
      this.availableIndices[LODLevel.MEDIUM].push(i);
      this.availableIndices[LODLevel.LOW].push(i);
    }
  }

  private getLocalCoords(worldX: number, worldY: number, worldZ: number) {
    return new THREE.Vector3(
      worldX - this.chunkPosition.x,
      worldY - this.chunkPosition.y,
      worldZ - this.chunkPosition.z
    );
  }

  public addVoxel(worldX: number, worldY: number, worldZ: number, state: VoxelState) {
    const key = `${worldX},${worldY},${worldZ}`;
    if (this.voxels.has(key)) {
      this.updateVoxel(worldX, worldY, worldZ, state);
      return;
    }
    const voxel: VoxelInstance = {
      key,
      state,
      lodLevel: LODLevel.CULLED,
      instanceIndex: -1,
      position: new THREE.Vector3(worldX, worldY, worldZ),
    };
    this.voxels.set(key, voxel);
  }

  public removeVoxel(key: string) {
    const voxel = this.voxels.get(key);
    if (voxel) {
      if (voxel.lodLevel !== LODLevel.CULLED) {
        this.changeVoxelLOD(voxel, LODLevel.CULLED);
      }
      this.voxels.delete(key);
    }
  }

  public updateVoxel(worldX: number, worldY: number, worldZ: number, state: VoxelState) {
    const key = `${worldX},${worldY},${worldZ}`;
    const voxel = this.voxels.get(key);
    if (!voxel || voxel.state === state) return;

    voxel.state = state;
    if (voxel.lodLevel !== LODLevel.CULLED) {
      const color = STATE_COLORS[state];
      const mesh = this.meshes[voxel.lodLevel];
      if (mesh instanceof THREE.InstancedMesh) {
        mesh.setColorAt(voxel.instanceIndex, color);
        if (mesh.instanceColor) this.needsUpdate.add(voxel.lodLevel);
      } else {
        const colors = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        colors.setXYZ(voxel.instanceIndex, color.r, color.g, color.b);
        this.needsUpdate.add(LODLevel.LOW);
      }
    }
  }

  public updateVoxelLOD(voxel: VoxelInstance, cameraPosition: THREE.Vector3) {
    const distance = voxel.position.distanceTo(cameraPosition);
    let newLodLevel = LODLevel.CULLED;
    if (distance < LOD_DISTANCES[0]) newLodLevel = LODLevel.HIGH;
    else if (distance < LOD_DISTANCES[1]) newLodLevel = LODLevel.MEDIUM;
    else if (distance < LOD_DISTANCES[2]) newLodLevel = LODLevel.LOW;

    if (newLodLevel !== voxel.lodLevel) {
      this.changeVoxelLOD(voxel, newLodLevel);
      this.requestRender();
    }
  }

  private changeVoxelLOD(voxel: VoxelInstance, newLodLevel: LODLevel) {
    const oldLodLevel = voxel.lodLevel;

    // Release from old LOD
    if (oldLodLevel !== LODLevel.CULLED) {
      const oldMesh = this.meshes[oldLodLevel];
      this.availableIndices[oldLodLevel].push(voxel.instanceIndex);
      this.usedIndices[oldLodLevel].delete(voxel.instanceIndex);
      this.needsUpdate.add(oldLodLevel);

      if (oldMesh instanceof THREE.InstancedMesh) {
        // Move instance far away instead of scaling to zero
        const matrix = new THREE.Matrix4().setPosition(-10000, -10000, -10000);
        oldMesh.setMatrixAt(voxel.instanceIndex, matrix);
      } else {
        const positions = oldMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        positions.setXYZ(voxel.instanceIndex, -10000, -10000, -10000);
      }
    }

    voxel.lodLevel = newLodLevel;

    // Acquire for new LOD
    if (newLodLevel !== LODLevel.CULLED) {
      const newIndex = this.availableIndices[newLodLevel].pop();
      if (newIndex === undefined) {
        voxel.lodLevel = LODLevel.CULLED;
        return;
      }

      voxel.instanceIndex = newIndex;
      this.usedIndices[newLodLevel].add(newIndex);
      const newMesh = this.meshes[newLodLevel];
      const color = STATE_COLORS[voxel.state];
      const localPosition = this.getLocalCoords(voxel.position.x, voxel.position.y, voxel.position.z);
      this.needsUpdate.add(newLodLevel);

      if (newMesh instanceof THREE.InstancedMesh) {
        const matrix = new THREE.Matrix4().setPosition(localPosition);
        newMesh.setMatrixAt(newIndex, matrix);
        newMesh.setColorAt(newIndex, color);
      } else {
        const positions = newMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colors = newMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        positions.setXYZ(newIndex, localPosition.x, localPosition.y, localPosition.z);
        colors.setXYZ(newIndex, color.r, color.g, color.b);
      }
    }
  }

  public updateMeshes() {
    this.needsUpdate.forEach(lodLevel => {
      if (lodLevel === LODLevel.CULLED) return;
      const mesh = this.meshes[lodLevel];
      if (mesh instanceof THREE.InstancedMesh) {
        // Set count to the highest used index + 1, or 0 if no indices are used
        const maxUsedIndex = this.usedIndices[lodLevel].size > 0 ? Math.max(...Array.from(this.usedIndices[lodLevel])) : -1;
        mesh.count = Math.max(0, maxUsedIndex + 1);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      } else {
        const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colors = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        positions.needsUpdate = true;
        colors.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
      }
    });
    this.needsUpdate.clear();
  }

  public dispose() {
    Object.values(this.meshes).forEach(mesh => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
  }
}

export class ThreeManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private chunks: Map<string, Chunk> = new Map();
  private allVoxels: Map<string, { chunkKey: string }> = new Map();

  private currentPositionKey: string | null = null;
  private currentTargetKey: string | null = null;
  private animationId: number | null = null;
  
  // Camera following variables
  private cameraFollowTarget: THREE.Vector3 = new THREE.Vector3();
  private currentTargetPosition: THREE.Vector3 = new THREE.Vector3();
  private isFollowingEnabled: boolean = true;
  private followLerpFactor: number = 0.05;
  private yawLerpFactor: number = 0.02; // Slower rotation for smooth yaw alignment
  private cameraOffset: THREE.Vector3 = new THREE.Vector3(30, 30, 30);
  private defaultCameraOffset: THREE.Vector3 = new THREE.Vector3(30, 30, 30);
  private userControlledCamera: boolean = false;
  private targetYaw: number = 0; // Target yaw angle in radians
  private currentYaw: number = 0; // Current yaw angle in radians

  private lodUpdateInterval: number | null = null;
  private needsRender: boolean = true;
  private isUserInteracting: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    this.initializeScene();
    this.setupControls();

    this.startRenderLoop();
    this.lodUpdateInterval = window.setInterval(this.updateLODs, 500);
  }

  private getChunkKey(x: number, y: number, z: number): string {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    return `${chunkX},${chunkY},${chunkZ}`;
  }

  private initializeScene() {
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

  private setupControls() {
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

  private requestRender(): void {
    this.needsRender = true;
  }

  private handleDoubleClick = (event: MouseEvent) => {
    const mouse = new THREE.Vector2();
    const rect = this.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const chunkMeshes: THREE.Object3D[] = [];
    this.chunks.forEach(chunk => {
      Object.values(chunk.meshes).forEach(mesh => {
        chunkMeshes.push(mesh as THREE.Object3D);
      });
    });
    const intersects = raycaster.intersectObjects(chunkMeshes);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      if (intersect.instanceId !== undefined) {
        const instanceMatrix = new THREE.Matrix4();
        (intersect.object as THREE.InstancedMesh).getMatrixAt(intersect.instanceId, instanceMatrix);
        
        const position = new THREE.Vector3().setFromMatrixPosition(instanceMatrix);
        // The position is local to the chunk, we need to transform it to world coordinates
        position.applyMatrix4(intersect.object.matrixWorld);
        
        this.controls.target.copy(position);
        this.controls.update();
        this.requestRender();
        console.log('Focused on voxel at:', position);
      }
    }
  };

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.requestRender();
  }

  private startRenderLoop(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      
      const loopStartTime = performance.now();
      let shouldRender = this.needsRender;
      
      this.chunks.forEach(chunk => chunk.updateMeshes());

      if (this.isFollowingEnabled && this.currentPositionKey) {
        // Smooth yaw rotation towards target direction
        let yawChanged = false;
        if (this.currentTargetKey) {
          const yawDiff = this.targetYaw - this.currentYaw;
          // Handle angle wrapping (shortest rotation path)
          let adjustedYawDiff = yawDiff;
          if (adjustedYawDiff > Math.PI) adjustedYawDiff -= 2 * Math.PI;
          if (adjustedYawDiff < -Math.PI) adjustedYawDiff += 2 * Math.PI;
          
          if (Math.abs(adjustedYawDiff) > 0.01) {
            this.currentYaw += adjustedYawDiff * this.yawLerpFactor;
            yawChanged = true;
          }
        }

        // Apply yaw rotation to camera offset
        const rotatedOffset = this.cameraOffset.clone();
        rotatedOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.currentYaw);

        const desiredPosition = new THREE.Vector3().copy(this.cameraFollowTarget).add(rotatedOffset);
        const delta = new THREE.Vector3().subVectors(desiredPosition, this.camera.position).multiplyScalar(this.followLerpFactor);
        
        if (delta.length() > 0.001 || yawChanged) {
          this.camera.position.add(delta);
          const targetDelta = new THREE.Vector3().subVectors(this.cameraFollowTarget, this.controls.target).multiplyScalar(this.followLerpFactor);
          this.controls.target.add(targetDelta);
          shouldRender = true;
        }
      }
      
      if (shouldRender || this.isUserInteracting) {
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

  private updateLODs = () => {
    if (this.isUserInteracting) return;
    const startTime = performance.now();
    const cameraPosition = this.camera.position;
    this.chunks.forEach(chunk => {
      chunk.voxels.forEach(voxel => {
        chunk.updateVoxelLOD(voxel, cameraPosition);
      });
    });
    perfTracker.record('updateLODs', performance.now() - startTime);
  };

  public updateVoxels(voxelsMap: Map<string, VoxelData>) {
    const startTime = performance.now();
    const newVoxelKeys = new Set(voxelsMap.keys());

    // Remove voxels that are no longer in the stream
    this.allVoxels.forEach((info, key) => {
      if (!newVoxelKeys.has(key)) {
        const chunk = this.chunks.get(info.chunkKey);
        chunk?.removeVoxel(key);
        this.allVoxels.delete(key);
      }
    });

    // Add or update voxels
    voxelsMap.forEach((voxelData, voxelKey) => {
      const { x, y, z, state } = voxelData;
      const existingVoxel = this.allVoxels.get(voxelKey);
      const chunkKey = this.getChunkKey(x, y, z);

      let chunk = this.chunks.get(chunkKey);
      if (!chunk) {
        chunk = new Chunk(chunkKey, this.scene, () => this.requestRender());
        this.chunks.set(chunkKey, chunk);
      }

      if (existingVoxel) {
        chunk.updateVoxel(x, y, z, state);
      } else {
        chunk.addVoxel(x, y, z, state);
        this.allVoxels.set(voxelKey, { chunkKey });
      }

      // Handle current position and target for camera following
      if (state === 'CURRENT_POSITION') {
        this.updateCurrentPosition(x, y, z);
      } else if (state === 'CURRENT_TARGET') {
        this.updateCurrentTarget(x, y, z);
      }
    });

    // Initial LOD update for new voxels
    this.updateLODs();
    this.requestRender();
    perfTracker.record('updateVoxels', performance.now() - startTime);
  }

  public updateCurrentPosition(x: number, y: number, z: number) {
    const newPositionKey = `${x},${y},${z}`;
    if (newPositionKey === this.currentPositionKey) return;

    this.currentPositionKey = newPositionKey;
    if (this.isFollowingEnabled) {
      this.cameraFollowTarget.set(x, y, z);
      this.updateTargetYaw();
      this.requestRender();
    }
  }

  public updateCurrentTarget(x: number, y: number, z: number) {
    const newTargetKey = `${x},${y},${z}`;
    if (newTargetKey === this.currentTargetKey) return;

    this.currentTargetKey = newTargetKey;
    if (this.isFollowingEnabled) {
      this.currentTargetPosition.set(x, y, z);
      this.updateTargetYaw();
      this.requestRender();
    }
  }

  private updateTargetYaw() {
    if (this.currentPositionKey && this.currentTargetKey && this.isFollowingEnabled) {
      // Calculate direction from current position to target
      const direction = new THREE.Vector3()
        .subVectors(this.currentTargetPosition, this.cameraFollowTarget)
        .normalize();
      
      // Calculate target yaw (rotation around Y-axis)
      this.targetYaw = Math.atan2(direction.x, direction.z);
    }
  }

  public resetCameraToDefault(): void {
    this.isFollowingEnabled = true;
    this.userControlledCamera = false;
    this.cameraOffset.copy(this.defaultCameraOffset);
    this.currentYaw = 0;
    this.targetYaw = 0;
    
    if (this.currentPositionKey) {
        const targetPosition = this.cameraFollowTarget;
        const desiredPosition = targetPosition.clone().add(this.cameraOffset);
        this.camera.position.copy(desiredPosition);
        this.controls.target.copy(targetPosition);
        this.controls.update();
        this.requestRender();
    }
  }

  public centerCamera(bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) {
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
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2));
    cameraZ *= 1.5; // zoom out a bit

    this.camera.position.set(center.x, center.y, center.z + cameraZ);
    this.controls.target.set(center.x, center.y, center.z);
    this.userControlledCamera = false;
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
      // Reset yaw when enabling camera following
      this.currentYaw = 0;
      this.targetYaw = 0;
      // If we have a current position, immediately start following it
      if (this.currentPositionKey) {
        const [x, y, z] = this.currentPositionKey.split(',').map(Number);
        this.cameraFollowTarget.set(x, y, z);
        this.updateTargetYaw();
        this.requestRender();
      }
    }
  }

  public setCullingEnabled(_enabled: boolean): void {
    // Culling is now implicitly handled by the LOD system
  }

  public setCullingDistance(_distance: number): void {
    // This is now controlled by LOD_DISTANCES
  }

  public getCullingSettings(): { enabled: boolean; distance: number } {
    return {
      enabled: true, // Always enabled with LOD system
      distance: LOD_DISTANCES[2] // Max LOD distance
    };
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.needsRender = true;
  }

  public dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.lodUpdateInterval) {
      clearInterval(this.lodUpdateInterval);
    }

    this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick.bind(this));
    window.removeEventListener('resize', this.onWindowResize.bind(this));

    this.chunks.forEach(chunk => chunk.dispose());
    this.chunks.clear();
    this.allVoxels.clear();

    this.scene.children.forEach(child => {
        this.scene.remove(child);
    });

    this.controls.dispose();
    this.renderer.dispose();
  }
}