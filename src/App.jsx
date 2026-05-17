import React, { forwardRef, Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Cloud, Clouds, Sky, Stars, Sparkles } from "@react-three/drei"
import Grass from "./Grass"
import "./styles.css"

const CYCLE = 120
const START_PHASE = 0.25

function getInclination(phase) {
  return 0.44 + 0.17 * Math.sin(phase * Math.PI * 2)
}

// Smooth 0→1 S-curve between two edges
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

// Pre-allocated colours for zero-GC light updates
const _ambCol  = new THREE.Color()
const _dirCol  = new THREE.Color()
const NIGHT_AMB = new THREE.Color("#8899cc")
const DAWN_AMB  = new THREE.Color("#ffaa55")
const DAY_AMB   = new THREE.Color("#ffffff")
const NIGHT_DIR = new THREE.Color("#334466")
const DAWN_DIR  = new THREE.Color("#ff7733")
const DAY_DIR   = new THREE.Color("#ffffff")
const _moonPosition = new THREE.Vector3()

function getNightProgress(phase) {
  const nightStart = Math.asin((0.40 - 0.44) / 0.17) / (Math.PI * 2) + 0.5
  const nightEnd = 1 + Math.asin((0.40 - 0.44) / 0.17) / (Math.PI * 2)

  if (phase < nightStart && phase > nightEnd - 1) return null

  const adjustedPhase = phase >= nightStart ? phase : phase + 1
  return Math.max(0, Math.min(1, (adjustedPhase - nightStart) / (nightEnd - nightStart)))
}

function getMoonPosition(phase, target = _moonPosition) {
  const nightProgress = getNightProgress(phase) ?? 0
  const angle = Math.PI * nightProgress
  const x = 62 - 124 * nightProgress
  const y = 26 + Math.sin(angle) * 38
  const z = -72 + Math.cos(angle) * 12

  return target.set(x, y, z)
}

function DynamicSky({ phaseRef }) {
  const [incl, setIncl]           = useState(0.44)
  const [turbidity, setTurbidity] = useState(10)
  const [rayleigh, setRayleigh]   = useState(0.8)
  const [isNight, setIsNight]     = useState(false)
  const lastNight = useRef(false)
  const lastIncl  = useRef(0.44)

  useFrame(() => {
    const newIncl = getInclination(phaseRef.current)
    const night   = newIncl < 0.40
    const dp      = night ? 0 : Math.min(1, (newIncl - 0.40) / 0.21)

    if (Math.abs(newIncl - lastIncl.current) > 0.001) {
      lastIncl.current = newIncl
      setIncl(newIncl)
      setTurbidity(10 - dp * 4)
      setRayleigh(0.8 + dp * 1.2)
    }
    if (night !== lastNight.current) {
      lastNight.current = night
      setIsNight(night)
    }
  })

  if (isNight) return <color attach="background" args={["#050815"]} />

  return (
    <Sky
      azimuth={1}
      inclination={incl}
      distance={1000}
      turbidity={turbidity}
      rayleigh={rayleigh}
      mieCoefficient={0.005}
      mieDirectionalG={0.8}
    />
  )
}

