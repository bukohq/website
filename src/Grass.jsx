// Based on https://codepen.io/al-ro/pen/jJJygQ by al-ro, but rewritten in react-three-fiber
import * as THREE from "three"
import React, { useRef, useMemo } from "react"
import SimplexNoise from "simplex-noise"
import { useFrame, useLoader } from "@react-three/fiber"
import bladeDiffuse from "./resources/blade_diffuse.jpg"
import bladeAlpha from "./resources/blade_alpha.jpg"
import "./GrassMaterial"

const simplex = new SimplexNoise(Math.random)

// Color keyframes — pre-allocated to avoid per-frame allocations
const KEYFRAMES = [
  { phase: 0.00, tip: new THREE.Color(0.25, 0.40, 0.02), bottom: new THREE.Color(0.12, 0.08, 0.01), ground: new THREE.Color(0.06, 0.04, 0.01) },
  { phase: 0.25, tip: new THREE.Color(0.00, 0.60, 0.00), bottom: new THREE.Color(0.00, 0.10, 0.00), ground: new THREE.Color(0.00, 0.06, 0.00) },
  { phase: 0.50, tip: new THREE.Color(0.30, 0.30, 0.00), bottom: new THREE.Color(0.15, 0.05, 0.00), ground: new THREE.Color(0.08, 0.02, 0.00) },
  { phase: 0.75, tip: new THREE.Color(0.00, 0.08, 0.05), bottom: new THREE.Color(0.00, 0.02, 0.02), ground: new THREE.Color(0.00, 0.01, 0.02) },
  { phase: 1.00, tip: new THREE.Color(0.25, 0.40, 0.02), bottom: new THREE.Color(0.12, 0.08, 0.01), ground: new THREE.Color(0.06, 0.04, 0.01) },
]

// Scratch colors — reused each frame, no allocation
const _tip    = new THREE.Color()
const _bottom = new THREE.Color()
const _ground = new THREE.Color()

function lerpGrassColors(phase) {
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i], b = KEYFRAMES[i + 1]
    if (phase >= a.phase && phase <= b.phase) {
      const t = (phase - a.phase) / (b.phase - a.phase)
      _tip.lerpColors(a.tip, b.tip, t)
      _bottom.lerpColors(a.bottom, b.bottom, t)
      _ground.lerpColors(a.ground, b.ground, t)
      return
    }
  }
}

export default function Grass({ options = { bW: 0.12, bH: 1, joints: 5 }, width = 100, instances = 50000, phaseRef, ...props }) {
  const { bW, bH, joints } = options
  const materialRef      = useRef()
  const groundMaterialRef = useRef()
  const [texture, alphaMap] = useLoader(THREE.TextureLoader, [bladeDiffuse, bladeAlpha])
  const attributeData = useMemo(() => getAttributeData(instances, width), [instances, width])
  const baseGeom = useMemo(() => new THREE.PlaneGeometry(bW, bH, 1, joints).translate(0, bH / 2, 0), [options])
  const groundGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, width, 32, 32)
    geo.attributes.position.needsUpdate = true
    geo.lookAt(new THREE.Vector3(0, 1, 0))
    const positions = geo.attributes.position.array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] = getYPosition(positions[i], positions[i + 2])
    }
    geo.computeVertexNormals()
    return geo
  }, [width])
  const boundingSphere = useMemo(() => {
    return new THREE.Sphere(new THREE.Vector3(), (Math.sqrt(2) * width) / 2)
  }, [width])

  useFrame((state) => {
    materialRef.current.uniforms.time.value = state.clock.elapsedTime / 4

    if (phaseRef?.current !== undefined) {
      lerpGrassColors(phaseRef.current)
      materialRef.current.uniforms.tipColor.value.copy(_tip)
      materialRef.current.uniforms.bottomColor.value.copy(_bottom)
      if (groundMaterialRef.current) groundMaterialRef.current.color.copy(_ground)
    }
  })

  return (
    <group {...props}>
      {/* frustumCulled=false fixes the grass-invisible-on-load bug */}
      <mesh frustumCulled={false}>
        <instancedBufferGeometry
          index={baseGeom.index}
          attributes-position={baseGeom.attributes.position}
          attributes-uv={baseGeom.attributes.uv}
          boundingSphere={boundingSphere}>
          <instancedBufferAttribute attach="attributes-offset"           args={[new Float32Array(attributeData.offsets),          3]} />
          <instancedBufferAttribute attach="attributes-orientation"      args={[new Float32Array(attributeData.orientations),     4]} />
          <instancedBufferAttribute attach="attributes-stretch"          args={[new Float32Array(attributeData.stretches),        1]} />
          <instancedBufferAttribute attach="attributes-halfRootAngleSin" args={[new Float32Array(attributeData.halfRootAngleSin), 1]} />
          <instancedBufferAttribute attach="attributes-halfRootAngleCos" args={[new Float32Array(attributeData.halfRootAngleCos), 1]} />
        </instancedBufferGeometry>
        <grassMaterial ref={materialRef} map={texture} alphaMap={alphaMap} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0]} geometry={groundGeo}>
        <meshStandardMaterial ref={groundMaterialRef} color="#000f00" />
      </mesh>
    </group>
  )
}

