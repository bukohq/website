import React from "react"
import { Center, Text3D, MeshTransmissionMaterial } from "@react-three/drei"
import font from "three/examples/fonts/helvetiker_bold.typeface.json"

export default function BukoText() {
  return (
    <Center position={[0, 5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <Text3D
        font={font}
        size={8}
        depth={5}
        curveSegments={12}
        bevelEnabled
        bevelThickness={0.2}
        bevelSize={0.1}
        bevelSegments={5}
      >
        BUKO
        <MeshTransmissionMaterial
          backside
          samples={6}
          transmission={0.65}
          thickness={3}
          chromaticAberration={0.05}
          iridescence={1}
          iridescenceIOR={1.2}
          iridescenceThicknessRange={[0, 1400]}
          roughness={0.1}
          anisotropy={0.3}
          color="#a0c8ff"
        />
      </Text3D>
    </Center>
  )
}
