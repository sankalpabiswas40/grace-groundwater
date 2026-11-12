// Parts of a GRACE-FO satellite: positions traced from the Airbus DS layout diagram in
// NASA/JPL's press kit, descriptions and builders from the same press kit.
export const PRESS_KIT = 'https://www.jpl.nasa.gov/news/press_kits/grace-fo/mission/spacecraft/';
export const SAT_DIMS = { length: 3.123, widthBottom: 1.943, widthTop: 0.69, height: 0.78, massKg: 600.2 };

export type Shape = 'box' | 'tank' | 'cyl' | 'horn' | 'camera' | 'accel' | 'tma' | 'reflector';
export interface Part {
  id: string; name: string; group: string; shape: Shape;
  /** diagram coordinates: u = across (-1 port .. +1 starboard), v = along (0 front .. 1 rear) */
  u: number; v: number; size: [number, number, number]; mat: keyof typeof MATS;
  built: string; does: string;
}
export const MATS = {
  alu: { color: 0xb9bdc4, metalness: 0.85, roughness: 0.38 },
  dark: { color: 0x30343b, metalness: 0.55, roughness: 0.5 },
  gold: { color: 0xc8962c, metalness: 1.0, roughness: 0.32 },
  white: { color: 0xe4e3dc, metalness: 0.05, roughness: 0.6 },
  copper: { color: 0xb5713a, metalness: 0.9, roughness: 0.4 },
  blue: { color: 0x2f5d8a, metalness: 0.5, roughness: 0.45 },
};
export const GROUPS = ['Ranging', 'Laser link', 'Accelerometer', 'Attitude', 'Propulsion', 'Power', 'Data and radio'];

