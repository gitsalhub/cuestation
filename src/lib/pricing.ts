// Centralized pricing engine
export type Slab = { minutes: number; players: number; price: number };
export type RateLike = {
  hourly_rate?: number | null;
  slabs?: Slab[] | null;
  grace_minutes?: number | null;
  cooling_minutes?: number | null;
  cooling_amount?: number | null;
};
export type PlayerSegment = { players: number; started_at: string; ended_at?: string | null };
export type OfferLike = {
  id?: string;
  offer_type: string;
  value: number;
  min_minutes?: number | null;
  free_minutes?: number | null;
};

export function priceForElapsed(
  rate: RateLike | undefined | null,
  players: number,
  elapsedMinutes: number
): number {
  if (!rate) return 0;
  const grace = Math.max(0, Number(rate.grace_minutes || 0));
  const slabs = (rate.slabs || []).filter((s) => Number(s.players) === players);
  if (slabs.length) {
    const sorted = [...slabs].sort((a, b) => a.minutes - b.minutes);
    // Slab semantics: "₹price up to X minutes". Grace globally delays every
    // slab transition by `grace` minutes (slab end becomes minutes + grace).
    const band = sorted.find((s) => elapsedMinutes <= Number(s.minutes) + grace);
    if (band) return Number(band.price);
    // Beyond the largest slab → keep using the last (highest) slab's price.
    return Number(sorted[sorted.length - 1].price);
  }
  const hourly = Number(rate.hourly_rate || 0);
  return Math.round(hourly * (elapsedMinutes / 60) * Math.max(1, players));
}

/** Apply offer to billable minutes / final price. */
export function applyOffer(
  baseElapsed: number,
  basePrice: number,
  offer?: OfferLike | null
): { billableMinutes: number; finalPrice: number; saved: number } {
  if (!offer) return { billableMinutes: baseElapsed, finalPrice: basePrice, saved: 0 };
  if (offer.offer_type === "time_based") {
    const min = Number(offer.min_minutes || 0);
    const free = Number(offer.free_minutes || 0);
    if (baseElapsed >= min && free > 0) {
      const billable = Math.max(0, baseElapsed - free);
      return { billableMinutes: billable, finalPrice: basePrice, saved: 0 };
    }
    return { billableMinutes: baseElapsed, finalPrice: basePrice, saved: 0 };
  }
  if (offer.offer_type === "percentage") {
    const disc = Math.round(basePrice * Number(offer.value) / 100);
    return { billableMinutes: baseElapsed, finalPrice: Math.max(0, basePrice - disc), saved: disc };
  }
  if (offer.offer_type === "fixed") {
    const disc = Math.min(Number(offer.value), basePrice);
    return { billableMinutes: baseElapsed, finalPrice: Math.max(0, basePrice - disc), saved: disc };
  }
  return { billableMinutes: baseElapsed, finalPrice: basePrice, saved: 0 };
}

/**
 * Compute price across multiple player-count segments.
 * Each segment is priced independently using the rate slabs for that player count.
 */
