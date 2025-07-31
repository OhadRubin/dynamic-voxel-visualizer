# React GitHub Pages Template

A template for creating and deploying React applications to GitHub Pages with Tailwind CSS using one-click deployment.

## Features

- ⚛️ React with TypeScript
- 🎨 Tailwind CSS for styling
- 📱 Responsive design
- 🚀 GitHub Pages deployment
- 🤖 One-click automated deployment


## Quick Start
1. First-time setup:
   ```
   npm run init-and-deploy
   ```
   You'll be prompted to enter a repository name, or you can provide one directly:
   ```
   npm run init-and-deploy -- --repo-name="dynamic-voxel-visualizer"
   ```

2. For subsequent updates, simply run:
   ```
   npm run auto-deploy
   ```

Your app will be available at the URL provided in the console output.

## Development

- Start the development server:
  ```
  npm start
  ```
- Build for production:
  ```
  npm run build
  ```
- Deploy changes to GitHub Pages:
  ```
  npm run deploy
  ```

## Customization

- Modify the components in the `src` directory
- Customize Tailwind CSS in `tailwind.config.js`
- Update the page title and metadata in `public/index.html`

## Troubleshooting

If the initialization fails:

- Make sure GitHub CLI is installed: `gh --version`
- Make sure you're logged in to GitHub: `gh auth status`
- Check error messages in the console output

## License


