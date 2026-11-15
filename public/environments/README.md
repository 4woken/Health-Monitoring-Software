# Habitat photographs and NASA-inspired concepts

All five habitat pictures are served locally. The spacecraft and the space station use NASA photographs. The rover and the two surface bases use new interior illustrations generated with the built-in `imagegen` tool from NASA reference photographs. These are fictional architectural concepts, not documentary images or validated NASA designs. The original photographs are unchanged and keep the downloaded pixels. The interface fits each picture with CSS `object-fit: cover`, and blurs it slightly behind the 3D body.

The habitat is independent of the destination, the mission physics and the health rules: it never changes the body. The body and the markers are drawn by the app over the picture; they are not part of the NASA photographs. NASA has not reviewed, endorsed or certified this software.

## Pictures shown in the app

| Habitat       | Local file                 | Type                                      | Visual references                                  | Shown first for                  |
| ------------- | -------------------------- | ----------------------------------------- | -------------------------------------------------- | -------------------------------- |
| Spacecraft    | `nasa-orion.jpg`           | NASA photograph of an Earth-based mock-up | Orion                                              | Cruise to Mars                   |
| Space station | `nasa-destiny.jpg`         | NASA photograph in orbit                  | ISS Destiny laboratory                             | Orbit, and behind the crew list  |
| Rover         | `concept-rover-v1.png`     | AI-generated lunar rover interior         | SEV exterior, Orion cabin, Apollo 17 landscape     | None: chosen in the habitat menu |
| Moon base     | `concept-moon-base-v1.png` | AI-generated lunar habitat interior       | HDU exterior, CHAPEA interior, Apollo 17 landscape | Moon                             |
| Mars base     | `concept-mars-base-v1.png` | AI-generated Mars habitat interior        | CHAPEA interior, Curiosity landscape               | Mars                             |

Under a generated picture, the caption reads "a generated illustration based on NASA images, not a NASA design". Its link leads to the NASA page of one of the reference photographs, not to a claimed NASA original of the generated scene. The tool, the input images and the exact prompts are recorded in [GENERATION.md](GENERATION.md).

## Source photographs and context

Downloaded on 14 November 2026. The Orion and Destiny files are used directly; SEV, HDU and CHAPEA are retained as generation references.

