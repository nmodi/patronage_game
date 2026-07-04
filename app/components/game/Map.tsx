import { useFrame } from "@react-three/fiber";
import { useMemo, useState, useEffect } from "react";
import * as THREE from "three";
import { useGameStore } from "~/stores/useGameStore";
import { BUILDING_METADATA_BY_ID, type BuildingId } from "~/game/buildings";
import type { BuildingMetadata, BuildingType } from "~/game/types";

const GRID_SIZE = 20;
const CELL_SIZE = 1;

const geometryCache: Record<BuildingId, THREE.BufferGeometry> = {} as Record<
  BuildingId,
  THREE.BufferGeometry
>;

function getGeometryForBuilding(id: BuildingId, type: BuildingType) {
  if (geometryCache[id]) return geometryCache[id];
  const metadata = BUILDING_METADATA_BY_ID[id];
  const width = metadata?.size.width ?? 0.95;
  const height = metadata?.size.height ?? 0.2;
  const depth = metadata?.size.depth ?? 0.95;
  if (type === "road") {
    const plane = new THREE.PlaneGeometry(width * CELL_SIZE, depth * CELL_SIZE);
    plane.rotateX(-Math.PI / 2);
    geometryCache[id] = plane;
    return geometryCache[id];
  }
  geometryCache[id] = new THREE.BoxGeometry(
    width * CELL_SIZE,
    height,
    depth * CELL_SIZE
  );
  return geometryCache[id];
}

function useBuildingPosition(position: THREE.Vector2, metadata?: BuildingMetadata) {
  const footprint = metadata?.footprint ?? { width: 1, depth: 1 };
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const xOffset = ((footprint.width - 1) * CELL_SIZE) / 2;
  const zOffset = ((footprint.depth - 1) * CELL_SIZE) / 2;
  const xPos = position.x * CELL_SIZE - halfGrid + CELL_SIZE / 2 + xOffset;
  const zPos = position.y * CELL_SIZE - halfGrid + CELL_SIZE / 2 + zOffset;
  const height = metadata?.size.height ?? 0.2;
  const yPos = metadata?.type === "road" ? 0.001 : height / 2;
  return { xPos, yPos, zPos };
}