`src/App.test.tsx`
   - `test('renders learn react link', () => { ... })` (line 5-9) - A test case that renders the App component and asserts that an element with the text "learn react" is present in the document.

  `src/App.tsx`
   - `App()` (line 10-77) - The main application component that manages the overall state and layout.
     - `useState(false)` (line 12) - Initializes state for enabling or disabling culling.
     - `useState(1000)` (line 13) - Initializes state for the culling distance.
     - `useState({ following: true, userControlled: false })` (line 16) - Initializes state for camera settings, including following and user control status.
     - `useState<CameraControls | null>(null)` (line 17) - Initializes state for the camera controls object.
     - `useVoxelStream('ws://localhost:8080')` (line 19-27) - A custom hook that handles the WebSocket connection and voxel data stream.
     - `return (...)` (line 29-76) - Renders the main application layout, including the VoxelCanvas, StatusPanel, and ControlsPanel.

  `src/components/ActionButtons/index.tsx`
   - `ActionButtons: React.FC<ActionButtonsProps> = ({ ... }) => { ... }` (line 11-51) - A functional component that renders action buttons for clearing voxels, pausing/resuming the stream, and centering the camera.

  `src/components/UI/ControlsPanel/index.tsx`
   - `ControlsPanel: React.FC = () => { ... }` (line 4-40) - A functional component that displays a panel with camera and debug controls information.

  `src/components/UI/Panel.tsx`
   - `Panel: React.FC<PanelProps> = ({ ... }) => { ... }` (line 17-111) - A reusable panel component with options for title, minimizability, and positioning.
     - `useState(defaultMinimized)` (line 32) - Initializes state for whether the panel is minimized.

  `src/components/UI/StatusPanel/ColorLegend.tsx`
   - `ColorLegend: React.FC = () => { ... }` (line 11-53) - A functional component that displays a color legend for different voxel states.

  `src/components/UI/StatusPanel/StatItem.tsx`
   - `StatItem: React.FC<StatItemProps> = ({ label, value, className = '' }) => { ... }` (line 8-21) - A simple component for displaying a labeled statistic.

  `src/components/UI/StatusPanel/index.tsx`
   - `StatusPanel: React.FC<StatusPanelProps> = ({ ... }) => { ... }` (line 25-282) - A component that displays a status panel with statistics, culling controls, camera controls, and action buttons.
     - `getConnectionStatusDisplay()` (line 40-63) - A helper function to generate the display for the WebSocket connection status.
     - `getBoundsDisplay()` (line 65-78) - A helper function to format and display the bounding box of the voxels.

  `src/components/VoxelCanvas/index.tsx`
   - `VoxelCanvas: React.FC<VoxelCanvasProps> = ({ ... }) => { ... }` (line 23-141) - A component that wraps the Three.js canvas and manages the ThreeManager.
     - `useRef<HTMLCanvasElement>(null)` (line 32) - A ref for the canvas element.
     - `useRef<ThreeManager | null>(null)` (line 33) - A ref for the ThreeManager instance.
     - `useEffect(() => { ... }, [])` (line 35-46) - An effect to initialize and dispose of the ThreeManager.
     - `useEffect(() => { ... }, [voxels])` (line 48-53) - An effect to update the voxels in the ThreeManager when the voxels prop changes.
     - `useEffect(() => { ... }, [centerRequest, bounds])` (line 55-60) - An effect to center the camera when a center request is made.
     - `useEffect(() => { ... }, [cullingEnabled])` (line 62-67) - An effect to update the culling enabled state in the ThreeManager.
     - `useEffect(() => { ... }, [cullingDistance])` (line 69-74) - An effect to update the culling distance in the ThreeManager.
     - `useEffect(() => { ... }, [onCameraSettingsChange])` (line 76-86) - An effect to monitor and report camera settings changes.
     - `useEffect(() => { ... }, [onCameraControlsReady])` (line 103-107) - An effect to notify the parent component when camera controls are ready.

  `src/components/VoxelCanvas/three-manager.ts`
   - `class ThreeManager` (line 25-1025) - A class that encapsulates all Three.js logic for rendering the voxel scene.
     - `constructor(canvas: HTMLCanvasElement)` (line 57-101) - Initializes the scene, camera, renderer, controls, and other necessary components.
     - `createPointGeometry(): THREE.BufferGeometry` (line 103-110) - Creates a buffer geometry for rendering points.
     - `getChunkCoords(x: number, y: number, z: number): [number, number, number]` (line 112-118) - Calculates the chunk coordinates for a given world position.
     - `getChunkKey(chunkX: number, chunkY: number, chunkZ: number): string` (line 120-122) - Generates a unique key for a chunk.
     - `getLocalCoords(x: number, y: number, z: number): [number, number, number]` (line 124-130) - Calculates the local coordinates within a chunk.
     - `getOrCreateChunk([chunkX, chunkY, chunkZ]: [number, number, number]): VoxelChunk` (line 132-184) - Retrieves an existing chunk or creates a new one if it doesn't exist.
     - `getAvailableInstanceIndex(chunk: VoxelChunk, state: VoxelState, lodLevel: LODLevel): number` (line 186-199) - Gets an available instance index from a chunk's pool.
     - `releaseInstanceIndex(chunk: VoxelChunk, state: VoxelState, lodLevel: LODLevel, index: number): void` (line 201-228) - Releases an instance index back to the pool for reuse.
     - `setInstanceTransform(chunk: VoxelChunk, state: VoxelState, lodLevel: LODLevel, index: number, x: number, y: number, z: number): void` (line 230-257) - Sets the transform (position) of a voxel instance.
     - `setCullingEnabled(enabled: boolean): void` (line 259-261) - Enables or disables distance-based culling.
     - `setCullingDistance(distance: number): void` (line 263-265) - Sets the culling distance.
     - `getCullingSettings(): { enabled: boolean; distance: number }` (line 267-272) - Gets the current culling settings.
     - `getCameraSettings(): { following: boolean; userControlled: boolean }` (line 274-279) - Gets the current camera settings.
     - `setCameraFollowing(enabled: boolean): void` (line 281-286) - Enables or disables camera following.
     - `resetCameraToDefault(): void` (line 288-303) - Resets the camera to its default position and orientation.
     - `detectUserCameraControl(): void` (line 305-317) - Detects if the user is manually controlling the camera.
     - `requestRender(): void` (line 343-345) - Requests a new render frame.
     - `calculateLODLevel(voxelData: VoxelData): LODLevel` (line 347-363) - Calculates the appropriate level of detail (LOD) for a voxel based on its distance from the camera.
     - `shouldCullVoxel(voxelData: VoxelData): boolean` (line 365-367) - Determines if a voxel should be culled (not rendered).
     - `getTotalVoxelCount(): number` (line 369-375) - Gets the total number of voxels currently in the scene.
     - `performPeriodicCleanup(): void` (line 377-418) - Periodically removes distant voxels to manage memory and performance.
     - `enforceVoxelLimit(): void` (line 420-465) - Enforces a maximum voxel limit by removing the farthest voxels.
     - `logPerformance(): void` (line 467-481) - Logs performance metrics to the console.
     - `addToQueue(key: string, voxelData: VoxelData | null): void` (line 483-503) - Adds a voxel update to the processing queue.
     - `processBatchedVoxelUpdates(): void` (line 505-555) - Processes voxel updates in batches to avoid blocking the main thread.
     - `processVoxelUpdate(key: string, voxelData: VoxelData | null): void` (line 557-627) - Processes a single voxel update, either adding, updating, or removing a voxel.
     - `updateChunkVisibility(): void` (line 629-684) - Updates the visibility of chunks based on culling settings.
     - `cleanupEmptyChunks(): void` (line 686-706) - Removes empty chunks from the scene to free up resources.
     - `initializeScene(): void` (line 708-743) - Initializes the Three.js scene, including lighting, helpers, and other objects.
     - `setupControls(): void` (line 745-775) - Sets up the OrbitControls for camera manipulation.
     - `handleDoubleClick = (event: MouseEvent) => { ... }` (line 777-805) - Handles double-click events to focus the camera on a specific voxel.
     - `startRenderLoop(): void` (line 807-884) - Starts the main render loop.
     - `updateVoxels(voxelsMap: Map<string, VoxelData>): void` (line 886-933) - Updates the scene with new voxel data.
     - `centerCamera(bounds: { ... }): void` (line 935-974) - Centers the camera on the bounding box of all voxels.
     - `onWindowResize(): void` (line 976-981) - Handles window resize events to update the camera and renderer.
     - `dispose(): void` (line 983-1024) - Cleans up all Three.js objects and event listeners when the component is unmounted.

  `src/hooks/useVoxelStream.ts`
   - `useVoxelStream(websocketUrl: string)` (line 25-324) - A custom hook that manages the WebSocket connection, voxel data, and related statistics.
     - `useState<Map<string, VoxelData>>(new Map())` (line 26) - Initializes state for the map of voxels.
     - `useState<Stats>({ ... })` (line 27-37) - Initializes state for the statistics object.
     - `useState(false)` (line 38) - Initializes state for the paused status of the stream.
     - `useState(0)` (line 39) - Initializes state for the camera center request.
     - `useRef<WebSocket | null>(null)` (line 41) - A ref for the WebSocket instance.
     - `useRef<Set<string>>(new Set())` (line 42) - A ref for the set of unique voxel positions.
     - `useRef<number[]>([])` (line 43) - A ref to store timestamps of recent voxels for rate calculation.
     - `useRef(0)` (line 44) - A ref for the total voxel count.
     - `useRef<NodeJS.Timeout | null>(null)` (line 45) - A ref for the reconnect timeout ID.
     - `useRef<{ x: number; y: number; z: number } | null>(null)` (line 46) - A ref for the origin offset.
     - `connectWebSocket = useCallback(() => { ... }, [websocketUrl, isPaused])` (line 48-163) - A memoized function to establish and manage the WebSocket connection.
     - `useEffect(() => { ... }, [connectWebSocket])` (line 166-279) - An effect to initialize the WebSocket connection and set up test data if the connection fails.
     - `useEffect(() => { ... }, [])` (line 282-294) - An effect to set up an interval for calculating the voxel rate.
     - `clearAllVoxels = useCallback(() => { ... }, [])` (line 296-313) - A memoized function to clear all voxel data.
     - `togglePause = useCallback(() => { ... }, [])` (line 315-317) - A memoized function to toggle the paused state of the stream.
     - `centerCamera = useCallback(() => { ... }, [])` (line 319-321) - A memoized function to request a camera centering.

  `src/index.tsx`
   - `ReactDOM.createRoot(...)` (line 6-9) - Creates the root React DOM node.
   - `root.render(...)` (line 10-14) - Renders the main App component into the root DOM node.
   - `reportWebVitals()` (line 18) - A function to report web vitals for performance monitoring.

  `src/react-app-env.d.ts`
   - `/// <reference types="react-scripts" />` (line 1) - A reference to the TypeScript types for react-scripts.

  `src/reportWebVitals.ts`
   - `reportWebVitals = (onPerfEntry?: ReportHandler) => { ... }` (line 3-13) - A function that sets up the web-vitals library to report performance metrics.

  `src/setupTests.ts`
   - `import '@testing-library/jest-dom';` (line 5) - Imports the jest-dom library to add custom Jest matchers for asserting on DOM nodes.