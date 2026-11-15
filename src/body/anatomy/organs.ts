// Plain-language notes for each organ of the reference body, shown when an organ is selected.
// Mesh names come from the anatomy files (BodyParts3D and the HuBMAP reference organs).

export type DepthLayer = 'vessels' | 'organs' | 'skeleton'

export interface OrganNote {
  name: string
  /** What it does, in one or two sentences. */
  role: string
  /** What spaceflight changes, in one or two sentences. */
  inSpace: string
  layer: DepthLayer
}

const NOTES: Record<string, OrganNote> = {
  heart: {
    name: 'Heart',
    role: 'Pumps blood through the lungs and the rest of the body, about 60 to 80 times a minute at rest.',
    inSpace:
      'It works less against gravity, and over long flights it can become slightly rounder. Back on Earth, standing up can make some crew feel faint.',
    layer: 'organs',
  },
  aorta: {
    name: 'Aorta',
    role: 'The main artery leaving the heart. It carries oxygen-rich blood to the whole body.',
    inSpace: 'Blood volume falls early in flight, which shows up as a rise in the share of red cells.',
    layer: 'vessels',
  },
  'blood vessels': {
    name: 'Blood vessels',
    role: 'Arteries carry blood away from the heart and veins bring it back.',
    inSpace: 'Without gravity about two litres of fluid move toward the chest and head.',
    layer: 'vessels',
  },
  arteries: {
    name: 'Arteries',
    role: 'Carry blood away from the heart. Systemic arteries supply the head, trunk and limbs.',
    inSpace:
      'Without gravity the pressure no longer differs between head and feet, and the arteries of the neck and head see more blood than on Earth.',
    layer: 'vessels',
  },
  'leg veins': {
    name: 'Leg and foot veins',
    role: 'Deep veins and superficial veins return blood from the feet, calves and thighs toward the pelvis.',
    inSpace: 'The standing pressure difference between feet and chest falls in weightlessness.',
    layer: 'vessels',
  },
  veins: {
    name: 'Veins',
    role: 'Bring blood back to the heart. In the legs, valves and muscles push it upward.',
    inSpace:
      'About two litres of fluid move from the legs toward the chest and head, which fills the neck and head veins.',
    layer: 'vessels',
  },
  'left internal jugular vein': {
    name: 'Left jugular vein',
    role: 'A large neck vein that drains blood from the head.',
    inSpace:
      'Blood can slow down or flow backwards here in weightlessness, and a clot has been found on a routine ultrasound in flight.',
    layer: 'vessels',
  },
  'right internal jugular vein': {
    name: 'Right jugular vein',
    role: 'A large neck vein that drains blood from the head.',
    inSpace: 'It widens as fluid moves toward the head in weightlessness.',
    layer: 'vessels',
  },
  brain: {
    name: 'Brain',
    role: 'Controls the body, thinking, sleep and mood.',
    inSpace:
      'Fluid moving toward the head, cabin CO2, broken sleep and isolation can all show up as headaches, poor sleep or low mood.',
    layer: 'organs',
  },
  'left eyeball': {
    name: 'Left eye',
    role: 'Turns light into the signals the brain sees.',
    inSpace:
      'On long missions the back of the eye can flatten and the optic nerve sheath can swell, which can blur vision.',
    layer: 'organs',
  },
  'right eyeball': {
    name: 'Right eye',
    role: 'Turns light into the signals the brain sees.',
    inSpace:
      'On long missions the back of the eye can flatten and the optic nerve sheath can swell, which can blur vision.',
    layer: 'organs',
  },
  'right lung': {
    name: 'Right lung',
    role: 'Brings oxygen into the blood and removes carbon dioxide.',
    inSpace: 'Cabin air matters: raised CO2 is linked to headaches in station crews.',
    layer: 'organs',
  },
  'left lung': {
    name: 'Left lung',
    role: 'Brings oxygen into the blood and removes carbon dioxide.',
    inSpace: 'Cabin air matters: raised CO2 is linked to headaches in station crews.',
    layer: 'organs',
  },
  lungs: {
    name: 'Lungs',
    role: 'Bring oxygen into the blood and remove carbon dioxide.',
    inSpace: 'Cabin air matters: raised CO2 is linked to headaches in station crews.',
    layer: 'organs',
  },
  liver: {
    name: 'Liver',
    role: 'Processes nutrients and medicines and filters the blood.',
    inSpace: 'Medicines can behave differently in flight, one reason the onboard supply is chosen with care.',
    layer: 'organs',
  },
  pancreas: {
    name: 'Pancreas',
    role: 'Releases digestive enzymes and makes hormones, including insulin, that help regulate blood sugar.',
    inSpace: 'Open the blood sugar reading to see the value and how it was obtained.',
    layer: 'organs',
  },
  spleen: {
    name: 'Spleen',
    role: 'Filters old blood cells and helps the immune system respond to infection.',
    inSpace: 'The check-up follows immune signals over time. This model shows the position of the spleen.',
    layer: 'organs',
  },
  'costal cartilage': {
    name: 'Costal cartilage',
    role: 'Flexible cartilage extends from the front of the ribs and lets the chest wall move with each breath.',
    inSpace:
      'Use the breathing tool to follow breathing rate. The cartilage shown here is reference anatomy.',
    layer: 'skeleton',
  },
  stomach: {
    name: 'Stomach',
    role: 'Breaks food down before it moves on to the intestines.',
    inSpace: 'Appetite often drops, so body mass is followed to catch eating too little.',
    layer: 'organs',
  },
  'small intestine': {
    name: 'Small intestine',
    role: 'Absorbs most of the nutrients from food.',
    inSpace: 'Eating enough, and enough vitamin D without sunlight, is a daily concern on long flights.',
    layer: 'organs',
  },
  'large intestine': {
    name: 'Large intestine',
    role: 'Absorbs water and forms stool.',
    inSpace: 'Drinking enough also protects the kidneys, which work harder in flight.',
    layer: 'organs',
  },
  'right kidney': {
    name: 'Right kidney',
    role: 'Filters the blood into urine and balances fluids and salts.',
    inSpace:
      'Bone loss puts extra calcium in the urine, so drinking too little raises the risk of kidney stones.',
    layer: 'organs',
  },
  'left kidney': {
    name: 'Left kidney',
    role: 'Filters the blood into urine and balances fluids and salts.',
    inSpace:
      'Bone loss puts extra calcium in the urine, so drinking too little raises the risk of kidney stones.',
    layer: 'organs',
  },
  'urinary bladder': {
    name: 'Bladder',
    role: 'Stores urine until it is passed.',
    inSpace:
      'Daily urine volume is tracked: at least 2 litres a day helps keep stone-forming salts dissolved.',
    layer: 'organs',
  },
  'spinal cord': {
    name: 'Spinal cord',
    role: 'Carries nerve signals between the brain and the body.',
    inSpace: 'Back pain is common early in flight as the spine lengthens.',
    layer: 'organs',
  },
  skull: {
    name: 'Skull and jaw',
    role: 'Protects the brain and carries the face, the teeth and the jaw.',
    inSpace:
      'It carries no load, so it changes little. The fluid that moves toward the head raises the pressure inside it, which can reach the eyes.',
    layer: 'skeleton',
  },
  'rib cage': {
    name: 'Rib cage',
    role: 'Twelve pairs of ribs and the breastbone protect the heart and the lungs and move with every breath.',
    inSpace: 'The ribs carry little weight even on Earth, so they lose less bone than the hips and legs.',
    layer: 'skeleton',
  },
  'shoulder girdle': {
    name: 'Collarbones and shoulder blades',
    role: 'They join the arms to the trunk.',
    inSpace: 'Arms carry little weight in space, so these bones lose less density than the hips and legs.',
    layer: 'skeleton',
  },
  'arm bones': {
    name: 'Arm and hand bones',
    role: 'Thirty bones on each side, from the upper arm to the fingertips.',
    inSpace: 'They grip and push rather than carry the body, so they lose little bone in flight.',
    layer: 'skeleton',
  },
  pelvis: {
    name: 'Pelvis',
    role: 'Carries the weight of the trunk to the legs and protects the bladder.',
    inSpace:
      'Among the bones that lose the most density in weightlessness, about 1 to 1.5% a month without resistance exercise.',
    layer: 'skeleton',
  },
  'leg bones': {
    name: 'Leg and foot bones',
    role: 'Thigh bone, kneecap, shin bones and the 26 bones of each foot carry the body when standing and walking.',
    inSpace:
      'With no weight to carry, the top of the thigh bone loses density fastest. Resistance exercise is the main protection.',
    layer: 'skeleton',
  },
  'vertebral column': {
    name: 'Spine',
    role: 'Holds the body up and protects the spinal cord.',
    inSpace:
      'Without load it lengthens by a few centimetres, and hip and spine bone lose density unless resistance exercise is kept up.',
    layer: 'skeleton',
  },
}

