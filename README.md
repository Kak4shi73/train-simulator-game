# Indian Train Simulator (Web)

Lightweight browser-based Indian train simulator with smooth Canvas graphics, horn audio, signals, stations, platforms, passengers, speedometer, and next-station distance monitoring.

## Run

- Double-click `index.html` to run locally, or
- Serve the folder with any static server (recommended for audio):
  - Python: `python -m http.server 5500`
  - Node: `npx http-server -p 5500 --yes`

Then open `http://localhost:5500/`.

## Controls

- Throttle up: W or Arrow Up
- Throttle down: S or Arrow Down
- Brake (hold): B
- Horn: H or Space
- On-screen buttons also available in the bottom-right.

## HUD

- Speed (km/h), Throttle (%), Brake (%)
- Current/Next station and distance to next (km)
- Passengers count
- Signal aspect (G/Y/R)
- Rule hints (e.g., caution for yellow, stop for red, horn near crossings)

## Features

- 2D parallax scenery, tracks, stations, signals, crossings, train sprite, smoke
- Physics: throttle acceleration, brakes, natural drag, speed enforcement
- Rules: station speed limits, approach slowing, signal compliance, SPAD emergency brake, horn near level crossings
- Dwell times and passenger exchange at stations
- Max speed: 1000 km/h (as requested)

## Route (Mumbai CSMT → Pune Jn)

Cumulative rail distance, approximate, based on India Rail Info shortest-route data:

- Mumbai CSMT: 0.00 km
- Dadar: 9.01 km
- Thane: 34.00 km
- Kalyan Jn: 51.20 km
- Karjat: 76.86 km
- Lonavala: 104.69 km
- Shivajinagar: 165.93 km
- Pune Jn: 168.37 km

Note: Distances are rounded and simplified for gameplay. Some trains/routes may use alternates (e.g., via Panvel) leading to different totals.

## Tips

- Begin braking early when entering station zones to stop smoothly on the platform
- Obey caution (Y) and stop (R) signals to avoid penalties and emergency braking
- Use the horn when the HUD warns of a nearby level crossing

## Tech

- Plain HTML/CSS/JS, no build step
- Canvas2D with DPR scaling for crisp rendering
- WebAudio horn synthesis (user interaction may be required by the browser to start audio)

## License

MIT 