| Local file         | Actual scene                                                                                                                          | Credit             | Official source                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `nasa-orion.jpg`   | Orion Medium Fidelity Mockup at Johnson Space Center on Earth, photographed 11 May 2016; NASA ID `jsc2022e044969`                     | NASA               | [Image library record](https://images.nasa.gov/details/jsc2022e044969), [Inside Orion gallery](https://www.nasa.gov/gallery/inside-orion/)  |
| `nasa-destiny.jpg` | Destiny laboratory aboard the ISS, Expedition 7, 3 August 2003; NASA ID `iss007e11800`                                                | NASA               | [Image library record](https://images.nasa.gov/details/iss007e11800)                                                                        |
| `nasa-sev.jpg`     | Space Exploration Vehicle prototype at Black Point Lava Flow, Arizona, during the 2008 Desert RATS field test; image `jsc2008e139397` | NASA               | [NASA Robotic Systems Technology Branch](https://www.nasa.gov/software-robotics-and-simulation-division/robotic-systems-technology-branch/) |
| `nasa-hdu.jpg`     | Habitat Demonstration Unit and X-Hab loft during the 2011 Desert RATS field test on Earth                                             | NASA               | [Deep Space Habitat and X-Hab Loft](https://www.nasa.gov/image-article/deep-space-habitat-x-hab-loft/)                                      |
| `nasa-chapea.jpg`  | Recreational area in the CHAPEA Mars habitat analogue at Johnson Space Center on Earth; image `jsc2022e090462`                        | NASA/Bill Stafford | [NASA Human Systems Integration Division](https://www.nasa.gov/human-systems-integration-division/)                                         |

Two additional terrain references are retained in `references/`:

- `references/nasa-moon.jpg`: [Apollo 17 Astronaut's Snapshot of Taurus-Littrow Valley](https://science.nasa.gov/asset/hubble/apollo-17-astronauts-snapshot-of-taurus-littrow-valley/), photographed in December 1972. Published credit: **NASA, ESA, and J. Garvin (NASA/GSFC)**. Used for grey regolith, hills and an airless black sky. The generated scenes do not reproduce calibration crosses or the astronaut/rover in the photograph.
- `references/nasa-mars.jpg`: [A Dramatic View of Mars' Mount Sharp](https://science.nasa.gov/resource/a-dramatic-view-of-mars-mount-sharp/), Curiosity panorama taken on 13 October 2019, **NASA/JPL-Caltech/MSSS**. Used for rock layers and terrain colour. The source is white-balanced and brightened; the generated scene is not a scientific reconstruction of lighting or atmosphere.

Three NASA photographs in `eva/` are the views outside the helmet in the AR view:

- `eva/nasa-earth-limb-iss.jpg`: Earth's limb above the Pacific Ocean off Chile, with part of Japan's Kibo laboratory module and its Exposed Facility, photographed from the International Space Station on 21 November 2020; NASA ID `iss064e006316`, credit **NASA**. [Image library record](https://images.nasa.gov/details/iss064e006316)
- `eva/nasa-orion-earth-moon.jpg`: Orion with the Moon and the Earth in the distance on flight day 13 of Artemis I, 28 November 2022, at its farthest from Earth; NASA ID `art001e000672`, credit **NASA**. [Image library record](https://images.nasa.gov/details/art001e000672)
- `eva/nasa-mars-curiosity.jpg`: "Mount Sharp 'Photobombs' Curiosity", the rover's self-portrait on Vera Rubin Ridge, January 2018; `PIA22207`, credit **NASA/JPL-Caltech/MSSS**. [Image library record](https://images.nasa.gov/details/PIA22207)

The Moon view of the AR view is `references/nasa-moon.jpg`. The files are the "large" JPEGs of the NASA image library, unchanged.

The habitat concepts are invented interiors inspired by terrestrial prototypes and real lunar/Martian landscapes. They do not show bases that already exist on the Moon or Mars.

## Downloaded files

- Orion: [NASA-hosted medium JPEG](https://images-assets.nasa.gov/image/jsc2022e044969/jsc2022e044969~medium.jpg).
- Destiny: [NASA-hosted medium JPEG](https://images-assets.nasa.gov/image/iss007e11800/iss007e11800~medium.jpg).
- SEV: [NASA-hosted JPEG](https://www.nasa.gov/wp-content/uploads/2023/06/295224main-jsc2008e139397.jpg?w=2048).
- HDU: [NASA-hosted JPEG](https://www.nasa.gov/wp-content/uploads/2023/03/638872main_habitat_xhabloft_2011_full.jpg).
- CHAPEA: [NASA-hosted JPEG](https://www.nasa.gov/wp-content/uploads/2024/02/jsc2022e090462-1.jpg?w=1536).
- Apollo 17: [NASA-hosted 1280px rendition](https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2005/10/STScI-01EVVM9G0CWEZJSKM1YBTQDZ76.tif/jcr:content/renditions/cq5dam.web.1280.1280.jpeg).
- Curiosity: [NASA-hosted 1280px rendition](https://assets.science.nasa.gov/content/dam/science/psd/mars/resources/detail_files/2/5/25183_PIA23898-1280.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg).

## Use and related resources

These photographs are used for educational illustration under the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/), with source acknowledgements. NASA identifiers and third-party material have separate restrictions; these assets are not covered by any project-wide claim of ownership. Retain the listed credits and consult the guidelines before repurposing the images for advertising or merchandise.

- [NASA Image and Video Library](https://images.nasa.gov/): photographs and media records.
- [NASA 3D Resources](https://science.nasa.gov/3d-resources/): models, including the [Habitat Demonstration Unit](https://science.nasa.gov/3d-resources/habitat-demonstration-unit/). These 3D scene models have not been integrated; the five current habitat pictures are 2D images.
