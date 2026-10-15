# TankHit

**Play it:** https://jackgary86-dev.github.io/TankHit/

Armor penetration sandbox. Pick a tank, a round and an angle, fire, then watch an X-ray cutaway replay of the penetrator, spall, ballistic-gel crew dummies and ammunition cook-off.

```bash
npm install
npm run dev     # play at http://localhost:5173
npm test        # simulation unit tests
npm run build   # production build in dist/
```

## Modes

- **Sandbox** – free fire, every round unlocked; damage carries over until you hit *Repair vehicle*.
- **Challenges** – six puzzles with fixed rounds/range and a shot limit; 1–3 stars by shots used.
- **Compare Rounds** – fire up to four rounds at the same point on a fresh tank with the same seed and compare side by side.

## Controls

| Key | Action |
| --- | --- |
| Mouse drag / wheel | Orbit / zoom |
| Click armor | Lock aim point (hover previews LOS and penetration) |
| Space | Fire (or Compare) |
| Esc | Clear aim |
| X | Toggle X-ray |
| C | Section plane: off / along shot / facing camera |
| H | Armor thickness heatmap |
| P / Enter | Play / pause replay |
| A / D | Previous / next shot |
| W / S (+Shift) | Ride the camera along the shot path |
| R | Reset camera |
| M | Mute |

## Vehicles

T-34-85, IS-3, T-72B and M1 Abrams – each is a data file in `src/data/vehicles/` built with the helpers in `src/data/builder.ts`. Add a tank by adding a file and registering it in `src/data/vehicles/index.ts`.

## Simulation

`src/sim/` is pure TypeScript (no three.js) and fully unit-tested:

- **Kinetic** – simplified Lanz–Odermatt (long rods, DU self-sharpening) and de Marre (full-calibre AP/APHE), velocity drop-off, normalization, ricochet and overmatch.
- **Chemical** – HEAT jets (standoff loss, ERA, composite CE multipliers), HESH scabbing, APHE fuze delay bursts, HE blast and thin-plate penetration.
- **Spall** – cones raycast through modules and gel dummies with energy loss per hit.
- **Crew** – zone HP, wound channels, incapacitation and station loss.
- **Cook-off** – ignition rolls, propagation through racks, detonation or blow-out-panel venting.

See [PROMPT.md](PROMPT.md) for the original design brief.
