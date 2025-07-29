import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VoxelData, VoxelState } from '../../hooks/useVoxelStream';

export class ThreeManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private voxelGroup: THREE.Group;
  private voxels: Map<string, THREE.Mesh>;
  private voxelGeometry: THREE.BoxGeometry;
  private materials: Record<VoxelState, THREE.MeshLambertMaterial>;
  private currentPositionVoxel: THREE.Mesh | null = null;
  private currentTargetVoxel: THREE.Mesh | null = null;
  private animationId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // Initialize Three.js objects
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.voxelGroup = new THREE.Group();
    this.voxels = new Map();
    
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

    this.initializeScene();
    this.setupControls();
    this.startRenderLoop();
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
    
    // Add a test cube at origin
    const testGeometry = new THREE.BoxGeometry(2, 2, 2);
    const testMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const testCube = new THREE.Mesh(testGeometry, testMaterial);
    testCube.position.set(0, 1, 0);
    this.scene.add(testCube);
    console.log('Test cube added at origin (0, 1, 0) in magenta - if you see this, rendering works!');
  }

  private setupControls(): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 200;
    this.controls.enableRotate = true;

    // Window resize handler
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private startRenderLoop(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  public updateVoxels(voxelsMap: Map<string, VoxelData>): void {
    // Clear existing voxels that are no longer in the new data
    const keysToRemove: string[] = [];
    this.voxels.forEach((mesh, key) => {
      if (!voxelsMap.has(key)) {
        this.voxelGroup.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          mesh.material.dispose();
        }
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(key => this.voxels.delete(key));

    // Add or update voxels
    voxelsMap.forEach((voxelData, key) => {
      const existingMesh = this.voxels.get(key);
      
      if (existingMesh) {
        // Update existing voxel if state changed
        const newMaterial = this.materials[voxelData.state].clone();
        existingMesh.material = newMaterial;
      } else {
        // Create new voxel
        const material = this.materials[voxelData.state].clone();
        const voxel = new THREE.Mesh(this.voxelGeometry, material);
        voxel.position.set(voxelData.x, voxelData.y, voxelData.z);
        
        // Add edges for better visibility
        const edges = new THREE.EdgesGeometry(this.voxelGeometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        const lineSegments = new THREE.LineSegments(edges, lineMaterial);
        voxel.add(lineSegments);
        
        // Handle special voxel types
        if (voxelData.state === 'CURRENT_POSITION') {
          // Reduce opacity of previous position voxel
          if (this.currentPositionVoxel) {
            const prevMaterial = this.currentPositionVoxel.material as THREE.MeshLambertMaterial;
            prevMaterial.opacity = 0.1;
            prevMaterial.transparent = true;
          }
          this.currentPositionVoxel = voxel;
        }
        
        if (voxelData.state === 'CURRENT_TARGET') {
          // Reset previous target voxel
          if (this.currentTargetVoxel) {
            const prevMaterial = this.currentTargetVoxel.material as THREE.MeshLambertMaterial;
            prevMaterial.opacity = 1.0;
            prevMaterial.transparent = false;
            prevMaterial.emissive.setHex(0x000000);
          }
          this.currentTargetVoxel = voxel;
          
          // Add highlighting
          const targetMaterial = voxel.material as THREE.MeshLambertMaterial;
          targetMaterial.emissive.setHex(0x444444);
          targetMaterial.transparent = true;
          targetMaterial.opacity = 1.0;
          
          // Fade highlighting after delay
          setTimeout(() => {
            if (voxel.material) {
              const fadeMaterial = voxel.material as THREE.MeshLambertMaterial;
              const fadeSteps = 30;
              let step = 0;
              const fadeInterval = setInterval(() => {
                step++;
                const progress = step / fadeSteps;
                const glowIntensity = Math.max(0, 0x444444 * (1 - progress));
                fadeMaterial.emissive.setHex(glowIntensity);
                
                if (step >= fadeSteps) {
                  clearInterval(fadeInterval);
                  fadeMaterial.emissive.setHex(0x000000);
                }
              }, 50);
            }
          }, 3000);
        }
        
        this.voxelGroup.add(voxel);
        this.voxels.set(key, voxel);
      }
    });

    // Auto-center camera on first voxel
    if (this.voxels.size === 1 && voxelsMap.size === 1) {
      const firstVoxel = Array.from(voxelsMap.values())[0];
      console.log('Centering camera on first voxel at:', firstVoxel.x, firstVoxel.y, firstVoxel.z);
      this.controls.target.set(firstVoxel.x, firstVoxel.y, firstVoxel.z);
      this.camera.position.set(firstVoxel.x + 30, firstVoxel.y + 30, firstVoxel.z + 30);
      this.camera.lookAt(firstVoxel.x, firstVoxel.y, firstVoxel.z);
      this.controls.update();
    }
  }

  public centerCamera(bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): void {
    if (this.voxels.size === 0) return;

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
  }

  public onDoubleClick(event: MouseEvent, callback?: (position: THREE.Vector3) => void): void {
    // Raycasting to find clicked voxel
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const intersects = raycaster.intersectObjects(this.voxelGroup.children);

    if (intersects.length > 0) {
      const target = intersects[0].object.position;
      this.controls.target.copy(target);
      this.controls.update();
      
      if (callback) {
        callback(target);
      }
    }
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public dispose(): void {
    // Stop animation loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    // Dispose of all voxel meshes
    this.voxels.forEach(mesh => {
      this.voxelGroup.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => mat.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.voxels.clear();

    // Dispose of materials
    Object.values(this.materials).forEach(material => material.dispose());

    // Dispose of geometry
    this.voxelGeometry.dispose();

    // Dispose of renderer
    this.renderer.dispose();

    // Remove event listeners
    window.removeEventListener('resize', this.onWindowResize.bind(this));

    // Dispose of controls
    this.controls.dispose();
  }
}
