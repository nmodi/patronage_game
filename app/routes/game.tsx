
import React, { Suspense, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { MapControls, Stats } from "@react-three/drei";
import * as THREE from "three";
import type { MetaFunction } from "@remix-run/node";

import { useGameStore } from "~/stores/useGameStore";
import { GameMap } from "~/components/game/Map";
import { GameHUD } from "~/components/game/GameHUD";
import { GameLoop } from "~/components/GameLoop";


export const meta: MetaFunction = () => {
  return [
    { title: "RenCity Builder" },
    { name: "description", content: "3D City Building Game" },
  ];
};

function Scene() {
  const selectedType = useGameStore((s) => s.map.selectedBuilding);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!controlsRef.current) return;
      const camera = controlsRef.current.object;
      const panSpeed = 1;
      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      
      switch (e.key.toLowerCase()) {
        case "w":
        case "arrowup":
          camera.position.addScaledVector(forward, panSpeed);
          controlsRef.current.target.addScaledVector(forward, panSpeed);
          break;
        case "s":
        case "arrowdown":
          camera.position.addScaledVector(forward, -panSpeed);
          controlsRef.current.target.addScaledVector(forward, -panSpeed);
          break;
        case "a":
        case "arrowleft":
          camera.position.addScaledVector(right, -panSpeed);
          controlsRef.current.target.addScaledVector(right, -panSpeed);
          break;
        case "d":
        case "arrowright":
          camera.position.addScaledVector(right, panSpeed);
          controlsRef.current.target.addScaledVector(right, panSpeed);
          break;
        default:
          return;
      }
    controlsRef.current.update();
  }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedType]);


  return (
    <>
      <color attach="background" args={["#87CEEB"]} />
      <fog attach="fog" args={["#87CEEB", 70, 95]} />
      <ambientLight intensity={0.7} />
      <directionalLight 
        position={[5, 5, 5]} 
        intensity={1.5}
        castShadow
      />

      {/* Infinite ground plane placed with the sky/background for organization */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[10000, 10000]} />
        <meshLambertMaterial color="#4a9460" emissive="#4a9460" emissiveIntensity={0.05} />
      </mesh>

      <GameMap />
      <MapControls 
        ref={controlsRef}
        enabled={!selectedType}
        screenSpacePanning={false} // Set to false to prevent vertical movement
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 2 - 0.02}
        enableDamping={true}
        dampingFactor={0.1}
        enableRotate={true}
        enablePan={true}
        minDistance={3}
        maxDistance={60}
        panSpeed={1.5} // Slightly faster panning for better control
      />
      {/* <Stats /> */}
    </>
  );
}



export default function GameWindow() {
  return (
    <div className="w-full h-screen relative">

      <Canvas shadows camera={{ position: [10, 10, 10], fov: 50 }}>
        <GameLoop />
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <GameHUD />
    </div>
  );
}
