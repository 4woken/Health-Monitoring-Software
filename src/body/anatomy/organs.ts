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
    role: 'Arteries carry blood away from the heart; veins bring it back.',
    inSpace: 'Without gravity about two litres of fluid move toward the chest and head.',
    layer: 'vessels',
  },
  arteries: {
    name: 'Arteries',
    role: 'Carry oxygen-rich blood from the heart to every part of the body, from the carotids in the neck to the feet.',
    inSpace:
      'Without gravity the pressure no longer differs between head and feet, and the arteries of the neck and head see more blood than on Earth.',
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

/** Depth stops from the outside in, as in anatomy atlases. */
export const DEPTH_STOPS = ['Skin', 'Vessels', 'Organs', 'Skeleton'] as const

/** At a stop only that layer is drawn. Dragging blends its two neighbours. */
export function depthOpacity(layer: 'skin' | DepthLayer, depth: number): number {
  const stop = { skin: 0, vessels: 1, organs: 2, skeleton: 3 }[layer]
  return Math.max(0, 1 - Math.abs(depth - stop))
}