function ResponsiveCamera() {
  const { camera, size } = useThree()

  useEffect(() => {
    const portrait = size.height > size.width
    const mobile = Math.min(size.width, size.height) < 700

    if (portrait && mobile) {
      camera.position.set(39, 35, 32)
      camera.fov = 58
    } else {
      camera.position.set(40, 37, 28)
      camera.fov = 50
    }

    camera.lookAt(0, 2, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.height, size.width])

  return null
}

function createFireflyTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 64

  const context = canvas.getContext("2d")
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, "rgba(255, 255, 230, 1)")
  gradient.addColorStop(0.28, "rgba(255, 248, 160, 0.95)")
  gradient.addColorStop(0.65, "rgba(255, 217, 90, 0.28)")
  gradient.addColorStop(1, "rgba(255, 217, 90, 0)")

  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const Fireflies = forwardRef(function Fireflies({ count = 36, phaseRef, ...props }, ref) {
  const pointsRef = useRef()
  useImperativeHandle(ref, () => pointsRef.current)

  const seeds = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: Math.random() * 90 - 45,
      y: Math.random() * 10 + 2,
      z: Math.random() * 90 - 45,
      driftX: Math.random() * 2.5 + 0.8,
      driftY: Math.random() * 1.2 + 0.4,
      driftZ: Math.random() * 2.5 + 0.8,
      speed: Math.random() * 0.45 + 0.18,
      phase: Math.random() * Math.PI * 2,
    }))
  }, [count])
  const positions = useMemo(() => new Float32Array(count * 3), [count])
  const texture = useMemo(() => createFireflyTexture(), [])

  useFrame(({ clock }) => {
    if (!pointsRef.current) return

    const time = clock.elapsedTime
    const incl = getInclination(phaseRef.current)
    const fade = 1 - smoothstep(0.35, 0.43, incl)
    const attribute = pointsRef.current.geometry.attributes.position

    pointsRef.current.visible = fade > 0.01
    pointsRef.current.material.opacity = fade * 0.95
    if (fade <= 0.01) return

    for (let i = 0; i < count; i++) {
      const seed = seeds[i]
      const index = i * 3
      const t = time * seed.speed + seed.phase

      positions[index] = seed.x + Math.sin(t) * seed.driftX
      positions[index + 1] = seed.y + Math.sin(t * 1.7) * seed.driftY
      positions[index + 2] = seed.z + Math.cos(t * 0.8) * seed.driftZ
    }

    attribute.needsUpdate = true
  })

  return (
    <points ref={pointsRef} visible={false} {...props}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#fff6a8"
        map={texture}
        alphaMap={texture}
        alphaTest={0.02}
        size={1.8}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
})

