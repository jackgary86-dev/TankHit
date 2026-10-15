# Mods

Drop-in vehicles and rounds as JSON, in exactly the shape of the built-in data (`src/data/vehicles/*.ts`, `src/data/rounds/index.ts`).

- **Browser:** open *Mods* in the top bar and drop the files in (they are remembered in that browser).
- **Desktop app:** copy the files into the `mods` folder shown in the Mods panel (`%APPDATA%/TankHit/mods` on Windows, `~/Library/Application Support/TankHit/mods` on macOS, `~/.config/TankHit/mods` on Linux). They load at startup.

A file with a same `id` as a built-in vehicle or round replaces it. Files are validated (plate geometry, ids, racks, crew zones, round fields) and errors are shown in the panel.

`example-vehicle.json` is the T-34-85 with the id `example-t34`; `example-round.json` is BR-365K with the id `example-br365k`. Copy, rename the ids, and edit.