export function priceWithSegments(
  rate: RateLike | undefined | null,
  segments: PlayerSegment[],
  defaultPlayers: number,
  startedAt: string,
  endTime: number,
  offer?: OfferLike | null
): { game: number; totalMinutes: number; saved: number } {
  // Build a normalized timeline of segments
  let segs: { players: number; minutes: number }[] = [];
  if (!segments || segments.length === 0) {
    const mins = Math.max(1, Math.ceil((endTime - new Date(startedAt).getTime()) / 60000));
    segs.push({ players: defaultPlayers, minutes: mins });
  } else {
    const sorted = [...segments].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
    for (let i = 0; i < sorted.length; i++) {
      const start = new Date(sorted[i].started_at).getTime();
      const end = sorted[i].ended_at ? new Date(sorted[i].ended_at).getTime() : (i + 1 < sorted.length ? new Date(sorted[i + 1].started_at).getTime() : endTime);
      const mins = Math.max(0, Math.round((end - start) / 60000));
      if (mins > 0) segs.push({ players: sorted[i].players, minutes: mins });
    }
  }

  const totalMinutes = segs.reduce((s, x) => s + x.minutes, 0);

  // Cooling startup: if the entire session ended within the cooling window,
  // bill the flat cooling amount regardless of player count / slab.
  const coolMin = Math.max(0, Number(rate?.cooling_minutes || 0));
  const coolAmt = Math.max(0, Number(rate?.cooling_amount || 0));
  if (coolMin > 0 && totalMinutes <= coolMin) {
    let g = Math.round(coolAmt);
    let savedC = 0;
    if (offer?.offer_type === "percentage") {
      const d = Math.round(g * Number(offer.value) / 100);
      savedC = d; g = Math.max(0, g - d);
    } else if (offer?.offer_type === "fixed") {
      const d = Math.min(Number(offer.value), g);
      savedC = d; g = Math.max(0, g - d);
    }
    return { game: g, totalMinutes, saved: savedC };
  }

  // Apply free-minutes offer by trimming from the END of the last segment (customer benefit at the tail)
  let billableSegs = segs.map((s) => ({ ...s }));
  let saved = 0;
  if (offer?.offer_type === "time_based") {
    const min = Number(offer.min_minutes || 0);
    const free = Number(offer.free_minutes || 0);
    // Offer is only valid once the session has played for (playFor + free) minutes.
    if (free > 0 && totalMinutes >= min + free) {
      let toTrim = free;
      for (let i = billableSegs.length - 1; i >= 0 && toTrim > 0; i--) {
        const cut = Math.min(toTrim, billableSegs[i].minutes);
        billableSegs[i].minutes -= cut;
        toTrim -= cut;
      }
    }
  }

  // Dynamic player-count billing: each segment is priced proportionally as
  //   (segmentMinutes / slabMinutes) * slabPrice
  // where the slab is whichever band the segment's own duration falls into
  // for that player count (grace already applied inside priceForElapsed).
  let game = 0;
  const nonEmpty = billableSegs.filter((s) => s.minutes > 0);
  if (nonEmpty.length <= 1) {
    // Player count never changed → use NORMAL fixed slab pricing on the
    // total billable duration. No per-minute proration.
    const only = nonEmpty[0];
    if (only) {
      game = priceForElapsed(rate, only.players, only.minutes);
    }
  } else {
    // Player count changed mid-session → dynamic prorated billing per segment.
    // Closed (earlier) segments are billed proportionally on their actual
    // minutes. The LAST segment is the currently-running one: it is *predicted*
    // to continue at the current player count until the current slab completes.
    const billableTotal = nonEmpty.reduce((s, x) => s + x.minutes, 0);
    let elapsedBefore = 0;
    for (let i = 0; i < nonEmpty.length; i++) {
      const s = nonEmpty[i];
      const isLast = i === nonEmpty.length - 1;
      if (isLast) {
        game += predictSegmentPrice(rate, s.players, elapsedBefore, billableTotal);
      } else {
        const slabPrice = priceForElapsed(rate, s.players, s.minutes);
        const slabMins = pickSlabMinutes(rate, s.players, s.minutes);
        game += slabMins > 0 ? (s.minutes / slabMins) * slabPrice : slabPrice;
      }
      elapsedBefore += s.minutes;
    }
  }

  if (offer?.offer_type === "percentage") {
    const disc = Math.round(game * Number(offer.value) / 100);
    saved = disc; game = Math.max(0, game - disc);
  } else if (offer?.offer_type === "fixed") {
    const disc = Math.min(Number(offer.value), game);
    saved = disc; game = Math.max(0, game - disc);
  }
  // Round final game amount to nearest multiple of 10.
  game = Math.round(game / 10) * 10;
  return { game, totalMinutes, saved };
}

/** Return the slab "minutes" bucket (including grace) that this segment falls into. */
function pickSlabMinutes(rate: RateLike | undefined | null, players: number, elapsedMinutes: number): number {
  if (!rate) return 0;
  const grace = Math.max(0, Number(rate.grace_minutes || 0));
  const slabs = (rate.slabs || []).filter((s) => Number(s.players) === players);
  if (!slabs.length) return 60; // hourly fallback
  const sorted = [...slabs].sort((a, b) => a.minutes - b.minutes);
  const band = sorted.find((s) => elapsedMinutes <= Number(s.minutes) + grace);
  return Number((band || sorted[sorted.length - 1]).minutes);
}

/**
 * Price the currently-running (last) segment by PREDICTING that the current
 * player count continues until the current slab completes.
 *
 *   predictedMinutes = currentSlabMinutes - minutesConsumedBeforeThisSegment
 *   price            = (predictedMinutes / currentSlabMinutes) * currentSlabPrice
 *
 * The current slab is the band that the *total* elapsed time falls into. Grace
 * only delays the transition to the next slab — the divisor / target duration
 * always uses the slab's real minutes (never minutes + grace).
 */
function predictSegmentPrice(
  rate: RateLike | undefined | null,
  players: number,
  elapsedBefore: number,
  totalElapsed: number
): number {
  if (!rate) return 0;
  const openMinutes = Math.max(0, totalElapsed - elapsedBefore);
  const grace = Math.max(0, Number(rate.grace_minutes || 0));
  const slabs = (rate.slabs || []).filter((s) => Number(s.players) === players);
  if (!slabs.length) {
    const hourly = Number(rate.hourly_rate || 0);
    return hourly * (openMinutes / 60) * Math.max(1, players);
  }
  const sorted = [...slabs].sort((a, b) => a.minutes - b.minutes);
  const band = sorted.find((s) => totalElapsed <= Number(s.minutes) + grace) || sorted[sorted.length - 1];
  const bandMins = Number(band.minutes);
  const bandPrice = Number(band.price);
  if (bandMins <= 0) return bandPrice;
  let predictedMins = bandMins - elapsedBefore;
  // Earlier segments already consumed past this slab → fall back to actual.
  if (predictedMins <= 0) predictedMins = openMinutes;
  return (predictedMins / bandMins) * bandPrice;
}
