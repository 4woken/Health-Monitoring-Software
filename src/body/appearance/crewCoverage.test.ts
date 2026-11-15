import { BufferAttribute, BufferGeometry, Group } from 'three'
import { expect, it } from 'vitest'
import { crewCoverage } from './crewCoverage'

it('hides only fully clothed triangles and restores the complete mesh at another depth', () => {
  const skin = new BufferGeometry()
  skin.setAttribute('position', new BufferAttribute(new Float32Array(7 * 3), 3))
  skin.setIndex([0, 1, 2, 2, 3, 4, 4, 5, 6])
  const index = skin.getIndex()!
  const cover = crewCoverage(skin)
  const top = new Group()
  top.userData.coveredSkinVertices = [[0, 2]]
  const pants = new Group()
  pants.userData.coveredSkinVertices = [[4, 6]]

  function visibleTriangles() {
    const visible: string[] = []
    for (let i = skin.drawRange.start; i < skin.drawRange.count; i += 3) {
      visible.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)].join(','))
    }
    return visible.sort()
  }
  cover(top)
  expect(visibleTriangles()).toEqual(['2,3,4', '4,5,6'])
  cover()
  expect(visibleTriangles()).toEqual(['0,1,2', '2,3,4', '4,5,6'])
  cover(top)
  expect(visibleTriangles()).toEqual(['2,3,4', '4,5,6'])
  cover(pants)
  expect(visibleTriangles()).toEqual(['0,1,2', '2,3,4'])
  cover(new Group())
  expect(visibleTriangles()).toEqual(['0,1,2', '2,3,4', '4,5,6'])
})
