import React, {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Html,
  Line,
  OrbitControls,
  PerspectiveCamera,
  Text,
  useGLTF,
} from "@react-three/drei";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Building2,
  ChevronRight,
  CloudSun,
  Compass,
  Crosshair,
  Database,
  Footprints,
  Gamepad2,
  Info,
  Layers3,
  LogOut,
  MapPin,
  Navigation,
  Route,
  Search,
  Send,
  Settings2,
  Sparkles,
  SunMedium,
  UserRound,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import * as THREE from "three";
import roadGraph from "../data/road_graph.json";
import campusLayout from "../data/campus_layout.json";
import roomAnchors from "../data/room_anchors.json";
import LoginScreen from "./LoginScreen";

const WalkPhysics = lazy(() => import("./WalkPhysics"));

const BUILDINGS = [
  {
    id: "B01",
    name: "图书馆",
    type: "LIB",
    x: 2,
    z: 4,
    w: 28,
    d: 17,
    h: 9,
    color: "#d7b26d",
    floors: 3,
    accent: "#f1d18a",
  },
  {
    id: "B02",
    name: "行政中心",
    type: "AFF",
    x: 37,
    z: 23,
    w: 22,
    d: 13,
    h: 12,
    color: "#d4d8d4",
    floors: 4,
    accent: "#84b8c8",
  },
  {
    id: "B03",
    name: "信息工程学院",
    type: "CR",
    x: 60,
    z: 3,
    w: 24,
    d: 14,
    h: 13,
    color: "#cfd8dc",
    floors: 5,
    accent: "#6aa7bc",
  },
  {
    id: "B04",
    name: "艺体中心",
    type: "GYM",
    x: -53,
    z: 41,
    w: 25,
    d: 18,
    h: 8,
    color: "#dfe5e5",
    floors: 2,
    accent: "#e99b82",
  },
  {
    id: "B05",
    name: "实验实训楼",
    type: "LB",
    x: -52,
    z: 8,
    w: 21,
    d: 12,
    h: 11,
    color: "#c8d3d2",
    floors: 4,
    accent: "#72a9b6",
  },
  {
    id: "B06",
    name: "人文学院",
    type: "CR",
    x: -27,
    z: 23,
    w: 19,
    d: 12,
    h: 9,
    color: "#e7e4dc",
    floors: 3,
    accent: "#d5a861",
  },
  {
    id: "B07",
    name: "学生事务中心",
    type: "SAO",
    x: 35,
    z: -19,
    w: 18,
    d: 12,
    h: 8,
    color: "#d8d8d3",
    floors: 3,
    accent: "#e6a76e",
  },
  {
    id: "B08",
    name: "北区教学楼",
    type: "CR",
    x: 4,
    z: 39,
    w: 18,
    d: 11,
    h: 10,
    color: "#d5dadd",
    floors: 4,
    accent: "#72aabc",
  },
  {
    id: "B09",
    name: "东区宿舍 A",
    type: "DOR",
    x: 69,
    z: -31,
    w: 18,
    d: 11,
    h: 13,
    color: "#cbd6d6",
    floors: 6,
    accent: "#82bd9a",
  },
  {
    id: "B10",
    name: "东区宿舍 B",
    type: "DOR",
    x: 43,
    z: -45,
    w: 18,
    d: 11,
    h: 13,
    color: "#c9d2d1",
    floors: 6,
    accent: "#82bd9a",
  },
  {
    id: "B11",
    name: "西区宿舍 A",
    type: "DOR",
    x: -57,
    z: -32,
    w: 18,
    d: 11,
    h: 13,
    color: "#d0d7d4",
    floors: 6,
    accent: "#82bd9a",
  },
  {
    id: "B12",
    name: "风雨操场",
    type: "GYM",
    x: -7,
    z: -43,
    w: 31,
    d: 15,
    h: 7,
    color: "#e7e1d8",
    floors: 2,
    accent: "#e79a6e",
  },
  {
    id: "B13",
    name: "食堂",
    type: "CANT",
    x: 5,
    z: -24,
    w: 24,
    d: 14,
    h: 7,
    color: "#e0d3be",
    floors: 2,
    accent: "#d29555",
  },
  {
    id: "B14",
    name: "南区教学楼",
    type: "CR",
    x: -22,
    z: -12,
    w: 20,
    d: 12,
    h: 10,
    color: "#d8dada",
    floors: 4,
    accent: "#6ea8bc",
  },
];

const ROAD_NODES = [
  ["gate", -91, -67, "南校门"],
  ["south", -42, -65, "南区路口"],
  ["junction", 2, -61, "中央路口"],
  ["eastGate", 88, -58, "东校门"],
  ["west", -86, 13, "西侧林荫道"],
  ["westMid", -63, 12, "西区路口"],
  ["center", -18, 5, "中央广场"],
  ["eastMid", 42, 9, "东区路口"],
  ["east", 88, 13, "东侧林荫道"],
  ["northWest", -67, 53, "北侧环路"],
  ["north", 1, 61, "北区路口"],
  ["northEast", 76, 55, "东侧山路"],
  ["dormWest", -70, -30, "西宿舍入口"],
  ["dormSouth", 39, -54, "东宿舍入口"],
  ["field", -52, 32, "运动场入口"],
  ["lake", 64, 43, "湖畔节点"],
];

const ROAD_EDGES = [
  ["gate", "south"],
  ["south", "junction"],
  ["junction", "eastGate"],
  ["gate", "west"],
  ["west", "westMid"],
  ["westMid", "center"],
  ["center", "eastMid"],
  ["eastMid", "east"],
  ["westMid", "northWest"],
  ["northWest", "north"],
  ["north", "northEast"],
  ["northEast", "east"],
  ["westMid", "dormWest"],
  ["dormWest", "south"],
  ["dormSouth", "junction"],
  ["eastMid", "dormSouth"],
  ["westMid", "field"],
  ["field", "northWest"],
  ["center", "north"],
  ["eastMid", "lake"],
  ["lake", "northEast"],
  ["center", "south"],
];

const COLORS = {
  morning: "#54b8ff",
  afternoon: "#f3a64f",
  next: "#c58cff",
  dorm: "#75d19d",
  route: "#f5cf64",
  selected: "#ff6464",
};
const LIFT_OFFSET = 30;
// 多视角沙盘校准后的布局是前端与 Blender 共用的唯一建筑坐标源。
const PHOTO_BUILDINGS = campusLayout.buildings;
const ROOM_RECORDS = roomAnchors.rooms || [];
const ACTIVE_ROAD_NODES =
  roadGraph.nodes?.map((node) => [
    node.id,
    node.position[0],
    node.position[2],
    node.label,
  ]) || ROAD_NODES;
const ACTIVE_ROAD_EDGES = roadGraph.edges || ROAD_EDGES;

