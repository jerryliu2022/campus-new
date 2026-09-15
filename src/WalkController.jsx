import React, { useEffect, useRef } from "react";
import { PointerLockControls } from "@react-three/drei";
import { CapsuleCollider, RigidBody } from "@react-three/rapier";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import campusLayout from "../data/campus_layout.json";

const SPAWN = campusLayout.coordinate_system.spawn || [0, 0.95, -188];
const EXTENT = campusLayout.coordinate_system.model_extent_m || [528, 427];
const EYE_OFFSET = 1.55;
const MIN_BODY_Y = 0.9;

export function WalkController({ enabled, onPosition }) {
  const body = useRef();
  const keys = useRef(new Set());
  const camera = useThree((state) => state.camera);
  const reportAt = useRef(0);

  useEffect(() => {
    const down = (event) => {
      keys.current.add(event.code);
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "Space",
          "ShiftLeft",
          "ShiftRight",
        ].includes(event.code)
      ) {
        event.preventDefault();
      }
    };
    const up = (event) => keys.current.delete(event.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    body.current?.setTranslation(
      { x: SPAWN[0], y: SPAWN[1] + 0.05, z: SPAWN[2] },
      true,
    );
    camera.position.set(SPAWN[0], SPAWN[1] + EYE_OFFSET, SPAWN[2]);
    camera.lookAt(0, SPAWN[1] + EYE_OFFSET, -130);
  }, [enabled, camera]);

  useFrame(({ clock }) => {
    if (!enabled || !body.current) return;
    const current = body.current.translation();
    const velocity = body.current.linvel();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3()
      .crossVectors(forward, camera.up)
      .normalize();
    const direction = new THREE.Vector3();
    if (keys.current.has("KeyW")) direction.add(forward);
    if (keys.current.has("KeyS")) direction.sub(forward);
    if (keys.current.has("KeyD")) direction.add(right);
    if (keys.current.has("KeyA")) direction.sub(right);
    const running =
      keys.current.has("ShiftLeft") || keys.current.has("ShiftRight");
    const speed = running ? 11.5 : 5.6;
    if (direction.lengthSq()) direction.normalize().multiplyScalar(speed);
    const canJump = Math.abs(velocity.y) < 0.18 && current.y < 1.18;
    const jumpVelocity =
      keys.current.has("Space") && canJump ? 7.6 : velocity.y;
    body.current.setLinvel(
      { x: direction.x, y: jumpVelocity, z: direction.z },
      true,
    );
    const safeY = Math.max(current.y, MIN_BODY_Y);
    if (safeY !== current.y) {
      body.current.setTranslation(
        { x: current.x, y: safeY, z: current.z },
        true,
      );
    }
    camera.position.set(current.x, safeY + EYE_OFFSET, current.z);
    if (clock.elapsedTime - reportAt.current > 0.25) {
      reportAt.current = clock.elapsedTime;
      onPosition?.({ x: current.x, y: safeY, z: current.z, running });
    }
  });

  return (
    <>
      {enabled && <PointerLockControls selector=".canvas-frame" />}
      <RigidBody
        ref={body}
        position={SPAWN}
        enabledRotations={[false, false, false]}
        colliders={false}
        linearDamping={5}
        friction={0.5}
        canSleep={false}
      >
        <CapsuleCollider args={[0.55, 0.38]} />
      </RigidBody>
    </>
  );
}

export function CampusColliders({ buildings }) {
  return (
    <>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, -0.5, 0]} visible={false}>
          <boxGeometry args={[EXTENT[0], 1, EXTENT[1]]} />
        </mesh>
      </RigidBody>
      {buildings.map((building) => (
        <RigidBody
          key={`collider-${building.id}`}
          type="fixed"
          colliders="cuboid"
        >
          <mesh
            position={[building.x, building.h / 2, building.z]}
            visible={false}
          >
            <boxGeometry args={[building.w, building.h, building.d]} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
