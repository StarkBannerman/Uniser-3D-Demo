/**
 * How quickly a scene plays out.
 *
 * Two of the three things that make a scene take time are *design*: the fade a
 * light ramps over, and the pause between a staged scene's beats. Both were
 * authored for a showroom film — two to four seconds a fade, two seconds a
 * beat — and that is far too slow for a salesperson clicking through a demo in
 * front of a customer. The client's ask is that pressing a scene reads as
 * instant.
 *
 * The third thing is not design and is not scaled here. A blind takes eight and
 * a half seconds to close because that is how long the motor takes; a
 * projection screen takes six. Those live in `travelMs` and `screenTravelMs`
 * and `resolveFade` returns them untouched, because a demo that closes a
 * curtain in two seconds is selling hardware that does not exist.
 *
 * So these two numbers compress the choreography and leave the physics alone.
 * The scenes keep their relative rhythm — a slow "All Off" is still the
 * slowest thing in its room, a snappy "Party" still the quickest — they just
 * all happen sooner. `scripts/verify-sim.mts` asserts the result: every scene
 * that drives nothing but light settles inside two seconds.
 */
export const PACE = {
  /** Multiplies every light fade. 0.35 takes a 4 s "All Off" to 1.4 s. */
  fade: 0.35,
  /** Multiplies the pause between a staged scene's beats. */
  hold: 0.38,
} as const;

/** The authored fade, at demo pace. */
export const paceFade = (ms: number): number => Math.round(ms * PACE.fade);

/** The authored pause between beats, at demo pace. */
export const paceHold = (ms: number): number => Math.round(ms * PACE.hold);