function mat(color, metalness = 0.05, roughness = 0.65) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
    />
  );
}

function Tree({ x, z, scale = 1, autumn = false }) {
  const crown = autumn ? "#c58b45" : "#2f6b5b";
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 3.6, 7]} />
        {mat("#584335")}
      </mesh>
      <mesh position={[0, 4, 0]} castShadow>
        <dodecahedronGeometry args={[2.2, 1]} />
        {mat(crown, 0, 0.9)}
      </mesh>
      <mesh position={[0.85, 4.7, 0.2]} castShadow>
        <dodecahedronGeometry args={[1.35, 1]} />
        {mat(autumn ? "#e0ae50" : "#417966", 0, 0.9)}
      </mesh>
    </group>
  );
}

function Building({ building, highlighted, selected, onSelect, counselor }) {
  const y = building.h / 2;
  const windowRows = Math.min(building.floors, 5);
  const windows = [];
  for (let floor = 0; floor < windowRows; floor += 1) {
    const count = Math.max(3, Math.floor(building.w / 4));
    for (let i = 0; i < count; i += 1)
      windows.push(
        <mesh
          key={`f${floor}w${i}`}
          position={[
            -building.w / 2 + 2.1 + i * ((building.w - 4) / count),
            floor * 2 + 2.2,
            building.d / 2 + 0.05,
          ]}
        >
          <boxGeometry args={[1.25, 0.9, 0.12]} />
          {mat(building.accent, 0.15, 0.3)}
        </mesh>,
      );
  }
  const roomColor = highlighted?.color || building.color;
  const body =
    building.shape === "arc" ? (
      <mesh
        castShadow
        receiveShadow
        name={building.id}
        userData={{ buildingCode: building.id }}
        scale={[1, 1, 0.42]}
      >
        <cylinderGeometry
          args={[
            building.w * 0.55,
            building.w * 0.55,
            building.h,
            48,
            1,
            false,
            Math.PI * 0.18,
            Math.PI * 1.64,
          ]}
        />
        {mat(roomColor, highlighted ? 0.18 : 0.04, highlighted ? 0.36 : 0.72)}
      </mesh>
    ) : (
      <mesh
        castShadow
        receiveShadow
        name={building.id}
        userData={{ buildingCode: building.id }}
      >
        <boxGeometry args={[building.w, building.h, building.d]} />
        {mat(roomColor, highlighted ? 0.18 : 0.04, highlighted ? 0.36 : 0.72)}
      </mesh>
    );
  return (
    <group
      position={[building.x, highlighted ? 2.2 : 0, building.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(building);
      }}
    >
      {body}
      {building.shape === "arc" ? (
        <mesh
          position={[0, building.h + 0.25, 0]}
          rotation={[0, 0, 0]}
          scale={[1, 1, 0.42]}
        >
          <torusGeometry
            args={[building.w * 0.55, 0.45, 8, 48, Math.PI * 1.64]}
          />
          {mat("#d29d48", 0.12, 0.5)}
        </mesh>
      ) : (
        <mesh position={[0, building.h + 0.25, 0]} castShadow>
          <boxGeometry args={[building.w + 1.2, 0.5, building.d + 1.2]} />
          {mat(highlighted ? highlighted.color : "#a9b2b2", 0.1, 0.55)}
        </mesh>
      )}
      {windows}
      <mesh
        position={[0, 0.7, building.d / 2 + 0.1]}
        userData={{ roomCode: `${building.id}_CR_F1_101` }}
      >
        <boxGeometry args={[3.2, 1.5, 0.3]} />
        {mat(highlighted ? highlighted.color : "#a9a895", 0.05, 0.5)}
      </mesh>
      {selected && (
        <mesh position={[0, building.h / 2, 0]}>
          <boxGeometry
            args={[building.w + 0.5, building.h + 0.5, building.d + 0.5]}
          />{" "}
          <meshBasicMaterial
            color={COLORS.selected}
            wireframe
            transparent
            opacity={0.88}
          />
        </mesh>
      )}
      {selected && (
        <Html position={[0, building.h + 2.5, 0]} center distanceFactor={18}>
          <div className="scene-label">
            <span>{building.id}</span>
            {building.name}
          </div>
        </Html>
      )}
      <Text
        position={[0, building.h + 1.3, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={1.25}
        color={highlighted ? highlighted.color : "#d8e9e7"}
        anchorX="center"
        anchorY="middle"
      >
        {building.id.replace("B", "")}
      </Text>
      {counselor && building.type === "DOR" && (
        <mesh position={[0, building.h + 0.8, 0]}>
          <sphereGeometry args={[0.55, 16, 16]} />
          {mat(COLORS.dorm, 0.4, 0.2)}
        </mesh>
      )}
    </group>
  );
}

class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error, info) {
    console.error("Blender 校园模型加载失败，已切换基础模型", error, info);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

class CanvasErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, revision: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("校园三维场景渲染失败", error, info);
  }

  retry = () =>
    this.setState((state) => ({ error: null, revision: state.revision + 1 }));

  render() {
    if (this.state.error)
      return this.props.fallback({
        error: this.state.error,
        retry: this.retry,
      });
    return (
      <React.Fragment key={this.state.revision}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

function CanvasFallback({ error, retry }) {
  return (
    <div className="canvas-fallback" role="alert">
      <div className="canvas-fallback-content">
        <span className="eyebrow">3D SCENE RECOVERY</span>
        <b>校园模型暂时无法显示</b>
        <p>其余校园数据仍可使用。你可以重新初始化三维场景。</p>
        <small>{error?.message || "WebGL 场景初始化异常"}</small>
        <button type="button" onClick={retry}>
          重新加载模型
        </button>
      </div>
    </div>
  );
}

function BuildingInterior({
  building,
  highlights,
  selectedRoom,
  onRoomSelect,
}) {
  const rooms = useMemo(
    () => ROOM_RECORDS.filter((room) => room.building_code === building.id),
    [building.id],
  );
  const hasRoomHighlights = rooms.some((room) => highlights[room.room_code]);
  if (!rooms.length) return null;
  return (
    <group position={[building.x, LIFT_OFFSET + building.h, building.z]}>
      {rooms.map((room) => {
        const [x, y, z] = room.anchor_world;
        const bmin = room.bbox_min || [x - 2, y - 1.2, z - 1.5];
        const bmax = room.bbox_max || [x + 2, y + 1.2, z + 1.5];
        const width = Math.max(1.2, Math.abs(bmax[0] - bmin[0]));
        const depth = Math.max(1.2, Math.abs(bmax[2] - bmin[2]));
        const height = Math.max(1.4, Math.abs(bmax[1] - bmin[1]));
        const localRowZ = z - building.z;
        const rowSign = localRowZ >= 0 ? 1 : -1;
        const maxDepth = Math.max(4, (building.d - 1.6) / 2);
        const drawDepth = Math.min(depth, maxDepth);
        const rowCenter =
          rowSign * Math.max(0.5, building.d / 2 - drawDepth / 2 - 0.45);
        const roomNumber =
          Number(String(room.room_code).split("_").pop()) || 101;
        const col = Math.max(0, roomNumber - 101) % 5;
        const halfSpan = Math.max(2, building.w / 2 - width / 2 - 0.45);
        const drawX = halfSpan * ((col - 2) / 2);
        const active = selectedRoom?.room_code === room.room_code;
        const highlight = highlights[room.room_code];
        const color = active
          ? COLORS.selected
          : highlight?.color || building.accent;
        return (
          <group
            key={room.room_code}
            position={[drawX, y + (room.floor - 1) * 5.5, rowCenter]}
          >
            <mesh
              castShadow
              receiveShadow
              userData={{ roomCode: room.room_code }}
              onClick={(event) => {
                event.stopPropagation();
                onRoomSelect(room);
              }}
            >
              <boxGeometry args={[width, height, drawDepth]} />
              {mat(color, active ? 0.22 : 0.05, active ? 0.28 : 0.6)}
            </mesh>
            {(!hasRoomHighlights || highlight || active) && (
              <Html
                position={[0, height / 2 + 0.45, 0]}
                center
                style={{ pointerEvents: "auto" }}
              >
                <div
                  className={`room-chip${active ? " active" : ""}${
                    highlight ? " highlight" : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRoomSelect(room);
                  }}
                >
                  {room.floor}F·{String(room.room_code).split("_").pop()}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

function CampusModel({
  highlights,
  selected,
  liftedBuilding,
  interactive = true,
  onSelect,
  onRoomSelect,
  selectedRoom,
  showRooms,
}) {
  const gltf = useGLTF("/assets/yueyang_campus.glb");
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((object) => {
      if (!object.isMesh) return;
      const buildingMatch = object.name?.match(/^(B\d+)_/);
      if (buildingMatch) object.userData.building_code = buildingMatch[1];
      if (/^B\d+_[A-Z]+_F\d+_\d+$/.test(object.name || ""))
        object.userData.room_code = object.name;
      const hadMaterialArray = Array.isArray(object.material);
      const sourceMaterials = hadMaterialArray
        ? object.material
        : [object.material];
      const materials = sourceMaterials
        .filter(Boolean)
        .map((item) => (typeof item.clone === "function" ? item.clone() : null))
        .filter(Boolean);
      if (!materials.length)
        materials.push(
          new THREE.MeshStandardMaterial({ color: "#b7c0bb", roughness: 0.72 }),
        );
      object.material = hadMaterialArray ? materials : materials[0];
      object.userData.baseY = object.position.y;
      materials.forEach((item) => {
        item.userData.baseColor =
          item.color?.clone?.() || new THREE.Color("#b7c0bb");
        item.userData.baseEmissive =
          item.emissive?.clone?.() || new THREE.Color("#000000");
        item.userData.baseOpacity = Number.isFinite(item.opacity)
          ? item.opacity
          : 1;
      });
      object.castShadow = !object.userData.room_code;
      object.receiveShadow = true;
    });
    return cloned;
  }, [gltf.scene]);

  useFrame((_, delta) => {
    scene.traverse((object) => {
      if (!object.isMesh) return;
      const code = object.userData.building_code;
      const roomCode = object.userData.room_code;
      if (roomCode) object.visible = false;
      if (!code) return;
      const isSelected = selected?.id === code;
      const isLifted = liftedBuilding === code;
      const highlight = highlights[code];
      const targetY =
        object.userData.baseY +
        (isLifted ? LIFT_OFFSET : isSelected ? 5.5 : highlight ? 1.5 : 0);
      object.position.y = THREE.MathUtils.damp(
        object.position.y,
        targetY,
        5.5,
        delta,
      );
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((item) => {
        if (!item.color) return;
        const targetColor = isLifted ? null : highlight?.color;
        const baseColor = item.userData.baseColor || item.color;
        item.color.lerp(
          targetColor ? new THREE.Color(targetColor) : baseColor,
          Math.min(1, delta * 7),
        );
        if (item.emissive) {
          const baseEmissive = item.userData.baseEmissive || item.emissive;
          item.emissive.lerp(
            isLifted
              ? baseEmissive
              : targetColor
                ? new THREE.Color(targetColor)
                : baseEmissive,
            Math.min(1, delta * 7),
          );
          item.emissiveIntensity = isLifted ? 0 : targetColor ? 0.22 : 0;
        }
        const transparentShell = isLifted && showRooms && !roomCode;
        item.transparent = transparentShell;
        item.opacity = transparentShell ? 0.18 : item.userData.baseOpacity;
        item.depthWrite = !transparentShell;
      });
    });
  });

  return (
    <primitive
      object={scene}
      onClick={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        let object = event.object;
        let code = null;
        while (object && !code) {
          code =
            object.userData?.building_code ||
            object.name?.match(/^(B\d+)_/)?.[1] ||
            null;
          object = object.parent;
        }
        if (code) {
          const building =
            PHOTO_BUILDINGS.find((item) => item.id === code) || null;
          onSelect(building);
          if (building) onRoomSelect(null);
        }
      }}
    />
  );
}

function FallbackCampus({ highlights, selected, onSelect, role }) {
  return (
    <group>
      {PHOTO_BUILDINGS.map((building) => (
        <Building
          key={building.id}
          building={building}
          highlighted={highlights[building.id]}
          selected={selected?.id === building.id}
          onSelect={onSelect}
          counselor={role === "counselor"}
        />
      ))}
    </group>
  );
}

function CampusBuildingLabel({ building, onSelect }) {
  const labelRef = useRef();
  const anchor = useMemo(
    () => new THREE.Vector3(building.x, building.h + 4.2, building.z),
    [building.h, building.x, building.z],
  );
  useFrame(({ camera }) => {
    const element = labelRef.current;
    if (!element) return;
    const distance = camera.position.distanceTo(anchor);
    const fade = THREE.MathUtils.clamp((distance - 80) / 140, 0, 1);
    element.style.opacity = String(0.15 + fade * 0.85);
    element.style.pointerEvents = fade > 0.25 ? "auto" : "none";
  });
  return (
    <Html
      position={[building.x, building.h + 4.2, building.z]}
      center
      style={{ pointerEvents: "auto" }}
    >
      <div
        ref={labelRef}
        className="campus-building-label"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(building);
        }}
      >
        <small>{building.id}</small>
        <b>{building.name}</b>
      </div>
    </Html>
  );
}

function RoomHighlightMarkers({ highlights, liftedBuilding }) {
  const markers = useMemo(() => {
    const perBuilding = new Map();
    for (const [roomCode, directive] of Object.entries(highlights)) {
      const room = ROOM_RECORDS.find((item) => item.room_code === roomCode);
      if (!room) continue;
      const building = PHOTO_BUILDINGS.find(
        (item) => item.id === room.building_code,
      );
      if (!building || perBuilding.has(building.id)) continue;
      perBuilding.set(building.id, {
        building,
        color: directive.color || COLORS.dorm,
      });
    }
    return [...perBuilding.values()];
  }, [highlights]);
  return (
    <group>
      {markers
        .filter((marker) => marker.building.id !== liftedBuilding)
        .map(({ building, color }) => (
          <group key={building.id} position={[building.x, 0, building.z]}>
            <mesh position={[0, building.h + 9, 0]}>
              <cylinderGeometry args={[1.2, 1.7, 16, 12, 1, true]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.4}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh position={[0, building.h + 18, 0]}>
              <sphereGeometry args={[1.6, 14, 10]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        ))}
    </group>
  );
}

function CampusBuildingLabels({ highlighted, onSelect }) {
  return (
    <group>
      {PHOTO_BUILDINGS.map((building) => {
        const active = highlighted?.id === building.id;
        if (active) return null;
        return (
          <CampusBuildingLabel
            key={building.id}
            building={building}
            onSelect={onSelect}
          />
        );
      })}
    </group>
  );
}

function OverviewControls({ focusBuilding, enabled }) {
  const controls = useRef();
  const camera = useThree((state) => state.camera);
  const flight = useRef(null);
  const lastFocusId = useRef(null);

  useEffect(() => {
    const controlsImpl = controls.current;
    if (!controlsImpl) return undefined;
    const stop = () => {
      flight.current = null;
    };
    controlsImpl.addEventListener("start", stop);
    return () => controlsImpl.removeEventListener("start", stop);
  }, []);

  useEffect(() => {
    if (!focusBuilding) {
      flight.current = null;
      return;
    }
    if (lastFocusId.current === focusBuilding.id) return;
    lastFocusId.current = focusBuilding.id;
    const building = focusBuilding;
    const target = new THREE.Vector3(
      building.x,
      Math.min(building.h * 0.45, 20),
      building.z,
    );
    const distance = Math.min(
      650,
      Math.max(140, Math.max(building.w, building.d) * 1.55 + 75 + building.h),
    );
    const azimuth = 0.85;
    const polar = 1.02;
    const to = new THREE.Vector3(
      target.x + distance * Math.sin(polar) * Math.sin(azimuth),
      target.y + distance * Math.cos(polar),
      target.z + distance * Math.sin(polar) * Math.cos(azimuth),
    );
    flight.current = {
      from: camera.position.clone(),
      to,
      fromTarget:
        controls.current?.target.clone() || new THREE.Vector3(0, 0, 0),
      toTarget: target,
      t: 0,
    };
  }, [focusBuilding, camera]);

  useFrame((_, delta) => {
    const controlsImpl = controls.current;
    if (!enabled || !controlsImpl) return;
    const fly = flight.current;
    if (fly) {
      fly.t = Math.min(1, fly.t + delta * 0.75);
      const eased = 1 - Math.pow(1 - fly.t, 3);
      camera.position.lerpVectors(fly.from, fly.to, eased);
      controlsImpl.target.lerpVectors(fly.fromTarget, fly.toTarget, eased);
      if (fly.t >= 1) flight.current = null;
    }
    controlsImpl.update();
  });
  return (
    <OrbitControls
      ref={controls}
      enableDamping
      enablePan
      dampingFactor={0.08}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      minDistance={5}
      maxDistance={2600}
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
      target={[0, 0, 0]}
    />
  );
}

function AdminAnchorEditor({ selected, selectedRoom, token }) {
  const [name, setName] = useState(
    selectedRoom?.semantic_name || `${selected.name}·房间·1层101`,
  );
  const [status, setStatus] = useState("");
  useEffect(() => {
    setName(selectedRoom?.semantic_name || `${selected.name}·房间·1层101`);
    setStatus("");
  }, [selected, selectedRoom]);
  async function save() {
    setStatus("保存中");
    const room = selectedRoom || {
      room_code: `${selected.id}_CR_F1_101`,
      building_code: selected.id,
      anchor_world: [selected.x, 1.45, selected.z],
    };
    const response = await fetch("/api/admin/anchors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        room_code: room.room_code,
        semantic_name: name,
        building_code: room.building_code,
        anchor_world: room.anchor_world,
      }),
    });
    setStatus(response.ok ? "已写入空间映射" : "保存失败");
  }
  return (
    <div className="anchor-editor">
      <span className="eyebrow">ADMIN · ROOM ANCHOR</span>
      {selectedRoom && (
        <small className="anchor-room-code">{selectedRoom.room_code}</small>
      )}
      <div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="房间语义名称"
        />
        <button onClick={save}>写入</button>
      </div>
      <small>
        {status ||
          `坐标 ${(selectedRoom?.anchor_world?.[0] ?? selected.x).toFixed(1)}, ${
            selectedRoom?.anchor_world?.[1] ?? 1.45
          }, ${(selectedRoom?.anchor_world?.[2] ?? selected.z).toFixed(1)}`}
      </small>
    </div>
  );
}

function RoomInfoCard({ room, members, role }) {
  if (!room) return null;
  return (
    <div className="room-info-card">
      <div className="room-info-head">
        <span className="eyebrow">ROOM / {room.room_code}</span>
        <h3>{room.semantic_name}</h3>
      </div>
      <div className="room-info-meta">
        <span>
          {room.floor} 层 · {room.room_type}
        </span>
        <span>
          {room.building_code} · {room.anchor_world[0].toFixed(1)},{" "}
          {room.anchor_world[2].toFixed(1)}
        </span>
      </div>
      {members && (
        <div className="room-member-list">
          <b>宿舍成员</b>
          {members.members?.length ? (
            members.members.map((member) => (
              <div key={member.name + member.phone} className="room-member">
                <span>{member.name}</span>
                <small>
                  {member.class_name || member.className} · {member.grade} ·{" "}
                  {member.phone}
                  {member.home_phone ? ` · 家庭 ${member.home_phone}` : ""}
                </small>
              </div>
            ))
          ) : (
            <small>该宿舍暂无成员记录。</small>
          )}
        </div>
      )}
      {role === "admin" && (
        <div className="room-admin-hint">
          管理员可在下方空间锚点编辑中重命名此房间。
        </div>
      )}
    </div>
  );
}

function CampusScene({
  role,
  highlights,
  selected,
  liftedBuilding,
  walkMode,
  onSelect,
  onRoomSelect,
  selectedRoom,
  showRoute,
  routeNodeIds,
  routeIndoorPoints,
  showLabels,
  weather,
  showRooms,
}) {
  const route = useMemo(() => {
    if (!showRoute) return [];
    const ids = routeNodeIds?.length
      ? routeNodeIds
      : [
          "gate",
          "south",
          "axisSouth",
          "axisMid",
          "plazaSouth",
          "centralWest",
          "plazaNorth",
          "libraryWest",
          "north",
        ];
    const points = [];
    for (let index = 0; index < ids.length - 1; index += 1) {
      const from = ids[index];
      const to = ids[index + 1];
      const edge = ACTIVE_ROAD_EDGES.find(
        (item) =>
          (item.from === from && item.to === to) ||
          (item.from === to && item.to === from),
      );
      if (!edge) continue;
      const geometry =
        edge.from === from ? edge.geometry : [...edge.geometry].reverse();
      geometry.forEach((point, pointIndex) => {
        if (index > 0 && pointIndex === 0) return;
        points.push([point[0], 0.48, point[2]]);
      });
    }
    for (const indoorPoint of routeIndoorPoints || []) {
      points.push([indoorPoint[0], indoorPoint[1], indoorPoint[2]]);
    }
    return points;
  }, [showRoute, routeNodeIds, routeIndoorPoints]);
  return (
    <>
      <color attach="background" args={["#07131f"]} />
      <fog
        attach="fog"
        args={[
          "#07131f",
          weather === "fog" ? 90 : 330,
          weather === "fog" ? 360 : 920,
        ]}
      />
      <ambientLight
        intensity={weather === "rain" ? 0.9 : 1.4}
        color={weather === "rain" ? "#8fa6b8" : "#cde3e1"}
      />
      <hemisphereLight intensity={0.78} color="#dceae5" groundColor="#324437" />
      <directionalLight
        position={[-180, 260, 130]}
        intensity={weather === "rain" ? 1.25 : 2.4}
        color={weather === "rain" ? "#a8c4d7" : "#ffe6bd"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-290}
        shadow-camera-right={290}
        shadow-camera-top={240}
        shadow-camera-bottom={-240}
      />
      <ModelErrorBoundary
        fallback={
          <FallbackCampus
            highlights={highlights}
            selected={selected}
            onSelect={onSelect}
            role={role}
          />
        }
      >
        <Suspense
          fallback={
            <Html center>
              <div className="model-loading">
                <span />
                正在载入 Blender 校园资产
              </div>
            </Html>
          }
        >
          <CampusModel
            highlights={highlights}
            selected={selected}
            liftedBuilding={liftedBuilding}
            interactive={!walkMode}
            onSelect={onSelect}
            onRoomSelect={onRoomSelect}
            selectedRoom={selectedRoom}
            showRooms={showRooms}
          />
        </Suspense>
      </ModelErrorBoundary>
      {liftedBuilding && selected?.id === liftedBuilding && showRooms && (
        <BuildingInterior
          building={selected}
          highlights={highlights}
          selectedRoom={selectedRoom}
          onRoomSelect={onRoomSelect}
        />
      )}
      <RoomHighlightMarkers
        highlights={highlights}
        liftedBuilding={liftedBuilding}
      />
      {showLabels && (
        <CampusBuildingLabels highlighted={selected} onSelect={onSelect} />
      )}
      <group>
        {route.length > 1 && (
          <Line points={route} color={COLORS.route} lineWidth={3.4} />
        )}
        {route.length > 1 &&
          route.map((point, i) => (
            <mesh key={`route-${i}`} position={point}>
              <sphereGeometry args={[0.48, 12, 12]} />
              {mat(COLORS.route, 0.55, 0.2)}
            </mesh>
          ))}
      </group>
      {weather === "rain" && <Rain />}
      {weather === "fog" && (
        <mesh position={[0, 32, 0]}>
          <sphereGeometry args={[115, 32, 32]} />
          <meshBasicMaterial color="#b8c9cc" transparent opacity={0.08} />
        </mesh>
      )}
    </>
  );
}

function Rain() {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.03;
      ref.current.position.y = Math.sin(performance.now() / 950) * 1.2;
    }
  });
  const drops = useMemo(
    () =>
      Array.from({ length: 360 }, (_, i) => [
        ((i * 37) % 500) - 250,
        ((i * 23) % 52) + 8,
        ((i * 31) % 390) - 195,
      ]),
    [],
  );
  return (
    <group ref={ref}>
      {drops.map((p, i) => (
        <mesh key={i} position={p} rotation={[0.18, 0, 0.15]}>
          <cylinderGeometry args={[0.025, 0.025, 1.7, 5]} />
          {mat("#79bfd0", 0.2, 0.2)}
        </mesh>
      ))}
    </group>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("student");
  const [selected, setSelected] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [query, setQuery] = useState("");
  const [showRoute, setShowRoute] = useState(true);
  const [weather, setWeather] = useState("clear");
  const [activeTab, setActiveTab] = useState("overview");
  const [walkMode, setWalkMode] = useState(false);
  const spawn = campusLayout.coordinate_system.spawn || [0, 0.95, -188];
  const [player, setPlayer] = useState({
    x: spawn[0],
    y: spawn[1],
    z: spawn[2],
    running: false,
  });
  const [routeNodeIds, setRouteNodeIds] = useState([]);
  const [routeInfo, setRouteInfo] = useState({
    distance_m: 0,
    walking_minutes: 0,
  });
  const [routeStops, setRouteStops] = useState([]);
  const [queryHighlights, setQueryHighlights] = useState([]);
  const [roomHighlights, setRoomHighlights] = useState({});
  const [roomMembers, setRoomMembers] = useState(null);
  const [queryRoom, setQueryRoom] = useState(null);
  const [messages, setMessages] = useState([
    {
      from: "ai",
      text: "已载入 2026 秋季学期校园数据。你可以问我课程位置、宿舍或行走路线。",
    },
  ]);
  const highlights = useMemo(() => {
    const merged = {};
    for (const [roomCode, directive] of Object.entries(roomHighlights)) {
      merged[roomCode] = {
        color: directive.color || COLORS.selected,
        label: directive.label || "房间命中",
      };
    }
    return merged;
  }, [roomHighlights]);

  async function submitQuery(value = query) {
    const text = value.trim();
    if (!text) return;
    setQuery("");
    setMessages((m) => [...m, { from: "user", text }]);
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ query: text, origin: "gate" }),
      });
      if (!response.ok) throw new Error("查询服务暂不可用");
      const payload = await response.json();
      setMessages((m) => [...m, { from: "ai", text: payload.answer }]);
      setQueryHighlights(payload.highlight || []);
      setRoomHighlights(
        Object.fromEntries(
          (payload.room_highlight || []).map((item) => [
            item.room_code,
            {
              color: COLORS[item.color] || item.color || COLORS.selected,
              label: item.label || item.course || "房间命中",
            },
          ]),
        ),
      );
      const isRoute =
        payload.intent === "route" || payload.intent === "schedule_route";
      setRouteNodeIds(isRoute ? payload.route?.nodes || [] : []);
      if (isRoute && payload.route) setRouteInfo(payload.route);
      else setRouteInfo({ distance_m: 0, walking_minutes: 0 });
      setRouteStops(isRoute ? payload.stops || [] : []);
      setShowRoute(isRoute);
      if (payload.highlight?.[0]) {
        const building =
          PHOTO_BUILDINGS.find((b) => b.id === payload.highlight[0]) || null;
        if (building) handleSelectBuilding(building);
      }
      if (payload.intent === "dormitory" && payload.dorm_members) {
        const dormCode =
          payload.dorm_room || payload.room_highlight?.[0]?.room_code;
        const dormRecord = ROOM_RECORDS.find(
          (room) => room.room_code === dormCode,
        );
        if (dormRecord) setQueryRoom(dormRecord);
        setRoomMembers({
          room_code: dormCode,
          members: payload.dorm_members,
        });
      }
    } catch (reason) {
      setMessages((m) => [...m, { from: "ai", text: reason.message }]);
    }
  }

  function handleSelectBuilding(building) {
    if (!building) {
      if (activeTab === "rooms" && selected) {
        setActiveTab("overview");
        resetSelection();
      }
      return;
    }
    if (selected?.id === building.id && activeTab === "rooms") {
      setActiveTab("overview");
      return;
    }
    setWalkMode(false);
    setSelected(building);
    setSelectedRoom(null);
    setQueryRoom(null);
    setRoomMembers(null);
    setActiveTab("rooms");
  }

  async function handleRoomSelect(room) {
    if (!room) {
      setSelectedRoom(null);
      setQueryRoom(null);
      setRoomMembers(null);
      return;
    }
    setSelectedRoom(room);
    setQueryRoom(null);
    setRoomMembers(null);
    const isDormitory =
      room.room_type === "DOR" || /宿舍/.test(room.semantic_name);
    if (isDormitory) {
      try {
        const response = await fetch(
          `/api/dorm/room?room_code=${encodeURIComponent(room.room_code)}`,
          { headers: { Authorization: `Bearer ${user.token}` } },
        );
        if (response.ok) setRoomMembers(await response.json());
      } catch (reason) {
        console.error("宿舍信息加载失败", reason);
      }
    }
  }

  function resetSelection() {
    setSelected(null);
    setSelectedRoom(null);
    setQueryRoom(null);
    setRoomMembers(null);
  }

  const selectedHighlight = selected ? highlights[selected.id] : null;
  async function loadSessionHighlights(nextUser) {
    setUser(nextUser);
    setRole(nextUser.role);
    setSelected(null);
    setSelectedRoom(null);
    setQueryRoom(null);
    setRoomMembers(null);
    setQueryHighlights([]);
    setRoomHighlights({});
    try {
      const response = await fetch("/api/session/highlights", {
        headers: { Authorization: `Bearer ${nextUser.token}` },
      });
      if (!response.ok) return;
      const payload = await response.json();
      setQueryHighlights(payload.highlight || []);
      setRoomHighlights(
        Object.fromEntries(
          (payload.room_highlight || []).map((item) => [
            item.room_code,
            {
              color: COLORS[item.color] || item.color || COLORS.dorm,
              label: item.label || "宿舍高亮",
            },
          ]),
        ),
      );
    } catch (reason) {
      console.error("登录默认高亮加载失败", reason);
    }
  }
  if (!user) return <LoginScreen onLogin={loadSessionHighlights} />;
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Layers3 size={18} />
          </div>
          <div>
            <div className="brand-kicker">YUEYANG COLLEGE / DIGITAL TWIN</div>
            <div className="brand-title">岳阳学院 · 智慧校园</div>
          </div>
        </div>
        <div className="top-status">
          <span className="live-dot" /> LIVE · 数据流已连接{" "}
          <span className="divider" />{" "}
          <span className="mono">
            {new Date().toLocaleDateString("zh-CN")} /{" "}
            {new Date().toLocaleDateString("zh-CN", { weekday: "long" })}
          </span>
        </div>
        <div className="top-actions">
          <button
            className="icon-button"
            aria-label="退出登录"
            title="退出登录"
            onClick={() => {
              localStorage.removeItem("campus_token");
              setUser(null);
            }}
          >
            <LogOut size={18} />
          </button>
          <button className="profile-button">
            <span className="avatar">{user.display_name.slice(0, 1)}</span>
            <span>
              <b>{user.display_name}</b>
              <small>
                {role === "counselor"
                  ? "辅导员"
                  : role === "admin"
                    ? "系统管理员"
                    : role === "teacher"
                      ? `教师 · ${user.class_name}`
                      : `学生 · ${user.class_name}`}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </header>
      <div className="announcement">
        <Bell size={15} />
        <span className="announcement-tag">校园公告</span>
        <span>
          数字孪生校园已更新：建筑模型、室外避障路网与房间空间锚点现已同步。
        </span>
        <span className="announcement-link">
          查看全部 <ArrowUpRight size={13} />
        </span>
      </div>
      <main className="main-layout">
        <aside className="left-rail">
          <section className="panel role-panel">
            <div className="panel-heading">
              <span>当前视图</span>
              <span className="tiny-label">ROLE VIEW</span>
            </div>
            <div className="role-switcher">
              {[
                ["student", "学生", UserRound],
                ["teacher", "教师", BookOpen],
                ["counselor", "辅导员", UsersRound],
                ["admin", "管理员", Settings2],
              ].map(([value, label, Icon]) => (
                <button
                  key={value}
                  disabled={user.role !== "admin" && value !== user.role}
                  className={role === value ? "role-chip active" : "role-chip"}
                  onClick={() => user.role === "admin" && setRole(value)}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="role-note">
              <Sparkles size={14} />
              <span>
                {role === "counselor"
                  ? "已叠加所管班级与宿舍高亮"
                  : role === "teacher"
                    ? "已叠加所授班级课程教室高亮"
                    : role === "admin"
                      ? "可编辑空间锚点与路网节点"
                      : "已叠加今日课程空间高亮"}
              </span>
            </div>
          </section>
          <section className="panel query-panel">
            <div className="panel-heading">
              <div className="heading-with-icon">
                <Bot size={16} /> 时空问答
              </div>
              <span className="status-pill">
                <span className="live-dot" /> RAG READY
              </span>
            </div>
            <div className="chat-list">
              {messages.slice(-4).map((message, i) => (
                <div key={i} className={`chat-message ${message.from}`}>
                  {message.from === "ai" && (
                    <div className="chat-icon">
                      <Bot size={13} />
                    </div>
                  )}
                  <div className="chat-bubble">{message.text}</div>
                </div>
              ))}
            </div>
            <div className="query-input">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitQuery()}
                placeholder="问：明天第一节课在哪？"
              />
              <button onClick={() => submitQuery()} aria-label="发送">
                <Send size={15} />
              </button>
            </div>
            <div className="suggestions">
              {[
                "明天第一节课在哪？",
                "从宿舍到明天上午所有教室怎么走？",
                "到2号教学楼怎么走？",
                "到图书馆怎么走？",
                "第3大节几点下课？",
                "张宇住哪间宿舍？",
              ].map((question) => (
                <button key={question} onClick={() => submitQuery(question)}>
                  {question}
                </button>
              ))}
            </div>
          </section>
          <section className="panel data-panel">
            <div className="panel-heading">
              <div className="heading-with-icon">
                <Database size={16} /> 空间数据
              </div>
              <span className="tiny-label">SYNCED 1.2s</span>
            </div>
            <div className="data-grid">
              <div>
                <span>建筑单元</span>
                <b>21</b>
              </div>
              <div>
                <span>房间锚点</span>
                <b>630</b>
              </div>
              <div>
                <span>路网节点</span>
                <b>48</b>
              </div>
              <div>
                <span>参考视角</span>
                <b>16</b>
              </div>
            </div>
            <div className="data-bar">
              <span style={{ width: "86%" }} />
            </div>
            <div className="data-caption">
              <span>可确认区域覆盖</span>
              <b>86%</b>
            </div>
          </section>
        </aside>
        <section className="viewport-wrap">
          <div className="viewport-toolbar">
            <div className="toolbar-group">
              <button
                className={
                  activeTab === "overview" && !walkMode
                    ? "tool-button active"
                    : "tool-button"
                }
                onClick={() => {
                  setWalkMode(false);
                  setActiveTab("overview");
                }}
              >
                <Compass size={15} /> 总览
              </button>
              <button
                className={walkMode ? "tool-button active" : "tool-button"}
                onClick={() => {
                  if (!walkMode) {
                    resetSelection();
                    setActiveTab("overview");
                  }
                  setWalkMode(!walkMode);
                }}
              >
                <Gamepad2 size={15} /> 校园漫游
              </button>
              <button
                className={
                  activeTab === "route" ? "tool-button active" : "tool-button"
                }
                onClick={() => {
                  setActiveTab("route");
                  setShowRoute(true);
                }}
              >
                <Route size={15} /> 路径
              </button>
              <button
                className={
                  activeTab === "rooms" ? "tool-button active" : "tool-button"
                }
                onClick={() => {
                  setActiveTab("rooms");
                  setWalkMode(false);
                }}
              >
                <Boxes size={15} /> 房间 LOD2
              </button>
            </div>
            <div className="toolbar-group">
              <button
                className="tool-button"
                onClick={() =>
                  setWeather(
                    weather === "clear"
                      ? "rain"
                      : weather === "rain"
                        ? "fog"
                        : "clear",
                  )
                }
              >
                <CloudSun size={15} />{" "}
                {weather === "clear"
                  ? "晴"
                  : weather === "rain"
                    ? "小雨"
                    : "薄雾"}
              </button>
              <button
                className="icon-button dark"
                onClick={resetSelection}
                aria-label="重置选中"
              >
                <Crosshair size={16} />
              </button>
            </div>
          </div>
          <div className="canvas-frame">
            <CanvasErrorBoundary
              fallback={({ error, retry }) => (
                <CanvasFallback error={error} retry={retry} />
              )}
            >
              <Canvas
                shadows
                dpr={[1, 1.35]}
                gl={{ antialias: true, powerPreference: "high-performance" }}
                camera={{ far: 3200 }}
              >
                <PerspectiveCamera
                  makeDefault
                  position={[325, 285, -420]}
                  fov={walkMode ? 66 : 48}
                  far={3200}
                />
                {!walkMode && (
                  <OverviewControls
                    focusBuilding={activeTab === "rooms" ? selected : null}
                    enabled
                  />
                )}
                {walkMode && (
                  <Suspense
                    fallback={
                      <Html center>
                        <div className="model-loading">
                          <span />
                          正在准备漫游物理引擎
                        </div>
                      </Html>
                    }
                  >
                    <WalkPhysics
                      buildings={PHOTO_BUILDINGS}
                      onPosition={setPlayer}
                    />
                  </Suspense>
                )}
                <CampusScene
                  role={role}
                  highlights={highlights}
                  selected={selected}
                  liftedBuilding={
                    selected && activeTab === "rooms" ? selected.id : null
                  }
                  walkMode={walkMode}
                  onSelect={handleSelectBuilding}
                  onRoomSelect={handleRoomSelect}
                  selectedRoom={selectedRoom}
                  showRoute={showRoute}
                  routeNodeIds={routeNodeIds}
                  routeIndoorPoints={routeInfo.indoor_points || []}
                  showLabels={!walkMode}
                  weather={weather}
                  showRooms={activeTab === "rooms"}
                />
              </Canvas>
            </CanvasErrorBoundary>
            {walkMode && (
              <div className="walk-hud">
                <div className="crosshair">+</div>
                <div className="walk-help">
                  <Gamepad2 size={15} />
                  <span>点击画面锁定视角</span>
                  <kbd>WASD</kbd> 行走 <kbd>Shift</kbd> 跑步 <kbd>Space</kbd>{" "}
                  跳跃
                </div>
                <div className="walk-speed">
                  {player.running ? "RUN" : "WALK"} · {Math.round(player.x)},{" "}
                  {Math.round(player.z)}
                </div>
              </div>
            )}
            {!walkMode && (
              <div className="camera-hint">
                按住左键旋转视角 · 按住右键移动画面 · 滚轮缩放 ·
                点击楼栋切换中心
              </div>
            )}
            <div className="viewport-hud">
              <div className="hud-title">
                <span className="eyebrow">LIVE CAMPUS MODEL</span>
                <b>岳阳学院 · Blender 5.1 数字孪生</b>
                <small>
                  公开规划约束 + 16 张沙盘多视角估算 / 米制坐标 / 非测绘成果
                </small>
              </div>
              <div
                className="compass-hud"
                title="模型方向：地图下方为南校门，上方为北区"
              >
                <span className="compass-n">N</span>
                <span className="compass-line" />
                <span className="compass-s">S</span>
              </div>
              <div className="hud-readout">
                <span>
                  <Activity size={13} /> GLB LIVE
                </span>
                <span>
                  <Zap size={13} />{" "}
                  {walkMode ? "实时物理碰撞" : "漫游时加载物理引擎"}
                </span>
              </div>
            </div>
            {selected && (
              <div className="selected-card">
                <div className="selected-card-top">
                  <div>
                    <span className="eyebrow">
                      SELECTED BUILDING / {selected.id}
                    </span>
                    <h3>{selected.name}</h3>
                  </div>
                  <button
                    className="icon-button dark"
                    onClick={resetSelection}
                    aria-label="关闭"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="selected-stats">
                  <span>
                    <Building2 size={14} /> {selected.floors} 层 / 约{" "}
                    {selected.w}×{selected.d}m
                  </span>
                  <span>
                    <MapPin size={14} /> LOD1 + LOD2
                  </span>
                </div>
                {selectedHighlight && (
                  <div
                    className="selected-detail"
                    style={{ "--accent": selectedHighlight.color }}
                  >
                    <span className="detail-dot" />
                    {selectedHighlight.resident || selectedHighlight.course}
                    <b>{selectedHighlight.time || selectedHighlight.phone}</b>
                  </div>
                )}
                <button
                  className="fly-button"
                  onClick={() => setActiveTab("rooms")}
                >
                  <Navigation size={14} /> 查看空间锚点与房间
                </button>
              </div>
            )}
            {(selectedRoom || queryRoom) && (
              <RoomInfoCard
                room={selectedRoom || queryRoom}
                members={roomMembers}
                role={role}
              />
            )}
          </div>
          <div className="map-legend">
            <div className="legend-title">
              高亮图例 <span>SPATIO-TEMPORAL</span>
            </div>
            <div className="legend-items">
              <span>
                <i style={{ background: COLORS.morning }} />
                上午课程
              </span>
              <span>
                <i style={{ background: COLORS.afternoon }} />
                下午课程
              </span>
              <span>
                <i style={{ background: COLORS.next }} />
                次日课程
              </span>
              <span>
                <i style={{ background: COLORS.dorm }} />
                宿舍
              </span>
              <span>
                <i style={{ background: COLORS.route }} />
                路径经过
              </span>
            </div>
          </div>
          {role === "admin" && selected && (
            <AdminAnchorEditor
              selected={selected}
              selectedRoom={selectedRoom}
              token={user.token}
            />
          )}
        </section>
        <aside className="right-rail">
          <section className="panel weather-panel">
            <div className="panel-heading">
              <div className="heading-with-icon">
                <SunMedium size={16} /> 岳阳 · 场景环境
              </div>
              <span className="tiny-label">实时渲染</span>
            </div>
            <div className="weather-main">
              <div>
                <b>26°</b>
                <span>体感 27° · 东南风 2 级</span>
              </div>
              <CloudSun size={40} strokeWidth={1.2} />
            </div>
            <div className="weather-metrics">
              <span>
                湿度 <b>68%</b>
              </span>
              <span>
                能见度 <b>{weather === "fog" ? "1.8" : "8.6"}km</b>
              </span>
              <span>
                空气 <b className="good">优</b>
              </span>
            </div>
          </section>
          <section className="panel route-panel">
            <div className="panel-heading">
              <div className="heading-with-icon">
                <Footprints size={16} /> 推荐路径
              </div>
              <button
                className={showRoute ? "toggle active" : "toggle"}
                onClick={() => setShowRoute(!showRoute)}
              >
                <span />
              </button>
            </div>
            <div className="route-summary">
              <div className="route-time">
                <b>
                  {routeNodeIds.length
                    ? String(routeInfo.walking_minutes || 0).padStart(2, "0")
                    : "--"}
                </b>
                <span>分钟</span>
              </div>
              <div>
                <span className="route-title">
                  {routeStops.length
                    ? `${routeStops[0]?.label || "起点"} → ${
                        routeStops[routeStops.length - 1]?.label || "终点"
                      }`
                    : "暂无规划路径"}
                </span>
                <span className="route-meta">
                  {routeInfo.distance_m
                    ? `${routeInfo.distance_m} m`
                    : "请在左侧发起路线问答"}{" "}
                  {routeNodeIds.length
                    ? `· ${routeNodeIds.length} 个节点 · 室外路网`
                    : ""}
                </span>
              </div>
            </div>
            <div className="route-list">
              {routeStops.length === 0 ? (
                <div className="route-empty">暂时没有需要展示的路径段。</div>
              ) : (
                routeStops.map((stop, index, all) => (
                  <div className="route-step" key={`${stop.label}-${index}`}>
                    <span
                      className={`route-node ${
                        index === 0
                          ? "start"
                          : index === all.length - 1
                            ? "end"
                            : ""
                      }`}
                    />
                    <div>
                      <b>{stop.label}</b>
                      <small>{stop.reason}</small>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              className="route-action"
              onClick={() => setShowRoute(!showRoute)}
            >
              {showRoute ? "隐藏路径图层" : "显示路径图层"}{" "}
              <ArrowUpRight size={14} />
            </button>
          </section>
          <section className="panel lod-panel">
            <div className="panel-heading">
              <div className="heading-with-icon">
                <Building2 size={16} /> 建筑详情
              </div>
              <span className="tiny-label">LOD STATUS</span>
            </div>
            <div className="lod-list">
              {[
                ["LOD0", "校园整体", "已加载", "ok"],
                ["LOD1", "建筑外壳 / 楼层", "已加载", "ok"],
                [
                  "LOD2",
                  "房间单元 / 路径",
                  activeTab === "rooms" ? "查看中" : "按需加载",
                  activeTab === "rooms" ? "hot" : "idle",
                ],
                ["LOD3", "房间内部细节", "演示数据", "idle"],
              ].map(([code, name, status, state]) => (
                <div className="lod-row" key={code}>
                  <span className="lod-code">{code}</span>
                  <span>{name}</span>
                  <span className={`lod-status ${state}`}>
                    <i />
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel reference-panel">
            <div className="panel-heading">
              <div className="heading-with-icon">
                <Info size={16} /> 实景参考
              </div>
              <span className="tiny-label">16 个视角</span>
            </div>
            <div className="reference-grid">
              <img src="/assets/photo-overview.jpg" alt="校园沙盘航拍参考" />
              <img src="/assets/photo-sports.jpg" alt="校园运动场参考" />
            </div>
            <span className="reference-note">
              照片反推数据为多视角估算，不标作官方实测值
            </span>
          </section>
        </aside>
      </main>
      <footer className="footer">
        <span>© 2026 岳阳学院智慧校园数字孪生系统</span>
        <span className="footer-center">
          <span className="live-dot" /> 3D Engine Online · WebGL 2.0
        </span>
        <span className="footer-right">
          <span>ROOM ANCHOR SYNC</span>
          <span className="mono">v0.1.0-demo</span>
        </span>
      </footer>
    </div>
  );
}

export default App;