function getAttributeData(instances, width) {
  const offsets = [], orientations = [], stretches = [], halfRootAngleSin = [], halfRootAngleCos = []
  let quaternion_0 = new THREE.Vector4()
  let quaternion_1 = new THREE.Vector4()
  const min = -0.25, max = 0.25

  for (let i = 0; i < instances; i++) {
    const offsetX = Math.random() * width - width / 2
    const offsetZ = Math.random() * width - width / 2
    const offsetY = getYPosition(offsetX, offsetZ)
    offsets.push(offsetX, offsetY, offsetZ)

    let angle = Math.PI - Math.random() * (2 * Math.PI)
    halfRootAngleSin.push(Math.sin(0.5 * angle))
    halfRootAngleCos.push(Math.cos(0.5 * angle))

    let RotationAxis = new THREE.Vector3(0, 1, 0)
    let x = RotationAxis.x * Math.sin(angle / 2.0)
    let y = RotationAxis.y * Math.sin(angle / 2.0)
    let z = RotationAxis.z * Math.sin(angle / 2.0)
    let w = Math.cos(angle / 2.0)
    quaternion_0.set(x, y, z, w).normalize()

    angle = Math.random() * (max - min) + min
    RotationAxis = new THREE.Vector3(1, 0, 0)
    x = RotationAxis.x * Math.sin(angle / 2.0); y = RotationAxis.y * Math.sin(angle / 2.0)
    z = RotationAxis.z * Math.sin(angle / 2.0); w = Math.cos(angle / 2.0)
    quaternion_1.set(x, y, z, w).normalize()
    quaternion_0 = multiplyQuaternions(quaternion_0, quaternion_1)

    angle = Math.random() * (max - min) + min
    RotationAxis = new THREE.Vector3(0, 0, 1)
    x = RotationAxis.x * Math.sin(angle / 2.0); y = RotationAxis.y * Math.sin(angle / 2.0)
    z = RotationAxis.z * Math.sin(angle / 2.0); w = Math.cos(angle / 2.0)
    quaternion_1.set(x, y, z, w).normalize()
    quaternion_0 = multiplyQuaternions(quaternion_0, quaternion_1)

    orientations.push(quaternion_0.x, quaternion_0.y, quaternion_0.z, quaternion_0.w)
    stretches.push(i < instances / 3 ? Math.random() * 1.8 : Math.random())
  }

  return { offsets, orientations, stretches, halfRootAngleCos, halfRootAngleSin }
}

function multiplyQuaternions(q1, q2) {
  return new THREE.Vector4(
    q1.x * q2.w + q1.y * q2.z - q1.z * q2.y + q1.w * q2.x,
    -q1.x * q2.z + q1.y * q2.w + q1.z * q2.x + q1.w * q2.y,
    q1.x * q2.y - q1.y * q2.x + q1.z * q2.w + q1.w * q2.z,
    -q1.x * q2.x - q1.y * q2.y - q1.z * q2.z + q1.w * q2.w,
  )
}

function getYPosition(x, z) {
  var y = 2 * simplex.noise2D(x / 50, z / 50)
  y += 4 * simplex.noise2D(x / 100, z / 100)
  y += 0.2 * simplex.noise2D(x / 10, z / 10)
  return y
}
