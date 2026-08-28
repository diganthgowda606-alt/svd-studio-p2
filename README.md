# Remix of Aura Harmony Gestures

Build a sophisticated, art-driven web-based gesture-controlled musical instrument experience called 'Aura Harmony.' The visual design must be entirely inspired by the warm, minimalist-modern interior space shown in image_0.png, utilizing its specific color palette for all UI elements and visualizations.

Color Palette Application (from image_0.png):

Primary Background: Use the mid-tone Greige/Warm Taupe from the color panel as the primary canvas color.

Typography and Light UI: Use the Cream/Off-White for all text and key outlines.

Accent and Interactive Colors: Use the deep Charcoal/Taupe and rich Sienna/Mahogany from the palette for interactive controls, sound visualizations, and selected states.

Core Concept: The website enables users to play two virtual instruments—a Minimalist Grand Piano and an Acoustic Guitar—using hand gestures captured by their webcam.

Technology Stack (prioritize frontend-native, low-latency):

Hand Tracking: Use the MediaPipe Hand Landmarker library for robust and accurate real-time hand-point tracking in the browser.

Audio Synthesis: Use a powerful, low-latency Web Audio API library (like Tone.js) as the core synthesizer and instrument sound source. Do not rely on external MIDI hardware or a heavy virtual synthesizer.

Detailed Functional Experience & Smooth Design:

Landing Page: An elegant, welcoming screen. Introduce the project name, Aura Harmony, and the concept. A simple prompt guides the user to the performance space.

The Performance Space: A clean, minimalist interface 'room' utilizing the palette. A subtle, integrated webcam preview (perhaps a stylized silhouette or masked shape) is visible.

Instrument 1: Minimalist Grand Piano:

Interface: A set of keys using the palette (cream white, charcoal black).

Gesture: Hand position (height) controls pitch, and a simple pinch gesture with the other hand triggers the key press.

Visual Flow: Successful key presses trigger smooth, flowing visual patterns (using Charcoal and Sienna tones) that visualize the sound waves, creating a tactile and 'living' response.

Instrument 2: Acoustic Guitar:

Interface: A minimalist representation of a few strings and frets.

Gesture: A combination of finger pinches on the "frets" and a full-hand strumming gesture in front of the virtual strings.

Visual Flow: Strummed strings visually vibrate, and sound visualizations flow outwards, creating a smooth and organic visual experience.

Integration & UI: A clean selector to switch between instruments, volume controls, and a prominent 'start' prompt. The entire design must maintain a minimalist and sophisticated feel, matching the room's ethos.

Smoothness Requirement: Implement fluid animations (CSS transitions, Framer Motion) for all state changes, key presses, and sound visualizations to create a 'flow' and ensure a smooth user experience. Track movements accurately to produce a proper, tuned sound with minimal latency. All UI components should use the color palette consistently.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://svd-studio-p2.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6ac516d0-67c7-4239-a79b-0c04c2b12618).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
