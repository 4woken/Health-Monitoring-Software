/** Some reference meshes have mixed face winding despite valid outward vertex normals. */
export function orientTriangles(positions: Float32Array, normals: Float32Array, source: Uint32Array) {
  const indices = source.slice()
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3
    const ux = positions[b] - positions[a],
      uy = positions[b + 1] - positions[a + 1],
      uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a],
      vy = positions[c + 1] - positions[a + 1],
      vz = positions[c + 2] - positions[a + 2]
    const nx = normals[a] + normals[b] + normals[c],
      ny = normals[a + 1] + normals[b + 1] + normals[c + 1],
      nz = normals[a + 2] + normals[b + 2] + normals[c + 2]
    if ((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < 0) {
      const swap = indices[i + 1]
      indices[i + 1] = indices[i + 2]
      indices[i + 2] = swap
    }
  }
  return indices
}
