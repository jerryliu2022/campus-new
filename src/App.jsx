import React, {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
import { campusBadgeOf, buildingBadge, labelOffsetOf } from "./labels";

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
  origin: "#ff8a5c",
  route: "#f5cf64",
  selected: "#ff6464",
};
// 课表多段路径的逐段颜色：第1段黄、第2段粉红、第3段青、第4段黄绿。
// 刻意避开房间高亮用的蓝/橙/紫/绿/红，段与段在教学楼最近门处衔接时一眼能分开。
const ROUTE_LEG_COLORS = ["#f5cf64", "#ff5ec4", "#3fd8d0", "#a4ff5e"];
// 弹起的垂直位移 = 楼栋自身高度（h），即「楼往上升一栋楼的高度」。
// 原来是一个固定 30m 常量：矮楼（10m）会飞得过高、高楼（45m）又和自身分不开。
const BUILDING_LIFT = Object.fromEntries(
  (campusLayout.buildings || []).map((building) => [
    building.id,
    building.h || 20,
  ]),
);
const liftOf = (code) => BUILDING_LIFT[code] ?? 20;
// 多视角沙盘校准后的布局是前端与 Blender 共用的唯一建筑坐标源。
const PHOTO_BUILDINGS = campusLayout.buildings;
// 用户可见「建筑标号」统一用真实楼号 —— campusBadgeOf / buildingBadge / roomFriendly 见 src/labels.js。
const ROOM_RECORDS = roomAnchors.rooms || [];
const ACTIVE_ROAD_NODES =
  roadGraph.nodes?.map((node) => [
    node.id,
    node.position[0],
    node.position[2],
    node.label,
  ]) || ROAD_NODES;
const ACTIVE_ROAD_EDGES = roadGraph.edges || ROAD_EDGES;

// 把一串路网节点 id 展开成折线点：查相邻节点对的边、复用道路几何（含方向翻转）。
// 单条完整路径和多段路径的每一段都用它展开，保证视觉上完全一致。
function pathPointsFromIds(ids) {
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
  return points;
}

function mat(color, metalness = 0.05, roughness = 0.65) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
    />
  );
}

