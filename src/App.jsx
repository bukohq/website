import React, { Suspense, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import { Sky, OrbitControls, Cloud, Clouds, Stars, Sparkles } from "@react-three/drei"
import Grass from "./Grass"
import "./styles.css"

const CYCLE = 120

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

// Sky isolated so only it re-renders on inclination change
function DynamicSky({ phaseRef }) {
  const [incl, setIncl]           = useState(0.44)
  const [turbidity, setTurbidity] = useState(10)
  const [rayleigh, setRayleigh]   = useState(0.8)
  const [isNight, setIsNight]     = useState(false)
  const lastNight = useRef(false)
  const lastIncl  = useRef(0.44)

  useFrame(() => {
    const newIncl = 0.44 + 0.17 * Math.sin(phaseRef.current * Math.PI * 2)
    const night   = newIncl < 0.40
    const dp      = night ? 0 : Math.min(1, (newIncl - 0.40) / 0.21)

    // Update sky every frame for perfectly smooth transitions
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

function Scene() {
  const phaseRef         = useRef(0)
  const ambientRef       = useRef()
  const dirLightRef      = useRef()
  const starsRef         = useRef()
  const daySparklesRef   = useRef()
  const nightSparklesRef = useRef()
  const moonRef          = useRef()

  useFrame(({ clock }) => {
    const phase = (clock.elapsedTime % CYCLE) / CYCLE
    phaseRef.current = phase

    const incl = 0.44 + 0.17 * Math.sin(phase * Math.PI * 2)
    const night = incl < 0.40

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

    if (starsRef.current)         starsRef.current.visible         = night
    if (daySparklesRef.current)   daySparklesRef.current.visible   = !night
    if (nightSparklesRef.current) nightSparklesRef.current.visible = night
    if (moonRef.current)          moonRef.current.visible          = night
  })

  return (
    <>
      <DynamicSky phaseRef={phaseRef} />

      <ambientLight ref={ambientRef} intensity={3} />
      <directionalLight ref={dirLightRef} position={[50, 80, -30]} intensity={2.5} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />

      <Stars ref={starsRef} radius={120} depth={60} count={6000} factor={5} saturation={0} fade speed={0.6} visible={false} />

      {/* Moon — core disc + soft halo + moonlight, only visible at night */}
      <group ref={moonRef} position={[-25, 52, -70]} visible={false}>
        <mesh>
          <sphereGeometry args={[3, 32, 32]} />
          <meshStandardMaterial color="#fffff8" emissive="#fffff8" emissiveIntensity={2} roughness={0.9} />
        </mesh>
        <mesh>
          <sphereGeometry args={[5, 32, 32]} />
          <meshStandardMaterial color="#aabbff" emissive="#aabbff" emissiveIntensity={0.4} transparent opacity={0.12} depthWrite={false} />
        </mesh>
        <pointLight color="#ccd8ff" intensity={1.2} distance={350} decay={1} />
      </group>

      <Suspense fallback={null}>
        <Grass phaseRef={phaseRef} />

        <Sparkles ref={daySparklesRef}   count={180} scale={[90, 14, 90]} position={[0, 3, 0]} size={2.5} speed={0.35} color="white"   opacity={0.45} />
        <Sparkles ref={nightSparklesRef} count={180} scale={[90, 14, 90]} position={[0, 3, 0]} size={5}   speed={0.12} color="#99ffaa" opacity={0.85} visible={false} />

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

      <OrbitControls minPolarAngle={Math.PI / 2.5} maxPolarAngle={Math.PI / 2.5} />
    </>
  )
}

export default function App() {
  return (
    <div className="container">
      <Canvas camera={{ position: [15, 15, 10] }}>
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