// Positions read off the Airbus DS diagram (top view, front of the satellite at v = 0).
export const PARTS: Part[] = [
  { id: 'horn', name: 'K/Ka-band ranging horn', group: 'Ranging', shape: 'horn', u: 0, v: 0.02, size: [0.3, 0.3, 0.34], mat: 'alu', built: 'Microwave assembly: SSL, USA',
    does: 'Sends and receives microwave signals at 24 GHz (K-band) and 32 GHz (Ka-band) to the other satellite. From these the pair tracks changes in their separation to about one micron. Two frequencies are used so the effect of the ionosphere can be corrected.' },
  { id: 'mwa', name: 'Microwave assembly', group: 'Ranging', shape: 'box', u: 0, v: 0.12, size: [0.26, 0.14, 0.2], mat: 'dark', built: 'SSL, USA',
    does: 'The radio-frequency front end of the ranging instrument: waveguide feeds and redundant transceivers that connect to the horn.' },
  { id: 'uso1', name: 'Ultra-stable oscillator', group: 'Ranging', shape: 'box', u: -0.56, v: 0.06, size: [0.24, 0.14, 0.14], mat: 'copper', built: 'Johns Hopkins APL, USA',
    does: 'One of a redundant pair. It is the frequency and clock reference for the ranging measurement, so the whole experiment depends on its stability.' },
  { id: 'uso2', name: 'Ultra-stable oscillator (spare)', group: 'Ranging', shape: 'box', u: 0.58, v: 0.06, size: [0.24, 0.14, 0.14], mat: 'copper', built: 'Johns Hopkins APL, USA',
    does: 'The second of the redundant pair of frequency references.' },
  { id: 'ipu1', name: 'Instrument processing unit', group: 'Ranging', shape: 'box', u: 0.58, v: 0.145, size: [0.28, 0.2, 0.26], mat: 'blue', built: 'JPL, USA',
    does: 'Does the digital signal processing for the K/Ka-band ranging and GPS signals, and provides timing.' },
  { id: 'ipu2', name: 'Instrument processing unit (second)', group: 'Ranging', shape: 'box', u: -0.45, v: 0.145, size: [0.28, 0.2, 0.26], mat: 'blue', built: 'JPL, USA',
    does: 'The matching unit on the port side of the diagram.' },

  { id: 'laser', name: 'Laser', group: 'Laser link', shape: 'box', u: 0.5, v: 0.25, size: [0.32, 0.12, 0.18], mat: 'gold', built: 'Tesat, Germany',
    does: 'Emits about 25 mW of infrared light at 1064 nm for the laser ranging interferometer, an experimental instrument that could improve ranging precision by at least ten times.' },
  { id: 'bench', name: 'Optical bench and electronics', group: 'Laser link', shape: 'box', u: 0.28, v: 0.3, size: [0.2, 0.1, 0.16], mat: 'alu', built: 'AEI / DLR / STI, Germany',
    does: 'Routes, detects and points the laser beams, using a steering mirror and photoreceivers.' },
  { id: 'cavity', name: 'Laser reference cavity', group: 'Laser link', shape: 'cyl', u: 0.6, v: 0.37, size: [0.17, 0.26, 0.17], mat: 'alu', built: 'Ball Aerospace, USA',
    does: 'An optical cavity that stabilises the wavelength of the laser, so that tiny changes in distance are not confused with changes in the light itself.' },
  { id: 'lrp', name: 'Laser ranging processor', group: 'Laser link', shape: 'box', u: -0.44, v: 0.26, size: [0.15, 0.2, 0.26], mat: 'gold', built: 'JPL, USA',
    does: 'Measures the phase of the laser interferometer, controls the laser frequency, steers the mirror and establishes the optical link.' },
  { id: 'tma', name: 'Triple mirror assembly', group: 'Laser link', shape: 'tma', u: 0.05, v: 0.42, size: [1.2, 0.1, 0.1], mat: 'alu', built: 'AEI / STI, Germany',
    does: 'Three mirrors arranged like the corner of a cube. They carry the laser beam around the microwave instrument and send it back exactly parallel to the incoming beam.' },

  { id: 'acc', name: 'Accelerometer', group: 'Accelerometer', shape: 'accel', u: 0.04, v: 0.42, size: [0.3, 0.26, 0.3], mat: 'gold', built: 'ONERA, France',
    does: 'A three-axis electrostatic accelerometer placed at the centre of gravity. It measures the forces that are not gravity, such as air drag and sunlight pressure, so they can be separated from the gravity signal.' },
  { id: 'icu', name: 'Accelerometer control unit', group: 'Accelerometer', shape: 'box', u: -0.5, v: 0.37, size: [0.18, 0.18, 0.32], mat: 'white', built: 'ONERA, France',
    does: 'The electronics that operate the accelerometer and read out its measurements.' },

  { id: 'cam1', name: 'Star camera', group: 'Attitude', shape: 'camera', u: -0.52, v: 0.655, size: [0.2, 0.24, 0.2], mat: 'dark', built: 'Technical University of Denmark',
    does: 'One of three camera heads that find the satellite’s orientation by tracking the stars.' },
  { id: 'cam2', name: 'Star camera', group: 'Attitude', shape: 'camera', u: 0.6, v: 0.655, size: [0.2, 0.24, 0.2], mat: 'dark', built: 'Technical University of Denmark',
    does: 'The second of three star camera heads.' },
  { id: 'cam3', name: 'Star camera', group: 'Attitude', shape: 'camera', u: 0, v: 0.585, size: [0.2, 0.24, 0.2], mat: 'dark', built: 'Technical University of Denmark',
    does: 'The third star camera head. The original GRACE satellites had two.' },
  { id: 'gyro', name: 'Gyro unit', group: 'Attitude', shape: 'box', u: 0.6, v: 0.74, size: [0.16, 0.14, 0.16], mat: 'copper', built: 'Astrium SAS, France',
    does: 'Provides rotation-rate information on three axes.' },

  { id: 'tank1', name: 'Nitrogen tank', group: 'Propulsion', shape: 'tank', u: 0.04, v: 0.31, size: [0.5, 0.5, 0.5], mat: 'gold', built: 'Part of the cold-gas system',
    does: 'Holds part of the 31.3 kg of nitrogen gas used by the cold-gas thrusters: twelve small ones for pointing and two on the rear panel for adjusting the orbit.' },
  { id: 'tank2', name: 'Nitrogen tank', group: 'Propulsion', shape: 'tank', u: 0.04, v: 0.69, size: [0.5, 0.5, 0.5], mat: 'gold', built: 'Part of the cold-gas system',
    does: 'The second nitrogen tank. In the layout diagram the two tanks sit in front of and behind the accelerometer.' },

  { id: 'pdu', name: 'Power distribution unit', group: 'Power', shape: 'box', u: -0.38, v: 0.55, size: [0.34, 0.2, 0.3], mat: 'alu', built: 'Airbus, Germany',
    does: 'Part of the power system. Solar cells covering the top and sides of the satellite supply about 355 W on average.' },
  { id: 'pcu', name: 'Power conditioning unit', group: 'Power', shape: 'box', u: 0.48, v: 0.55, size: [0.34, 0.2, 0.3], mat: 'alu', built: 'Airbus, Germany',
    does: 'Part of the power system, built by Airbus together with the power distribution unit.' },
  { id: 'battery', name: 'Battery', group: 'Power', shape: 'box', u: 0.5, v: 0.885, size: [0.32, 0.22, 0.4], mat: 'white', built: 'ABSL, England',
    does: 'A 78 Ah lithium-ion battery that stores surplus energy from the solar panels.' },

  { id: 'obc', name: 'On-board computer', group: 'Data and radio', shape: 'box', u: -0.2, v: 0.885, size: [0.74, 0.2, 0.4], mat: 'dark', built: 'TASI, Italy',
    does: 'The central processor. It manages science and housekeeping data and detects and recovers from faults.' },
  { id: 'rfea', name: 'Radio electronics', group: 'Data and radio', shape: 'box', u: -0.44, v: 0.735, size: [0.2, 0.16, 0.22], mat: 'blue', built: 'STT, Germany',
    does: 'The S-band radio, with two redundant transceivers, that links the satellite to ground stations.' },
  { id: 'lrr', name: 'Laser retro-reflector', group: 'Data and radio', shape: 'reflector', u: 0, v: 0.5, size: [0.12, 0.08, 0.12], mat: 'alu', built: 'GFZ, Germany',
    does: 'Four corner-cube prisms in a small pyramid on the underside. Ground stations bounce laser pulses off it to check the orbit independently.' },
];