// 材质动画里每帧都要拿到目标色的 Color 实例。
// 原来每帧对每个材质 new THREE.Color(...)（约 1900 次/帧），
// 直接在帧循环里制造大量短命对象，GC 抖动明显；这里按色值复用同一实例。
const COLOR_CACHE = new Map();
function colorOf(value) {
  let cached = COLOR_CACHE.get(value);
  if (!cached) {
    cached = new THREE.Color(value);
    COLOR_CACHE.set(value, cached);
  }
  return cached;
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
        <Html
          position={[...labelOffsetOf(building), building.h + 2.5]}
          center
          distanceFactor={18}
        >
          <div className="scene-label">
            <span>{campusBadgeOf(building)}</span>
            {building.name}
          </div>
        </Html>
      )}
      <Text
        position={[...labelOffsetOf(building), building.h + 1.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={1.25}
        color={highlighted ? highlighted.color : "#d8e9e7"}
        anchorX="center"
        anchorY="middle"
      >
        {campusBadgeOf(building)}
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

const ROOM_FLOOR_H = 4.2; // 层高（米），与 campus_program.py 一致
const ROOM_FLOOR_GAP = 5.0; // 弹起后逐层分离的间隙，便于查看每层房间

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
  const floors = useMemo(
    () => [...new Set(rooms.map((room) => room.floor))].sort((a, b) => a - b),
    [rooms],
  );
  if (!rooms.length) return null;

  const floorY = (f) => (f - 1) * (ROOM_FLOOR_H + ROOM_FLOOR_GAP);
  // 房间盒用 room_anchors 的真实世界坐标减去楼栋中心，得到楼栋局部坐标；
  // 弧形楼（1#/2#教学综合楼）的锚点本就落在环带上，无需额外换算。
  const localOf = (room) => {
    const [x, , z] = room.anchor_world;
    const bmin = room.bbox_min || [x - 2, 0, z - 1.5];
    const bmax = room.bbox_max || [x + 2, 0, z + 1.5];
    return {
      x: x - building.x,
      z: z - building.z,
      w: Math.max(1.1, Math.abs(bmax[0] - bmin[0])),
      d: Math.max(1.1, Math.abs(bmax[2] - bmin[2])),
      rotY: room.orientation?.[1] || 0,
    };
  };

  return (
    // 弹起高度 = 楼栋自身高度：楼层剖面整体抬到「原楼顶再高一栋楼」的位置。
    <group position={[building.x, building.h, building.z]}>
      {floors.map((floor) => (
        <group key={`floor-${floor}`} position={[0, floorY(floor), 0]}>
          {/* 层间不再铺楼层板：板会把下面的教室挡住。只留楼层号牌标示分层。 */}
          <Html
            position={[-building.w / 2 - 6, ROOM_FLOOR_H / 2, 0]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div className="floor-tag">{floor}F</div>
          </Html>
        </group>
      ))}
      {rooms.map((room) => {
        const { x: lx, z: lz, w, d, rotY } = localOf(room);
        const active = selectedRoom?.room_code === room.room_code;
        const highlight = highlights[room.room_code];
        const color = active
          ? COLORS.selected
          : highlight?.color || building.accent;
        const number = String(room.room_code).split("_").pop();
        const label = `F${room.floor}·${number}室`;
        return (
          <group
            key={room.room_code}
            position={[
              lx,
              floorY(room.floor) + ROOM_FLOOR_H / 2,
              lz,
            ]}
            rotation={[0, rotY, 0]}
          >
            <mesh
              castShadow
              receiveShadow
              userData={{ roomCode: room.room_code }}
              onClick={(event) => {
                event.stopPropagation();
                // 与楼栋外壳同一套判定：拖动视角松手不算点击，否则拨一下鼠标
                // 就会把松手处那间教室「选中」。
                if ((event.delta ?? 0) > 4) return;
                onRoomSelect(room);
              }}
            >
              <boxGeometry args={[w, ROOM_FLOOR_H - 1.4, d]} />
              {/* 房间单元统一半透明：隔板去掉后，视线能穿过前排房间，
                  直接看到（高亮/点中的）目标教室；越重点的房间越实。 */}
              <meshStandardMaterial
                color={color}
                metalness={active ? 0.22 : 0.05}
                roughness={active ? 0.28 : 0.6}
                transparent
                opacity={active ? 1 : highlight ? 1 : 0.85}
              />
            </mesh>
            {/* 弹起后默认不挂牌：一栋楼 100 个气泡会糊成一片。
                只给「被高亮的教室」和「鼠标点中的教室」挂标签，其余靠点选查看。 */}
            {(highlight || active) && (
              <Html
                position={[0, (ROOM_FLOOR_H - 1.4) / 2 + 0.45, 0]}
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
                  {label}
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
  const invalidate = useThree((state) => state.invalidate);
  // 一次性预处理：克隆场景、建索引、按「楼栋 + 原材质」共享材质实例。
  // 返回 buildingMeshes 后，帧循环只遍历 27 个建筑外壳（每栋合并成 1 个多材质 Mesh），
  // 不再每帧 scene.traverse() 整棵场景树。
  const { scene, buildingMeshes, roomMeshes } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    // 北侧生态湖原 bbox x[142,207] z[125,171]，压住了北环路(z=160)与宿舍区中街
    // (x=154.5)。规划定稿（用户确认）：湖缩小到 0.68 并平移进 Ve2/Ve3/Hz12/Hz18
    // 围合的街区内 —— 新湖面 x[161.9,206.1] z[119.9,151.1]，距四条路缘均 ≥4.8m；
    // 山林地形（z≥165）保持在路网之外不动。
    // 缩放绕原点：p' = 0.68·p + t，t = 目标中心 - 0.68·原中心 = (65.34, 34.86)。
    // 必须在世界矩阵烘焙（updateMatrixWorld）前设置，否则会被静态合批烘焙掉。
    cloned.traverse((object) => {
      if (object.isMesh && object.name === "北侧生态湖") {
        object.scale.set(0.68, 1, 0.68);
        object.position.set(65.34, 0, 34.86);
      }
      if (object.isMesh && object.name && object.name.startsWith("主轴景观岛")) {
        object.position.y -= 0.09;
      }
    });
    // 实例化合并需要用到各节点的最终局部矩阵，先把整棵树的矩阵算好。
    cloned.updateMatrixWorld(true);
    // 规划变更（B07/B17 拆除 + 路网重构）只改了数据层，GLB 是静态资产：
    // 这里按名字剔除两栋已拆建筑的网格和整批旧路面网格（ROAD_*），
    // 新路面由 <GroundRoads> 按 road_graph.json 程序化重建，保证与寻路一致。
    const removed = [];
    const buildings = [];
    const rooms = [];
    const materialPool = new Map();
    // 「同一几何体 + 同一材质 + 同一父节点」反复出现的装饰物（树木 606 个、
    // 运动场标线 14 个）先收集，traverse 结束后合并成 InstancedMesh。
    // 这是每帧 draw call 的最大头：606 个树 mesh → 4 个实例化批次。
    const buckets = new Map();
    // 几何体各不相同（长度/形状都不一样）因此无法实例化的静态摆件
    // （道路 450 个、广场、水池、围栏……）也收集起来，之后按材质做几何合批。
    const statics = [];

    cloned.traverse((object) => {
      if (!object.isMesh) return;
      const name = object.name || "";
      const buildingMatch = name.match(/^(B\d+)_/);
      const code = buildingMatch ? buildingMatch[1] : null;

      // 已拆除建筑（B07/B17/B10/B23）与整批旧路面网格直接摘除。旧路面（ROAD_*、
      // ROAD_MARK_*、BOUNDARY_ROAD_*、NODE_*）和新 <GroundRoads> 高度重叠，
      // 留在场景里会 z-fight 出闪烁；GLB 是静态资产，运行时剔除即可。
      // 「实验综合楼前广场」是 B23 的配套铺装，楼拆了广场一并摘除。
      if (
        code === "B07" ||
        code === "B17" ||
        code === "B10" ||
        code === "B23" ||
        name === "实验综合楼前广场" ||
        /^(ROAD_|BOUNDARY_ROAD_|NODE_)/.test(name)
      ) {
        removed.push(object);
        return;
      }
      // 规划调整（2026-09-21 第四轮，用户确认）：B08 会堂移到 (-156,66)
      // 与 11#食堂同轴；B16 宿舍移到 (-156,135) 与 7#实训B 同线。
      // GLB 外壳几何是世界坐标烘焙的（节点 position 为 0），直接在 mesh 上加平移量即可。
      if (code === "B08") {
        object.position.x -= 2; // -154 -> -156
        object.position.z -= 32; // 98 -> 66
      } else if (code === "B16") {
        object.position.x -= 48; // -108 -> -156
        object.position.z += 1; // 134 -> 135
      }
      // 会堂新footprint内的一棵行道树（TREE_298，-132,76），移走楼后正好卡在楼体里
      if (name.startsWith("TREE_298_")) {
        removed.push(object);
        return;
      }
      // 1#/2#教学综合楼（B06/B22 同心圆环，圆心 (0,70)、外半径 47.5、环带宽 31）：
      // 23 棵树（TREE_174~177、TREE_277~295）落在环带楼体内，平时被壳体罩住，
      // 弹起内剖后露在楼底下穿帮 —— 按环带半径剔除（保留内院 r<16.5 的树）。
      if (name.startsWith("TREE_")) {
        const ringR = Math.hypot(
          object.position.x,
          object.position.z - 70,
        );
        if (ringR > 16.5 && ringR < 47.5) {
          removed.push(object);
          return;
        }
      }

      // 兼容旧资产：早期 glb 会把 2720 个房间网格也导出来（纯冗余——运行时房间由
      // BuildingInterior 按 room_anchors 重建）。现在的生成器已不再导出它们，
      // 这里保留分支只为兼容旧模型，新模型走不到。
      if (/^B\d+_[A-Z]+_F\d+_\d+$/.test(name)) {
        object.userData.room_code = name;
        rooms.push(object);
        return;
      }
      if (code) object.userData.building_code = code;

      const hadMaterialArray = Array.isArray(object.material);
      const sourceMaterials = hadMaterialArray
        ? object.material
        : [object.material];
      const materials = sourceMaterials
        .map((item, index) => {
          if (!item || typeof item.clone !== "function") return null;
          // 同一栋楼共用同一份材质实例：
          // 材质数从「每个 mesh 各一份」（约 950 份）降到「每栋楼每种材质一份」（约 200 份），
          // 直接减少 uniform 刷新、program 切换与材质动画开销。
          const key = `${code || "static"}|${index}|${item.uuid}`;
          let shared = materialPool.get(key);
          if (!shared) {
            shared = item.clone();
            shared.userData.baseColor =
              shared.color?.clone?.() || new THREE.Color("#b7c0bb");
            shared.userData.baseEmissive =
              shared.emissive?.clone?.() || new THREE.Color("#000000");
            shared.userData.baseOpacity = Number.isFinite(shared.opacity)
              ? shared.opacity
              : 1;
            materialPool.set(key, shared);
          }
          return shared;
        })
        .filter(Boolean);
      if (!materials.length)
        materials.push(
          new THREE.MeshStandardMaterial({ color: "#b7c0bb", roughness: 0.72 }),
        );
      object.material = hadMaterialArray ? materials : materials[0];
      object.userData.baseY = object.position.y;
      object.castShadow = true;
      object.receiveShadow = true;
      if (code) {
        buildings.push(object);
      } else {
        const geometry = object.geometry;
        const material = hadMaterialArray
          ? object.material[0]
          : object.material;
        if (geometry && material) {
          statics.push(object);
          const key = `${geometry.uuid}|${material.uuid}|${object.parent?.uuid || "root"}`;
          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = {
              geometry,
              material,
              parent: object.parent,
              list: [],
            };
            buckets.set(key, bucket);
          }
          bucket.list.push(object);
        }
      }
    });

    // 遍历结束后统一摘除已拆除建筑与旧路面网格
    removed.forEach((object) => object.removeFromParent());

    // 合并实例化批次：阈值以下不值得（收益抵不过维护成本），保持原样。
    for (const { geometry, material, parent, list } of buckets.values()) {
      if (!parent || list.length < 6) continue;
      const batch = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((item, index) => {
        batch.setMatrixAt(index, item.matrix);
        item.removeFromParent();
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.castShadow = true;
      batch.receiveShadow = true;
      batch.name = `INSTANCED_x${list.length}`;
      // 树和标线本来就不参与点击（没有 building_code），顺手关掉拾取，
      // 指针移动时 Raycaster 也不用再逐个遍历这几百个对象。
      batch.raycast = () => {};
      parent.add(batch);
    }

    // 几何合批：剩余静态摆件每个都是独立几何体（道路+标线 450 个是交互期
    // 每帧 draw call 的第二大头），但它们不参与拾取、不参与任何动画，
    // 把世界矩阵烘焙进几何体后按材质合并成极少数 Mesh。
    // 对象名/材质动画/阴影都无损；点击道路本就无行为，关掉拾取反而更快。
    const mergeGroups = new Map();
    for (const object of statics) {
      if (!object.parent) continue; // 已被实例化合并移除
      const material = Array.isArray(object.material)
        ? object.material[0]
        : object.material;
      if (!material || material.map) continue; // 带贴图的合并会丢 UV 语义，跳过
      const key = `${material.uuid}|${object.castShadow ? 1 : 0}|${
        object.receiveShadow ? 1 : 0
      }`;
      let group = mergeGroups.get(key);
      if (!group) {
        group = {
          material,
          castShadow: object.castShadow,
          receiveShadow: object.receiveShadow,
          geoms: [],
          objects: [],
        };
        mergeGroups.set(key, group);
      }
      const baked = object.geometry.clone().applyMatrix4(object.matrixWorld);
      // mergeGeometries 要求所有几何体属性集一致：统一只保留 position+normal。
      // 本场景静态材质都是纯色（tex=1 全场景），丢 UV 无影响。
      for (const name of Object.keys(baked.attributes)) {
        if (name !== "position" && name !== "normal") {
          baked.deleteAttribute(name);
        }
      }
      if (!baked.attributes.normal) baked.computeVertexNormals();
      group.geoms.push(baked);
      group.objects.push(object);
    }
    for (const group of mergeGroups.values()) {
      if (group.geoms.length < 4) continue; // 三两个的不值得折腾
      const merged = mergeGeometries(group.geoms, false);
      if (!merged) continue; // 索引/属性不一致时 three 返回 null，保持原样
      const batch = new THREE.Mesh(merged, group.material);
      batch.castShadow = group.castShadow;
      batch.receiveShadow = group.receiveShadow;
      batch.name = `MERGED_x${group.geoms.length}`;
      batch.raycast = () => {};
      cloned.add(batch);
      for (const object of group.objects) object.removeFromParent();
    }

    return { scene: cloned, buildingMeshes: buildings, roomMeshes: rooms };
  }, [gltf.scene]);

  // 房间模板网格彻底移出场景树：不再参与矩阵更新、包围盒计算与光栅化。
  useEffect(() => {
    roomMeshes.forEach((mesh) => mesh.removeFromParent());
  }, [roomMeshes]);

  // 弹起内剖时，该栋楼的外壳（外墙 + 窗户 + 屋顶 + 雨棚……已合并成同一个 Mesh）
  // 整体隐藏，露出内部房间；落回时整体恢复。
  // 用 ref 记住上一次的弹起目标：只依赖下面那个早退条件的话，「落回」那一帧
  // 会被直接 return 掉，外壳就再也恢复不了了。
  const liftedRef = useRef(null);

  useFrame((_, delta) => {
    const liftChanged = liftedRef.current !== liftedBuilding;
    let animating = false;
    // 常态（无高亮、无选中、未弹起、上一帧也没有待恢复的楼）直接早退。
    // 原实现无条件跑完整轮遍历，首页每次渲染都要过 9900+ 节点、重算 ~950 份材质，
    // 这是打开 3D 页 CPU 占用高、掉帧的主因。
    if (
      !liftChanged &&
      !selected &&
      !liftedBuilding &&
      !Object.keys(highlights).length
    )
      return;

    for (const object of buildingMeshes) {
      const code = object.userData.building_code;
      if (!code) continue;
      const isSelected = selected?.id === code;
      const isLifted = liftedBuilding === code;
      const highlight = highlights[code];

      // 外墙与窗户现在是同一个 Mesh —— 一个 visible 就让它们一起隐、一起现。
      // （原来是整栋调成 opacity 0.18 半透明，既要透明的 program 重编译、
      //   又仍参与光栅化，现在直接移出渲染。）
      const shellHidden = showRooms && (isLifted || code === liftedRef.current);
      const nextVisible = !shellHidden;
      if (object.visible !== nextVisible) object.visible = nextVisible;

      const targetY =
        object.userData.baseY +
        (isLifted
          ? liftOf(code)
          : isSelected
            ? 5.5
            : highlight
              ? 1.5
              : 0);
      if (
        Math.abs(object.position.y - targetY) > 0.0005 ||
        isSelected ||
        isLifted ||
        highlight
      ) {
        object.position.y = THREE.MathUtils.damp(
          object.position.y,
          targetY,
          5.5,
          delta,
        );
      }
      // demand 模式：升/降与变色都是自驱动画，没收敛就要把下一帧续上。
      if (Math.abs(object.position.y - targetY) > 0.0015) animating = true;

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const item of materials) {
        if (!item || !item.color) continue;
        const targetColor = isLifted ? null : highlight?.color;
        const baseColor = item.userData.baseColor || item.color;
        const colorTarget = targetColor ? colorOf(targetColor) : baseColor;
        if (!item.color.equals(colorTarget)) animating = true;
        item.color.lerp(colorTarget, Math.min(1, delta * 7));
        if (item.emissive) {
          const baseEmissive = item.userData.baseEmissive || item.emissive;
          const emissiveTarget = isLifted
            ? baseEmissive
            : targetColor
              ? colorOf(targetColor)
              : baseEmissive;
          if (!item.emissive.equals(emissiveTarget)) animating = true;
          item.emissive.lerp(emissiveTarget, Math.min(1, delta * 7));
          item.emissiveIntensity = isLifted ? 0 : targetColor ? 0.22 : 0;
        }
      }
    }
    liftedRef.current = liftedBuilding;
    if (animating) invalidate();
  });

  return (
    <primitive
      object={scene}
      onClick={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        // 转动视角（左键拖拽）时，Raycaster 会用「鼠标松开那一刻」的射线重新求交，
        // 于是松手位置压在哪栋楼上，就会被当成点中了哪栋楼 —— 这是「拨动鼠标误触
        // 其他建筑物」的根源。event.delta 是按下点到松手点的像素距离，超过阈值
        // 一律判定为拖拽视角，不当作点击。
        if ((event.delta ?? 0) > 4) return;
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

function CampusBuildingLabel({ building, onSelect, register }) {
  const labelRef = useRef();
  const anchor = useMemo(
    () => new THREE.Vector3(building.x, building.h + 4.2, building.z),
    [building.h, building.x, building.z],
  );
  // 帧循环统一由 CampusBuildingLabels 驱动，这里只负责把 DOM 节点登记进去
  useEffect(() => {
    register(building.id, labelRef.current, anchor);
    return () => register(building.id, null, null);
  }, [building.id, anchor, register]);
  return (
    <Html
      position={[
        building.x + labelOffsetOf(building)[0],
        building.h + 4.2,
        building.z + labelOffsetOf(building)[1],
      ]}
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
        <small>{campusBadgeOf(building)}</small>
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
  const camera = useThree((state) => state.camera);
  const entries = useRef(new Map());
  const frameCount = useRef(0);

  const register = useCallback((id, element, anchor) => {
    if (element) {
      entries.current.set(id, {
        el: element,
        anchor,
        opacity: null,
        pointer: null,
      });
    } else {
      entries.current.delete(id);
    }
  }, []);

  // 27 个楼栋标签原来各自跑一个 useFrame、并且每帧都写 DOM 样式（27 次/帧的样式抖动）。
  // 现在合并成一个帧回调，每 3 帧刷新一次，且值没变化就不碰 DOM。
  useFrame(() => {
    frameCount.current = (frameCount.current + 1) % 3;
    if (frameCount.current !== 0) return;
    for (const entry of entries.current.values()) {
      const distance = camera.position.distanceTo(entry.anchor);
      const fade = THREE.MathUtils.clamp((distance - 80) / 140, 0, 1);
      const opacity = (0.15 + fade * 0.85).toFixed(2);
      if (entry.opacity !== opacity) {
        entry.el.style.opacity = opacity;
        entry.opacity = opacity;
      }
      const pointer = fade > 0.25 ? "auto" : "none";
      if (entry.pointer !== pointer) {
        entry.el.style.pointerEvents = pointer;
        entry.pointer = pointer;
      }
    }
  });

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
            register={register}
          />
        );
      })}
    </group>
  );
}

function OverviewControls({ focusBuilding, enabled }) {
  const controls = useRef();
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
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
    // 弹起后的楼层剖面悬停在「原楼顶再高一栋楼」处（见 BuildingInterior），
    // 镜头若还盯着楼体中心，剖面会被顶出画面，所以对准那叠剖面的几何中心。
    const stackHeight =
      Math.max(0, (building.floors || 1) - 1) * (ROOM_FLOOR_H + ROOM_FLOOR_GAP) +
      ROOM_FLOOR_H;
    const target = new THREE.Vector3(
      building.x,
      building.h + stackHeight / 2,
      building.z,
    );
    const distance = Math.min(
      650,
      Math.max(
        140,
        Math.max(building.w, building.d) * 1.55 + 75 + building.h + stackHeight * 0.55,
      ),
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
      // demand 模式下渲染循环是「按需触发」的，相机飞行是自己驱动的动画，
      // 必须在帧内把下一帧续上，否则镜头会停在半路。
      invalidate();
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
        <span className="eyebrow">
          {`ROOM / ${buildingBadge(room.building_code)} · ${
            /_F(\d+)_(\d+)$/.exec(room.room_code)?.slice(1).join("-") ||
            room.room_code
          }`}
        </span>
        <h3>{room.semantic_name}</h3>
      </div>
      <div className="room-info-meta">
        <span>
          {room.floor} 层 · {room.room_type}
        </span>
        <span>
          {campusBadgeOf(
            PHOTO_BUILDINGS.find((item) => item.id === room.building_code),
          )}{" "}
          · {room.anchor_world[0].toFixed(1)},{" "}
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

/**
 * 阴影按需更新。
 *
 * three 默认每帧重算 shadow map；本场景有 900+ 个 castShadow 网格，
 * 等于每帧多跑一遍全场景正面渲染。相机静止、状态未变时完全没必要重算，
 * 因此改成按需触发（相机移动 / 高亮变化 / 动画进行中）。
 */
function ShadowUpdater({ signature }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const last = useRef({ pos: new THREE.Vector3(1e9, 1e9, 1e9), sig: null });
  const cooldown = useRef(0);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useFrame(() => {
    // 首次观察只记录状态，不触发冷却：
    // 否则页面刚打开就会白白重算 100 帧阴影（正是用户最容易感觉到卡的时刻）。
    if (last.current.sig === null) {
      last.current.sig = signature;
    } else if (last.current.sig !== signature) {
      last.current.sig = signature;
      cooldown.current = 100; // 状态切换后楼栋有 ~1.6s 的浮起/染色动画，期间保持重算
    }
    const moved = camera.position.distanceToSquared(last.current.pos) > 0.25;
    if (moved) {
      last.current.pos.copy(camera.position);
      cooldown.current = 6;
    }
    if (cooldown.current > 0) {
      cooldown.current -= 1;
      gl.shadowMap.needsUpdate = true;
      // 冷却期内的阴影重算同样要靠 invalidate 续帧，否则 demand 模式下
      // 只会画一次阴影就停，楼还没浮完影子就旧了。
      invalidate();
    }
  });
  return null;
}

// 依据 road_graph.json 程序化重建路面（GLB 里的旧路面网格已在载入时剔除）。
// 这样 3D 路面永远和寻路所用的路网保持一致：路网改了，地面跟着变。
// 每条边是一段轴对齐直线 → 一个四边形；全部边合并成两个 Mesh（路面 + 中线），draw call = 2。
function buildRoadGeometry(edges, width, baseY) {
  const positions = [];
  const indices = [];
  let vertexBase = 0;
  edges.forEach((edge, edgeIndex) => {
    // 路口处相邻路段会互相叠压，同一高度共面会 z-fighting；
    // 给每条边一个肉眼不可见的高度错位（≤1.4cm）错开。
    const y = baseY + (edgeIndex % 13) * 0.0012;
    const geometry = edge.geometry || [];
    for (let i = 0; i < geometry.length - 1; i += 1) {
      const [x1, , z1] = geometry[i];
      const [x2, , z2] = geometry[i + 1];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.hypot(dx, dz);
      if (length < 0.05) continue;
      const nx = (-dz / length) * (width / 2);
      const nz = (dx / length) * (width / 2);
      positions.push(
        x1 - nx, y, z1 - nz,
        x1 + nx, y, z1 + nz,
        x2 + nx, y, z2 + nz,
        x2 - nx, y, z2 - nz,
      );
      indices.push(
        vertexBase, vertexBase + 2, vertexBase + 1,
        vertexBase, vertexBase + 3, vertexBase + 2,
      );
      vertexBase += 4;
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function GroundRoads() {
  const geometries = useMemo(
    () => ({
      // 高度选 0.18/0.28 的原因：GLB 里所有平铺地貌（主轴铺装 0.085、环形广场
      // 0.075、边界条 0.13、球场 0.14、湖面 0.11、跑道 0.12）都压在 0.07~0.15，
      // 旧高度 0.07 会被它们盖住、近距离还会 z-fight 闪烁 —— 路面必须整体抬到
      // 全部平铺地貌之上；0.28 的中线与路面错开 0.085，远距离也不再闪。
      road: buildRoadGeometry(ACTIVE_ROAD_EDGES, 5.2, 0.18),
      mark: buildRoadGeometry(ACTIVE_ROAD_EDGES, 0.42, 0.28),
    }),
    [],
  );
  useEffect(
    () => () => {
      geometries.road.dispose();
      geometries.mark.dispose();
    },
    [geometries],
  );
  return (
    <group>
      <mesh geometry={geometries.road} receiveShadow raycast={() => {}}>
        <meshStandardMaterial
          color="#2c3f46"
          roughness={0.92}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={geometries.mark} raycast={() => {}}>
        <meshBasicMaterial color="#a9b49d" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// 路径点批次：把 [[x,y,z], ...] 压平成 Float32Array 交给单个 <points> 绘制。
// 原来给每个路径点单独画一个球体（几十~上百个 draw call），一个批次视觉一致且恒为 1 draw call。
function RouteDots({ points, color }) {
  const flat = useMemo(() => Float32Array.from(points.flat()), [points]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={flat.length / 3}
          array={flat}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={1.6}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
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
  routeLegInfo,
  routeOriginPoint,
  showLabels,
  weather,
  showRooms,
}) {
  // 弹起期间锁定选楼：当前楼栋没有落回之前，点击其他楼栋一律忽略。
  // 否则转视角时松手落在别的楼上，就会把「正在看的那栋」切成新楼、原楼跟着落回，
  // 整个查看过程被打断。必须先点当前楼栋让它落回，才能再点下一栋。
  const handleSceneSelect = useCallback(
    (building) => {
      if (liftedBuilding && building && building.id !== liftedBuilding) return;
      onSelect(building);
    },
    [liftedBuilding, onSelect],
  );

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
    const points = pathPointsFromIds(ids);
    for (const indoorPoint of routeIndoorPoints || []) {
      points.push([indoorPoint[0], indoorPoint[1], indoorPoint[2]]);
    }
    return points;
  }, [showRoute, routeNodeIds, routeIndoorPoints]);

  // 课表多段路径：后端每个 leg 带 node_ids（本段室外节点）/ indoor_pts（进教室的室内点）/
  // indoor_line（同楼换教室直连线）。逐段展开成折线并分配不同颜色；
  // 第一段把宿舍房间门口（routeOriginPoint）接进折线头部，路径从房间而不是楼门开始。
  const routeSegments = useMemo(() => {
    if (!showRoute) return null;
    const legs = (routeLegInfo || []).filter(
      (leg) =>
        leg &&
        !leg.indoor_hop &&
        ((leg.node_ids && leg.node_ids.length > 1) || leg.indoor_line),
    );
    if (legs.length < 2) return null;
    const segments = [];
    legs.forEach((leg, index) => {
      let pts = [];
      if (leg.node_ids && leg.node_ids.length > 1) {
        pts = pathPointsFromIds(leg.node_ids);
        if (index === 0 && routeOriginPoint) {
          pts = [[routeOriginPoint[0], 1.0, routeOriginPoint[2]], ...pts];
        }
        if (leg.indoor_pts && leg.indoor_pts.length) {
          pts = pts.concat(leg.indoor_pts);
        }
      } else if (leg.indoor_line) {
        pts = leg.indoor_line.map((p) => [p[0], 1.0, p[2]]);
      }
      if (pts.length > 1) {
        segments.push({
          color: ROUTE_LEG_COLORS[index % ROUTE_LEG_COLORS.length],
          points: pts,
        });
      }
    });
    return segments.length ? segments : null;
  }, [showRoute, routeLegInfo, routeOriginPoint]);

  // 路径点批次：把 [[x,y,z], ...] 压平成 Float32Array，交给单个 <points> 绘制
  // （原整条路径共用一个批次；现在多段路径由 RouteDots 每段一个批次，段数 ≤4 不构成压力）

  // 阴影贴图只在「相机移动」或「高亮/选中状态变化」时需要重算。
  // 场景里有 900+ 个投影网格，默认每帧都会重跑一遍阴影 pass（相当于 draw call 翻倍），
  // 而首页在静止观看时相机并不动，这部分是纯浪费。
  const shadowSignature = useMemo(
    () =>
      `${selected?.id || ""}|${liftedBuilding || ""}|${Object.keys(highlights)
        .sort()
        .join(",")}`,
    [selected, liftedBuilding, highlights],
  );
  return (
    <>
      <color attach="background" args={["#07131f"]} />
      <GroundRoads />
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
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-290}
        shadow-camera-right={290}
        shadow-camera-top={240}
        shadow-camera-bottom={-240}
      />
      <ShadowUpdater signature={shadowSignature} />
      <ModelErrorBoundary
        fallback={
          <FallbackCampus
            highlights={highlights}
            selected={selected}
            onSelect={handleSceneSelect}
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
            onSelect={handleSceneSelect}
            onRoomSelect={onRoomSelect}
            selectedRoom={selectedRoom}
            showRooms={showRooms}
          />
        </Suspense>
      </ModelErrorBoundary>
      {liftedBuilding && selected?.id === liftedBuilding && showRooms && (
        <>
          <BuildingInterior
            building={selected}
            highlights={highlights}
            selectedRoom={selectedRoom}
            onRoomSelect={onRoomSelect}
          />
          {/* 弹起后外壳整体隐藏，「再次点击这栋楼让它落回」就失去了受力面。
              这里补一个与楼体等高的透明拾取体（opacity=0 但仍参与 Raycaster）：
              点它 = 点这栋楼 → 落回。房间盒在同一条射线上离相机更近，
              所以点房间依旧是选房间，不会被它抢走。 */}
          {!walkMode && (
            <mesh
              position={[selected.x, selected.h / 2, selected.z]}
              onClick={(event) => {
                event.stopPropagation();
                handleSceneSelect(selected);
              }}
            >
              <boxGeometry args={[selected.w + 2, selected.h, selected.d + 2]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
        </>
      )}
      <RoomHighlightMarkers
        highlights={highlights}
        liftedBuilding={liftedBuilding}
      />
      {showLabels && (
        <CampusBuildingLabels highlighted={selected} onSelect={handleSceneSelect} />
      )}
      <group>
        {routeSegments
          ? routeSegments.map((seg, index) => (
              <group key={`route-seg-${index}`}>
                <Line points={seg.points} color={seg.color} lineWidth={3.4} />
                <RouteDots points={seg.points} color={seg.color} />
              </group>
            ))
          : route.length > 1 && (
              <>
                <Line points={route} color={COLORS.route} lineWidth={3.4} />
                <RouteDots points={route} color={COLORS.route} />
              </>
            )}
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
  const invalidate = useThree((state) => state.invalidate);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.03;
      ref.current.position.y = Math.sin(performance.now() / 950) * 1.2;
    }
    // 雨是持续动画：demand 模式下自己续帧（切回晴天该组件卸载，自动停）。
    invalidate();
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
  // 逐段路线（from→to + 距离/时间），由后端 route_stops 提供
  const [routeLegs, setRouteLegs] = useState([]);
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
      setRouteLegs(isRoute ? payload.route_stops || payload.route?.legs || [] : []);
      setShowRoute(isRoute);
      if (payload.highlight?.[0]) {
        const building =
          PHOTO_BUILDINGS.find((b) => b.id === payload.highlight[0]) || null;
        if (building) {
          // 问答触发的选中必须是「强制切换」，不能复用点击楼的 toggle：
          // toggle 在「这栋楼已弹起」时会把楼收回去 —— 连续两次问
          // 「我的宿舍在哪？」第二次楼就落地、宿舍高亮直接消失。
          setWalkMode(false);
          setSelected(building);
          setSelectedRoom(null);
          setQueryRoom(null);
          setRoomMembers(null);
          setActiveTab("rooms");
        }
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
      // 落回 = 彻底收起：只切页签不清 selected 的话，弹起循环里
      // isSelected 仍为 true，外壳会停在「地面 + 5.5m 选中抬升」处悬空，
      // 直到点其他楼把 selected 换走才真正落地。
      setActiveTab("overview");
      resetSelection();
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

  // 「房间 LOD2」页签下选中的楼栋即处于弹起查看态；这是弹起唯一的判定口径，
  // 场景点击的锁定逻辑（见 CampusScene.handleSceneSelect）也依赖它。
  const liftedBuilding =
    selected && activeTab === "rooms" ? selected.id : null;
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
                <b>{campusLayout.buildings.length}</b>
              </div>
              <div>
                <span>房间锚点</span>
                <b>{roomAnchors.rooms.length}</b>
              </div>
              <div>
                <span>路网节点</span>
                <b>{roadGraph.nodes.length}</b>
              </div>
              <div>
                <span>路网边</span>
                <b>{roadGraph.edges.length}</b>
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
              {/* frameloop="demand"：静止时一格帧都不画。
                  实测（静止 6s 采样）：改前 rAF 60.5fps、每帧 1336 次 draw call、
                  主线程占用 59.2%，其中 52.6% 是 JS —— 全部烧在 three.js 的
                  渲染管线上（projectObject / setProgram / updateMatrixWorld / sort）。
                  也就是说卡不卡跟「楼房有多少面」关系不大，跟「每帧都重画一遍」关系最大。
                  drei 的 OrbitControls 已在 change 事件里 invalidate()，所以
                  拖拽/滚轮的阻尼惯性照样连续；只有下面这些自写动画需要自己续帧。 */}
              <Canvas
                frameloop="demand"
                shadows
                dpr={[1, 1.35]}
                gl={{ antialias: true, powerPreference: "high-performance" }}
                camera={{ far: 3200, near: 0.6 }}
                onCreated={({ gl }) => {
                  // 供 CDP 内存探针读取 renderer.info（geometries/textures/programs），
                  // 判断交互时内存增长是 JS 堆还是 WebGL 资源泄漏。
                  window.__gl = gl;
                }}
              >
                <PerspectiveCamera
                  makeDefault
                  position={[325, 285, -420]}
                  fov={walkMode ? 66 : 48}
                  // 俯瞰机位距校园中心约 600m：默认 near=0.1 时深度缓冲在该距离的
                  // 分辨率约 ±0.2m，地面（y=0）与新路面（y=0.18）会打架 —— 表现为
                  // 一点击触发重绘、路面就闪烁。俯瞰把 near 提到 0.6（分辨率×6），
                  // 漫游贴墙时仍用 0.1 避免近处裁切。
                  near={walkMode ? 0.1 : 0.6}
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
                  liftedBuilding={liftedBuilding}
                  walkMode={walkMode}
                  onSelect={handleSelectBuilding}
                  onRoomSelect={handleRoomSelect}
                  selectedRoom={selectedRoom}
                  showRoute={showRoute}
                  routeNodeIds={routeNodeIds}
                  routeIndoorPoints={routeInfo.indoor_points || []}
                  routeLegInfo={routeLegs}
                  routeOriginPoint={routeInfo.origin_point || null}
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
              <div
                className={`camera-hint${liftedBuilding ? " locked" : ""}`}
                onClick={
                  liftedBuilding ? () => handleSelectBuilding(selected) : null
                }
              >
                {liftedBuilding
                  ? `${selected?.name || "当前楼栋"} 已弹起 · 再次点击该楼栋（或此处）即可落回 · 落回前点其他楼栋不会弹起`
                  : "按住左键旋转视角 · 按住右键移动画面 · 滚轮缩放 · 点击楼栋切换中心"}
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
                      SELECTED BUILDING / {campusBadgeOf(selected)}
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
              {routeLegs.length > 0 ? (
                routeLegs.map((leg, index) => (
                  <div className="route-step" key={`${leg.to}-${index}`}>
                    <span
                      className="route-node"
                      style={
                        routeLegs.length > 1
                          ? {
                              background:
                                ROUTE_LEG_COLORS[
                                  index % ROUTE_LEG_COLORS.length
                                ],
                            }
                          : undefined
                      }
                    />
                    <div>
                      <b>
                        {leg.from} → {leg.to}
                      </b>
                      <small>
                        {leg.reason ? `${leg.reason} · ` : ""}
                        约 {leg.distance_m} m · 步行 {leg.walking_minutes} 分钟
                        {leg.indoor ? " · 含室内段" : ""}
                      </small>
                    </div>
                  </div>
                ))
              ) : routeStops.length === 0 ? (
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
            {routeLegs.length > 0 && (
              <div className="route-total">
                全程 {routeInfo.distance_m} m · 约 {routeInfo.walking_minutes} 分钟 ·{" "}
                {routeLegs.length} 段
              </div>
            )}
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
              {/* 这两张是实景参考图，原图 8.4MB / 10.9MB 且未懒加载，
                  打开首页就会同步下载，是「3D 页加载慢」的一大来源。
                  这里改为懒加载 + 异步解码，避免和 glb 抢带宽/主线程。 */}
              <img
                src="/assets/photo-overview.jpg"
                alt="校园沙盘航拍参考"
                loading="lazy"
                decoding="async"
              />
              <img
                src="/assets/photo-sports.jpg"
                alt="校园运动场参考"
                loading="lazy"
                decoding="async"
              />
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