function Tile({
  position,
  buildingId,
  type,
  isActive,
}: {
  position: THREE.Vector2;
  buildingId: BuildingId;
  type: BuildingType;
  isActive: boolean;
}) {
  const metadata = BUILDING_METADATA_BY_ID[buildingId];
  const geometry = useMemo(() => {
    return getGeometryForBuilding(buildingId, type);
  }, [buildingId, type]);

  const { xPos, yPos, zPos } = useBuildingPosition(position, metadata);
  const color = metadata?.color ?? "#cccccc";

  return (
    <group>
      <mesh position={[xPos, yPos, zPos]}>
        <primitive object={geometry} />
        <meshStandardMaterial
          color={color}
          roughness={type === "road" ? 0.8 : 0.5}
          metalness={type === "road" ? 0.1 : 0.2}
        />
      </mesh>
      {!isActive && type !== "road" && (
        <mesh position={[xPos, yPos + 0.5, zPos]}>
          <planeGeometry args={[0.6, 0.3]} />
          <meshBasicMaterial color="#ff4d4d" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

function BuildingGhost({
  position,
  buildingId,
  isValid,
}: {
  position: THREE.Vector2;
  buildingId: BuildingId;
  isValid: boolean;
}) {
  const metadata = BUILDING_METADATA_BY_ID[buildingId];
  if (!metadata) return null;
  const geometry = useMemo(() => {
    return getGeometryForBuilding(buildingId, metadata.type);
  }, [buildingId, metadata.type]);

  const { xPos, yPos, zPos } = useBuildingPosition(position, metadata);

  return (
    <mesh position={[xPos, yPos, zPos]}>
      <primitive object={geometry} />
      <meshStandardMaterial
        color={isValid ? "#ffffff" : "#ff4d4d"}
        transparent
        opacity={0.45}
        depthWrite={false}
      />
    </mesh>
  );
}

function GridHelper() {
  return (
    <group>
      {/* Main grid - centered at 0,0,0 */}
      <gridHelper
        args={[GRID_SIZE * CELL_SIZE, GRID_SIZE, "#aaaaaa", "#aaaaaa"]}
        position={[0, 0.01, 0]}
      />
    </group>
  );
}

export function GameMap() {
  const tiles = useGameStore((s) => s.map.tiles);
  const selectedBuilding = useGameStore((s) => s.map.selectedBuilding);
  const placeTile = useGameStore((s) => s.placeTile);
  const getTileAt = useGameStore((s) => s.getTileAt);

  // Local state for hover and mouse
  const [hoverInfo, setHoverInfo] = useState<{ position: THREE.Vector2; isValid: boolean } | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [lastPlacedPosition, setLastPlacedPosition] = useState<THREE.Vector2 | null>(null);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-hud]")
      ) {
        return;
      }
      setIsMouseDown(true);
      setLastPlacedPosition(null);
    };
    const handleMouseUp = () => {
      setIsMouseDown(false);
      setLastPlacedPosition(null);
    };
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useFrame((state) => {
    if (!selectedBuilding) {
      setHoverInfo(null);
      return;
    }

    const metadata = BUILDING_METADATA_BY_ID[selectedBuilding];
    if (!metadata) {
      setHoverInfo(null);
      return;
    }

    const raycaster = state.raycaster;
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, intersection);
    if (intersection) {
      const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
      const gridX = Math.floor((intersection.x + halfGrid) / CELL_SIZE);
      const gridY = Math.floor((intersection.z + halfGrid) / CELL_SIZE);
      if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        const currentPosition = new THREE.Vector2(gridX, gridY);
        const footprint = metadata.footprint ?? { width: 1, depth: 1 };
        const fitsFootprint =
          gridX + footprint.width <= GRID_SIZE && gridY + footprint.depth <= GRID_SIZE;

        let areaFree = false;
        if (fitsFootprint) {
          areaFree = (() => {
            const probe = new THREE.Vector2();
            for (let dx = 0; dx < footprint.width; dx += 1) {
              for (let dy = 0; dy < footprint.depth; dy += 1) {
                probe.set(gridX + dx, gridY + dy);
                if (getTileAt(probe)) {
                  return false;
                }
              }
            }
            return true;
          })();
        }

        const canPlaceHere = fitsFootprint && areaFree;
        setHoverInfo({ position: currentPosition, isValid: canPlaceHere });

        if (isMouseDown && canPlaceHere) {
          const isRoad = metadata.type === "road";
          const hasPlacedDuringDrag =
            isRoad && lastPlacedPosition && lastPlacedPosition.equals(currentPosition);
          const canPlaceThisDrag =
            (isRoad && !hasPlacedDuringDrag) || (!isRoad && !lastPlacedPosition);

          if (canPlaceThisDrag) {
            placeTile(currentPosition, selectedBuilding);
            const placedTile = getTileAt(currentPosition);
            if (
              placedTile &&
              placedTile.buildingId === selectedBuilding &&
              placedTile.isOrigin &&
              placedTile.origin.x === currentPosition.x &&
              placedTile.origin.y === currentPosition.y
            ) {
              setLastPlacedPosition(currentPosition);
            }
          }
        }
      } else {
        setHoverInfo(null);
      }
    } else {
      setHoverInfo(null);
    }
  });

  return (
    <group>
      <GridHelper />
      {Object.values(tiles)
        .filter((tile) => tile.isOrigin)
        .map((tile) => (
          <Tile
            key={`${tile.position.x},${tile.position.y}`}
            position={tile.position}
            buildingId={tile.buildingId}
            type={tile.type}
            isActive={tile.isActive}
          />
        ))}
      {hoverInfo && selectedBuilding ? (
        <BuildingGhost
          position={hoverInfo.position}
          buildingId={selectedBuilding}
          isValid={hoverInfo.isValid}
        />
      ) : null}
    </group>
  );
}
