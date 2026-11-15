// Every limit in signals.ts and every parameter of the physiology engine points to one of these.
// status:
//   'verified' = we read the source (or NASA's own summary of it)
//   'partial'  = a real source exists, but the exact number still needs a full-text check
//   'demo'     = no source found: our own assumption, labelled as such in the interface
// Notes on each entry are in docs/RESEARCH.md (same ids).

export type SourceStatus = 'verified' | 'partial' | 'demo'

export interface Source {
  id: string
  title: string
  url?: string
  says: string
  status: SourceStatus
}

export const SOURCES: Record<string, Source> = {
  RAD_ORGAN_MODEL: {
    id: 'RAD_ORGAN_MODEL',
    title: 'NASA-TM-20220006594 (2022), TARIS organ RBE method',
    url: 'https://ntrs.nasa.gov/api/citations/20220006594/downloads/NASA-TM-20220006594.pdf',
    says: 'Organ-averaged absorbed dose in mGy is weighted by particle RBE and summed in mGy-Eq. This is downstream of radiation transport. Pulsar implements that aggregation, with synthetic inputs unless imported.',
    status: 'verified',
  },
  RAD_ORGAN_LIMITS: {
    id: 'RAD_ORGAN_LIMITS',
    title: 'NASA-STD-3001 Volume 1 Revision C, Table 4.8-1',
    url: 'https://www.nasa.gov/reference/4-0-human-performance/',
    says: 'Lens limits: 1000/2000/4000 mGy-Eq for 30 days/one year/career. Skin, blood-forming organs and circulatory system have distinct limits. CNS uses mGy and is not included in this RBE calculation. Limits do not imply no harm below them.',
    status: 'verified',
  },
  SANS_EXAM_CRITERIA: {
    id: 'SANS_EXAM_CRITERIA',
    title: 'NASA SANS 2023 clinical update',
    url: 'https://ntrs.nasa.gov/citations/20220014606',
    says: 'Early findings include peripapillary OCT thickness increase ≥20 µm, hyperopic shift ≥+0.75 D, chorioretinal folds or posterior globe flattening. These examination findings trigger review in Pulsar, not a diagnosis.',
    status: 'verified',
  },
  HCT_FLIGHT: {
    id: 'HCT_FLIGHT',
    title: 'Kunz et al., BMC Hematology 2017;17:12',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5590186',
    says: 'Red cell count, hemoglobin and hematocrit were higher during ISS flight than before flight (hematocrit about +10 to +12%). Values returned to pre-flight within 30 days of landing.',
    status: 'partial',
  },
  HCT_REF: {
    id: 'HCT_REF',
    title: 'Our assumption: the usual adult lab range for hematocrit',
    says: 'About 38.5-50% for the male reference body and 35-45% for the female one. Labs differ slightly, so we keep one range per body.',
    status: 'demo',
  },
  IMMUNE_WBC: {
    id: 'IMMUNE_WBC',
    title: 'Immune system alterations during 6-month ISS flight, npj Microgravity 2015',
    url: 'https://link.springer.com/content/pdf/10.1038/npjmgrav.2015.13.pdf',
    says: 'Blood from 23 astronauts was taken before, during and after 6-month ISS missions. White cell count was raised during flight. Other reports find lymphocyte counts unchanged or lower.',
    status: 'partial',
  },
  IMMUNE_DEMO: {
    id: 'IMMUNE_DEMO',
    title: 'Our assumption: white cells 40% above, or lymphocytes 40% below, own pre-flight value',
    says: 'No published in-flight action level found. Chosen so that the published direction of change (a rise) stays green.',
    status: 'demo',
  },
  VITD_NASA: {
    id: 'VITD_NASA',
    title: 'NASA flight surgeon vitamin D protocol (Tarver, NTRS 20130013531)',
    url: 'https://ntrs.nasa.gov/citations/20130013531',
    says: 'Defines deficiency as 25-hydroxyvitamin D below 20 ng/mL and insufficiency as 20 to 30 ng/mL, and notes astronauts get no sunlight aboard the ISS.',
    status: 'partial',
  },
  VITD_FLIGHT: {
    id: 'VITD_FLIGHT',
    title:
      'Rice, Zwart and Smith, vitamin D in real and simulated weightlessness (NTRS 20080026180); Smith et al. 2005, ISS nutritional status',
    url: 'https://ntrs.nasa.gov/api/citations/20080026180/downloads/20080026180.pdf',
    says: 'In 11 ISS astronauts taking vitamin D supplements, 25-hydroxyvitamin D was about 25% lower after 4-6 month flights than before.',
    status: 'partial',
  },
  MASS: {
    id: 'MASS',
    title: 'Our assumption: body mass more than 5% below own pre-flight value',
    says: 'No published in-flight action level found.',
    status: 'demo',
  },
  HCT_HIGH: {
    id: 'HCT_HIGH',
    title: 'Our assumption: hematocrit more than 20% above own pre-flight value',
    says: 'No published in-flight action level found. Chosen so that the published +10-12% shift stays green.',
    status: 'demo',
  },
  ONSD_REVIEW: {
    id: 'ONSD_REVIEW',
    title: 'Optic nerve sheath diameter and spaceflight (npj Microgravity 2022) + NASA NTRS report',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9537149/',
    says: 'Measurement methods are not standardised. A NASA report notes over half of US astronauts already measure above 6.0 mm before launch, so the Earth cut-off does not fit crews.',
    status: 'partial',
  },
  ONSD_CHANGE: {
    id: 'ONSD_CHANGE',
    title: 'Our assumption: sheath diameter 0.5 mm above own pre-flight value',
    says: 'No validated change-from-baseline threshold found. The 5.8 / 6.2 mm and 0.8 mm figures in our old notes have no source.',
    status: 'demo',
  },
  IJV_STUDY: {
    id: 'IJV_STUDY',
    title: 'Marshall-Goebel et al., JAMA Network Open 2019;2(11):e1915011',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6902784/',
    says: '11 ISS crew. 6 had stagnant or backward flow in the left neck vein around flight day 50. 1 had a blocking clot. Lower body negative pressure improved flow in 10 of 17 sessions.',
    status: 'verified',
  },
  IJV_CASE: {
    id: 'IJV_CASE',
    title: 'Aunon-Chancellor et al., N Engl J Med 2020 (clot found in flight)',
    url: 'https://www.lsuhsc.edu/newsroom/1ST%20Reported%20Occurrence%20and%20Treatment%20of%20Spaceflight%20Medical%20Risk.html',
    says: 'A neck-vein clot was found by routine research ultrasound about 2 months into a mission, with no symptoms. Treatment was directed by doctors on Earth.',
    status: 'verified',
  },
  CO2_LIMIT: {
    id: 'CO2_LIMIT',
    title: 'NASA OCHMO technical brief TB-004, Carbon Dioxide (NASA-STD-3001 Vol 2)',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf',
    says: 'Cabin CO2 must stay at or below 3 mmHg as a 1-hour average. Older limits were 3.8-7.5 mmHg.',
    status: 'verified',
  },
  CO2_HEADACHE: {
    id: 'CO2_HEADACHE',
    title: 'Law et al., J Occup Environ Med 2014 (ISS CO2 and headaches)',
    url: 'https://sciencedaily.com/releases/2014/05/140501100922.htm',
    says: 'Each 1 mmHg rise in CO2 doubled the odds of a reported headache. Keeping the 7-day average under 2.5 mmHg would keep headache risk under 1%.',
    status: 'verified',
  },
  RAD_RATE: {
    id: 'RAD_RATE',
    title: 'Zeitlin et al., Science 2013;340:1080 (Curiosity RAD, cruise to Mars)',
    url: 'https://www.swri.org/press-release/swri-led-team-calculates-radiation-exposure-associated-trip-mars',
    says: 'Average dose equivalent inside the spacecraft was about 1.8 mSv per day. A round trip would be about 0.66 Sv.',
    status: 'verified',
  },
  RAD_MOON: {
    id: 'RAD_MOON',
    title: "Zhang et al., Science Advances 2020;6(39):eaaz1334 (Chang'E-4, lunar surface)",
    url: 'https://www.science.org/doi/10.1126/sciadv.aaz1334',
    says: 'The first and so far only direct measurement on the lunar surface: an average dose equivalent of 1,369 microsievert a day, about 1.37 mSv. Measured in lunar daytime inside a lightly shielded lander, so a habitat could differ.',
    status: 'verified',
  },
  RAD_ISS: {
    id: 'RAD_ISS',
    title: 'ISS dose equivalent: DOSIS 3D (Zhang et al. 2020) and the ESA Active Dosimeter (2024)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10919969/',
    says: 'Three peer-reviewed measurements agree: 731 microsievert a day (DOSIS 3D), 758 plus or minus 24 (ESA Active Dosimeter, June 2017, with 620 in the Columbus module), and a review giving 0.5 to 1 mSv a day depending on solar activity and shielding. We use 0.73.',
    status: 'verified',
  },
  GRAVITY_PARTIAL: {
    id: 'GRAVITY_PARTIAL',
    title: 'Lee et al., Venous and arterial responses to partial gravity, Frontiers in Physiology 2020',
    url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7399573/',
    says: 'In parabolic flights, the neck vein grew wider step by step as gravity fell: 12 square mm seated in Earth gravity, 68 at a quarter of Earth gravity, 103 lying flat. Moon gravity (one sixth) was not tested, and how much gravity is enough to pull fluid back down is still an open question.',
    status: 'partial',
  },
  GRAVITY_DEMO: {
    id: 'GRAVITY_DEMO',
    title: 'Our assumption: effects in partial gravity are drawn as straight lines between measured points',
    says: 'Fluid shift: straight lines through the three neck-vein points above, with lying flat standing in for weightlessness. That gives 74% of the weightless shift on the Moon and 51% on Mars. Bone and muscle loss rates are multiplied by the share of gravity that is missing. Nobody has measured a long stay in partial gravity, so these are assumptions for the simulation only.',
    status: 'demo',
  },
  FLUID_SHIFT: {
    id: 'FLUID_SHIFT',
    title: 'NASA Human Health and Performance: cardiovascular health and vision',
    url: 'https://www.nasa.gov/directorates/esdmd/hhp/cardiovascular-and-vision',
    says: 'Upon entering weightlessness, approximately 2 liters of fluid move from the lower to the upper body. Crews describe a feeling of fullness in the face and head, and the shift does not let up in orbit.',
    status: 'verified',
  },
  FLUID_SHIFT_TIME: {
    id: 'FLUID_SHIFT_TIME',
    title: 'Our assumption: the fluid shift builds with a half-day time constant',
    url: 'https://docs.lib.purdue.edu/dissertations/AAI8814566',
    says: 'Leg volume measured in flight fell by 12.7% (2.2 L), most of it on mission day one. A NASA-hosted review (Melin et al. 2021) also places the shift in the first day or two. The 0.5 day constant is our own fit to "most on day one".',
    status: 'demo',
  },
  BONE_EXERCISE: {
    id: 'BONE_EXERCISE',
    title: 'Our assumption: a full resistance programme halves the bone loss rate',
    url: 'https://doi.org/10.1016/j.bone.2019.07.013',
    says: 'Sibonga et al., Bone 2019: exercise on the advanced resistive device prevented the loss at the femoral neck but not inside the hip, so the protection is partial. The halving is our own choice, not a measured figure.',
    status: 'demo',
  },
  MUSCLE_ISS: {
    id: 'MUSCLE_ISS',
    title: 'Trappe et al., J Appl Physiol 2009;106(4):1159-1168 (calf muscle after 6 months on the ISS)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/19150852/',
    says: 'MRI of nine crew members: calf muscle volume fell 13% (soleus -15%, gastrocnemius -10%) and peak power 32%, despite aerobic exercise about 5 hours a week and resistance exercise 3 to 6 days a week.',
    status: 'partial',
  },
  MUSCLE_BEDREST: {
    id: 'MUSCLE_BEDREST',
    title: 'Alkner and Tesch, Eur J Appl Physiol 2004;93:294-305 (90 days of bed rest)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/15338217/',
    says: 'Plantar flexor (calf) volume fell 29% without exercise and about 15% with resistance exercise. Bed rest on Earth is used to mimic weightlessness; it is not spaceflight.',
    status: 'partial',
  },
  MARS_MISSION_DOSE: {
    id: 'MARS_MISSION_DOSE',
    title: 'Hassler et al. 2014 as reported by Space.com: about 1.01 Sv for a full Mars mission',
    url: 'https://www.space.com/23875-mars-radiation-life-manned-mission.html',
    says: 'A 180-day cruise, a 500-day stay on the surface and a 180-day return would add up to about 1.01 sievert, from Curiosity RAD rates of about 1.84 mSv a day in cruise and 0.64 on the surface. Used here only to check that the engine adds dose correctly.',
    status: 'partial',
  },
  RAD_MARS_SURFACE: {
    id: 'RAD_MARS_SURFACE',
    title: 'Hassler et al., Science 2014;343:1244797 (Curiosity RAD, Mars surface)',
    url: 'https://www.swri.org/press-release/swri-scientists-publish-first-radiation-measurements-surface-mars',
    says: 'Average dose equivalent rate from galactic cosmic rays of 0.67 mSv a day on the Martian surface, August 2012 to June 2013. The planet and its thin atmosphere block part of the sky, so the surface rate is lower than in transit.',
    status: 'verified',
  },
  RAD_LIMIT: {
    id: 'RAD_LIMIT',
    title: 'NASA OCHMO radiation protection brief (NASA-STD-3001 Vol 1)',
    url: 'https://www.nasa.gov/sites/default/files/atoms/files/radiation_protection_technical_brief_ochmo.pdf',
    says: 'Career limit for an astronaut is 600 mSv effective dose, the same for every age and sex.',
    status: 'verified',
  },
  RAD_WATCH: {
    id: 'RAD_WATCH',
    title: 'Our assumption: amber at 50% of the career limit, red at 100%',
    says: 'The 600 mSv limit is real. The 50% early-warning step is our own choice.',
    status: 'demo',
  },
  SELF_TEST: {
    id: 'SELF_TEST',
    title: 'Our assumption: a self-test result worse than your own usual one',
    says: 'Each self-test compares a run with your first three, the way NASA compares in-flight cognitive tests with preflight baselines. How far is too far (for example 10% slower reactions or a 20% slower sit-to-stand) is our own choice. A flagged result asks for a repeat within 24 hours, as NASA does after a red cognitive test (MEDB 7.4).',
    status: 'demo',
  },
  SENSORIMOTOR: {
    id: 'SENSORIMOTOR',
    title: 'NASA Human Research Program, risk of altered sensorimotor and vestibular function',
    url: 'https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/',
    says: 'Balance, eye-head coordination and fine motor control change with each change of gravity. The risk is highest around these transitions, as after landing, and functional deficits after long flights can last about a week.',
    status: 'verified',
  },
  SLEEP: {
    id: 'SLEEP',
    title: 'Our assumption: 7-day average sleep under 6 hours',
    says: 'ISS crews are reported to sleep about 6 hours a night (Barger et al., Lancet Neurology 2014; not re-checked by us yet). The 6 hour line is our own choice.',
    status: 'demo',
  },
  URINE_TARGET: {
    id: 'URINE_TARGET',
    title: 'NASA renal stone studies: urine output target of 2 L a day or more',
    url: 'https://ntrs.nasa.gov/citations/19970003315',
    says: 'NASA papers advise enough fluid to pass at least 2 litres of urine a day (later documents say 2.0 to 2.5) to keep stone-forming salts dissolved.',
    status: 'partial',
  },
  URINE_RISK: {
    id: 'URINE_RISK',
    title: 'NASA risk report: renal stone formation in spaceflight',
    url: 'https://ntrs.nasa.gov/api/citations/20170004709/downloads/20170004709.pdf',
    says: 'The main causes in space are extra calcium in the urine from bone loss, and low urine volume.',
    status: 'partial',
  },
  BONE_LOSS: {
    id: 'BONE_LOSS',
    title: 'NASA Human Research Program: Risk of Spaceflight-Induced Bone Changes',
    url: 'https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/',
    says: 'Before modern resistance devices, crews on 4 to 6 month missions lost about 1 to 1.5% of bone density a month at the hip and spine. Resistance exercise reduces the loss but does not remove it. NASA states the same figure and notes that bone is scanned only before and after flight.',
    status: 'verified',
  },
  EXERCISE_PLAN: {
    id: 'EXERCISE_PLAN',
    title: 'Our assumption: at least 5 resistance sessions a week in flight',
    says: 'ISS crews exercise most days, but we have not confirmed the exact prescription in a NASA document. The cut-off is our own choice.',
    status: 'demo',
  },
  HAZARDS: {
    id: 'HAZARDS',
    title: 'NASA Human Research Program: the five hazards of human spaceflight',
    url: 'https://www.nasa.gov/hrp/hazards/',
    says: 'Space radiation, isolation and confinement, distance from Earth, gravity fields, and hostile closed environments.',
    status: 'verified',
  },
  MOOD: {
    id: 'MOOD',
    title: 'Our assumption: 7-day mood average under 2.5 out of 5',
    says: 'Mood is one of the indicators the challenge names. The scale and the cut-off are our own choice.',
    status: 'demo',
  },
  BASICS: {
    id: 'BASICS',
    title: 'Our assumption: ordinary Earth clinical limits for blood pressure, temperature and blood sugar',
    says: 'Fever from 38.0 C (red from 38.5), blood pressure high from 140/90 and low under 90, blood sugar low under 70 (red under 54) and high over 180 mg/dL. Common clinical conventions, not yet tied to a cited guideline, and not space-specific.',
    status: 'demo',
  },
  VITALS: {
    id: 'VITALS',
    title: 'Our assumption: general clinical convention for oxygen level and resting heart rate',
    says: 'Oxygen saturation under 94% (amber) or under 90% (red); resting heart rate over 100. Not space-specific and not yet tied to a cited guideline.',
    status: 'demo',
  },
}