function Scene() {
  const phaseRef         = useRef(START_PHASE)
  const ambientRef       = useRef()
  const dirLightRef      = useRef()
  const starsRef         = useRef()
  const daySparklesRef   = useRef()
  const nightSparklesRef = useRef()
  const moonRef          = useRef()
  const moonCoreRef      = useRef()
  const moonHaloRef      = useRef()
  const moonLightRef     = useRef()

  useFrame(({ clock }) => {
    const phase = ((clock.elapsedTime % CYCLE) / CYCLE + START_PHASE) % 1
    phaseRef.current = phase

    const incl = getInclination(phase)
    const nightFade = 1 - smoothstep(0.35, 0.46, incl)

    // brightness: 0 at deep night, 1 at midday — smooth S-curve
    const brightness = smoothstep(0.37, 0.61, incl)

    // Ambient — smooth three-stop blend: night → warm dawn → white midday
    if (ambientRef.current) {
      ambientRef.current.intensity = 0.4 + brightness * 2.6
      if (brightness < 0.3) {
        _ambCol.lerpColors(NIGHT_AMB, DAWN_AMB, brightness / 0.3)
      } else {
        _ambCol.lerpColors(DAWN_AMB, DAY_AMB, (brightness - 0.3) / 0.7)
      }
      ambientRef.current.color.copy(_ambCol)
    }

    // Directional — same three-stop blend
    if (dirLightRef.current) {
      dirLightRef.current.intensity = 0.5 + brightness * 2.0
      if (brightness < 0.3) {
        _dirCol.lerpColors(NIGHT_DIR, DAWN_DIR, brightness / 0.3)
      } else {
        _dirCol.lerpColors(DAWN_DIR, DAY_DIR, (brightness - 0.3) / 0.7)
      }
      dirLightRef.current.color.copy(_dirCol)
    }

    if (starsRef.current) {
      starsRef.current.visible = nightFade > 0.01
      if (starsRef.current.material) {
        starsRef.current.material.transparent = true
        starsRef.current.material.opacity = nightFade
      }
    }
    if (daySparklesRef.current) daySparklesRef.current.visible = nightFade < 0.5

    const nightProgress = getNightProgress(phase)
    const moonFade = nightProgress == null ? 0 : smoothstep(0, 0.12, nightProgress) * (1 - smoothstep(0.86, 1, nightProgress))
    if (moonRef.current) {
      moonRef.current.visible = moonFade > 0.01
      moonRef.current.position.copy(getMoonPosition(phase))
    }
    if (moonCoreRef.current) moonCoreRef.current.opacity = moonFade
    if (moonHaloRef.current) moonHaloRef.current.opacity = moonFade * 0.12
    if (moonLightRef.current) moonLightRef.current.intensity = moonFade * 1.2
  })

  return (
    <>
      <ResponsiveCamera />
      <DynamicSky phaseRef={phaseRef} />

      <ambientLight ref={ambientRef} intensity={3} />
      <directionalLight ref={dirLightRef} position={[50, 80, -30]} intensity={2.5} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />

      <Stars ref={starsRef} radius={120} depth={60} count={7000} factor={7} saturation={0} fade speed={0.6} visible={false} />

      {/* Moon — core disc + soft halo + moonlight, only visible at night */}
      <group ref={moonRef} position={[-25, 52, -70]} visible={false}>
        <mesh>
          <sphereGeometry args={[3, 32, 32]} />
          <meshStandardMaterial ref={moonCoreRef} color="#fffff8" emissive="#fffff8" emissiveIntensity={2} roughness={0.9} transparent opacity={0} />
        </mesh>
        <mesh>
          <sphereGeometry args={[5, 32, 32]} />
          <meshStandardMaterial ref={moonHaloRef} color="#aabbff" emissive="#aabbff" emissiveIntensity={0.4} transparent opacity={0} depthWrite={false} />
        </mesh>
        <pointLight ref={moonLightRef} color="#ccd8ff" intensity={0} distance={350} decay={1} />
      </group>

      <Suspense fallback={null}>
        <Grass phaseRef={phaseRef} />

        <Sparkles ref={daySparklesRef} count={180} scale={[90, 14, 90]} position={[0, 3, 0]} size={2.5} speed={0.35} color="white" opacity={0.45} />
        <Fireflies ref={nightSparklesRef} count={36} phaseRef={phaseRef} />

        {/* Clouds visible day and night */}
        <Clouds material={THREE.MeshLambertMaterial} limit={600}>
          <Cloud position={[-40, 32,  5]}  speed={0.35} opacity={0.9}  segments={50} bounds={[18, 5, 7]} volume={12} color="white" />
          <Cloud position={[-15, 28, -10]} speed={0.4}  opacity={0.85} segments={48} bounds={[16, 4, 6]} volume={10} color="white" />
          <Cloud position={[10,  35, -20]} speed={0.25} opacity={0.8}  segments={55} bounds={[22, 6, 8]} volume={13} color="white" />
          <Cloud position={[35,  30,  0]}  speed={0.38} opacity={0.85} segments={50} bounds={[18, 5, 7]} volume={11} color="white" />
          <Cloud position={[55,  33, -15]} speed={0.3}  opacity={0.8}  segments={52} bounds={[20, 5, 7]} volume={12} color="white" />
          <Cloud position={[-55, 36, -25]} speed={0.42} opacity={0.85} segments={45} bounds={[16, 4, 6]} volume={10} color="white" />
          <Cloud position={[0,   40, -30]} speed={0.2}  opacity={0.75} segments={55} bounds={[26, 6, 9]} volume={14} color="white" />
        </Clouds>
      </Suspense>

      <OrbitControls target={[0, 2, 0]} minDistance={60} maxDistance={160} minPolarAngle={Math.PI / 2.5} maxPolarAngle={Math.PI / 2.5} />
    </>
  )
}

export default function App() {
  return (
    <div className="container">
      <Canvas gl={{ alpha: true }} camera={{ position: [40, 37, 28], fov: 50 }}>
        <Scene />
      </Canvas>

      <div className="brand-overlay" aria-label="Buko, a software company. Coming soon.">
        <div className="brand-topline" aria-hidden="true">
          <span>Software</span>
          <span>For</span>
          <span>Human</span>
          <span>Kind</span>
        </div>

        <main className="brand-lockup">
          <h1>Buko</h1>
          <p>A Software Company</p>
        </main>

        <div className="brand-footer" aria-label="@BukoHQ, coming soon, copyright 2026">
          <a href="https://instagram.com/bukohq" target="_blank" rel="noreferrer">
            @BukoHQ
          </a>
          <span>Coming Soon</span>
          <span>&copy;2026</span>
        </div>
      </div>
    </div>
  )
}