/** The note for a mesh name, or a plain fallback for a part without one. */
export function organNote(meshName: string): OrganNote {
  return (
    NOTES[meshName] ?? {
      name: meshName.charAt(0).toUpperCase() + meshName.slice(1),
      role: 'Part of the reference anatomy.',
      inSpace: 'No specific spaceflight effect is followed for this part in the prototype.',
      layer: 'organs',
    }
  )
}

/** Skin remains anatomical depth zero. The two exterior stops are independently selectable suits. */
export const DEPTH_STOPS = ['EVA', 'IVA', 'Crew wear', 'Skin', 'Vessels', 'Organs', 'Skeleton'] as const
export const FIRST_DEPTH = -3
export const CREW_DEPTH = -1
export const LAST_DEPTH = FIRST_DEPTH + DEPTH_STOPS.length - 1

/** The selected system is opaque. Faint surrounding tissue gives it a location within the body. */
export function depthOpacity(layer: 'skin' | DepthLayer, depth: number): number {
  const stop = { skin: 0, vessels: 1, organs: 2, skeleton: 3 }[layer]
  const focus = Math.max(0, 1 - Math.abs(depth - stop))
  const context = (layer === 'skin' ? 0.115 : 0.055) * Math.min(1, depth)
  return focus + (1 - focus) * context
}

/** Older atlases store both lungs together. Newer ones allow inspection of either lung. */
export function matchesAnatomySelection(mesh: string, selection: string) {
  if (mesh === selection) return true
  if (selection === 'veins') return mesh.includes('vein')
  if (selection === 'arteries') return mesh === 'aorta'
  return selection === 'lungs' && (mesh === 'left lung' || mesh === 'right lung')
}

export function anatomyChoices(names: string[], layer: DepthLayer): string[] {
  const available = names.filter((name) => organNote(name).layer === layer)
  if (available.includes('left lung') && available.includes('right lung') && !available.includes('lungs'))
    available.push('lungs')
  return available.sort((a, b) => organNote(a).name.localeCompare(organNote(b).name))
}
