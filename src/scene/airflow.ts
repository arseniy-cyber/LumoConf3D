import * as THREE from 'three'
import type { SceneOptions } from '../shared/types'
import type { AirMount, CaseDimensions } from './models'

interface Stream {
  points: THREE.Points
  path: THREE.CatmullRomCurve3
  offset: number
  line: THREE.Line
}

export class Airflow {
  readonly root = new THREE.Group()
  private streams: Stream[] = []

  update(mounts: AirMount[], dimensions: CaseDimensions, options: SceneOptions) {
    this.clear()
    for (const mount of mounts) {
      const inbound = mount.location === options.fanLocation ? options.airflowDirection === 'intake' : ['front', 'side', 'bottom'].includes(mount.location)
      const color = inbound ? 0x69daeb : 0xfe9e84
      for (let index = 0; index < 4; index++) {
        const offset = new THREE.Vector3(mount.interior.z !== 0 ? (index - 1.5) * .21 : 0, mount.interior.y === 0 ? (index - 1.5) * .10 : 0, mount.interior.z === 0 ? (index - 1.5) * .23 : 0)
        const from = mount.center.clone().addScaledVector(mount.interior, -.43).add(offset)
        const start = mount.center.clone().addScaledVector(mount.interior, .25).add(offset)
        const along = start.clone().addScaledVector(mount.interior, .6 + index * .08)
        along.x -= .16
        const target = new THREE.Vector3(-dimensions.width * .09, dimensions.height * (.36 + index * .055), dimensions.depth * -.11)
        const path = new THREE.CatmullRomCurve3(inbound ? [from, start, along, target] : [target, along, start, from])
        const coordinates = new Float32Array(3 * 18)
        const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(coordinates, 3))
        const pointMaterial = new THREE.ShaderMaterial({
          uniforms: { tint: { value: new THREE.Color(color) } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexShader: `
            void main() {
              vec4 transformed = modelViewMatrix * vec4(position, 1.0);
              gl_Position = projectionMatrix * transformed;
              gl_PointSize = clamp(42.0 / -transformed.z, 1.5, 6.0);
            }
          `,
          fragmentShader: `
            uniform vec3 tint;
            void main() {
              float opacity = 1.0 - smoothstep(0.05, 0.5, length(gl_PointCoord - 0.5));
              gl_FragColor = vec4(tint, opacity * 0.88);
            }
          `,
        })
        const points = new THREE.Points(geometry, pointMaterial)
        points.frustumCulled = false
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(24)), new THREE.LineBasicMaterial({
          color, transparent: true, opacity: .31, depthWrite: false,
        }))
        this.streams.push({ points, path, offset: index * .127, line })
        this.root.add(line, points)
      }
    }
  }

  tick(time: number, speed: number, moving: boolean) {
    if (!this.root.visible) return
    const point = new THREE.Vector3()
    for (const { points, path, offset } of this.streams) {
      const attribute = points.geometry.getAttribute('position')
      for (let index = 0; index < attribute.count; index++) {
        const position = (index / attribute.count + (moving ? time * speed * .26 : 0) + offset) % 1
        path.getPoint(position, point)
        attribute.setXYZ(index, point.x, point.y, point.z)
      }
      attribute.needsUpdate = true
    }
  }

  clear() {
    for (const { points, line } of this.streams) {
      points.geometry.dispose()
      const pointMaterial = points.material as THREE.ShaderMaterial
      pointMaterial.dispose()
      line.geometry.dispose()
      const lineMaterial = line.material as THREE.LineBasicMaterial
      lineMaterial.dispose()
    }
    this.streams = []
    this.root.clear()
  }
}
