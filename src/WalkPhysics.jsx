import React from "react";
import { Physics } from "@react-three/rapier";
import { CampusColliders, WalkController } from "./WalkController";

export default function WalkPhysics({ buildings, onPosition }) {
  return (
    <Physics gravity={[0, -18, 0]}>
      <CampusColliders buildings={buildings} />
      <WalkController enabled onPosition={onPosition} />
    </Physics>
  );
}
