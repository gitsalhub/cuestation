// Centralized pricing engine
export type Slab = { minutes: number; players: number; price: number };
export type RateLike = { hourly_rate?: number | null; slabs?: Slab[] | null };
export type PlayerSegment = { players: number; started_at: string; ended_at?: string | null };
export type OfferLike = {
  id?: string;
  offer_type: string;
  value: number;
  min_minutes?: number | null;
  free_minutes?: number | null;
};

/** Pick the largest slab whose minutes <= elapsed for the given player count. */
export function priceForElapsed(
  rate: RateLike | undefined | null,
  players: number,
  elapsedMinutes: number
): number {
  if (!rate) return 0;
  const slabs = (rate.slabs || []).filter((s) => Number(s.players) === players);
  if (slabs.length) {
    const sorted = [...slabs].sort((a, b) => a.minutes - b.minutes);
    // Slab semantics: "₹price up to X minutes". Find the first slab whose
    // minutes >= elapsed; that's the price the customer pays in this band.
    const band = sorted.find((s) => elapsedMinutes <= Number(s.minutes));
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
  // Apply free-minutes offer by trimming from the END of the last segment (customer benefit at the tail)
  let billableSegs = segs.map((s) => ({ ...s }));
  let saved = 0;
  if (offer?.offer_type === "time_based") {
    const min = Number(offer.min_minutes || 0);
    const free = Number(offer.free_minutes || 0);
    if (totalMinutes >= min && free > 0) {
      let toTrim = free;
      for (let i = billableSegs.length - 1; i >= 0 && toTrim > 0; i--) {
        const cut = Math.min(toTrim, billableSegs[i].minutes);
        billableSegs[i].minutes -= cut;
        toTrim -= cut;
      }
    }
  }

  let game = 0;
  for (const s of billableSegs) {
    if (s.minutes > 0) game += priceForElapsed(rate, s.players, s.minutes);
  }
  game = Math.round(game);

  if (offer?.offer_type === "percentage") {
    const disc = Math.round(game * Number(offer.value) / 100);
    saved = disc; game = Math.max(0, game - disc);
  } else if (offer?.offer_type === "fixed") {
    const disc = Math.min(Number(offer.value), game);
    saved = disc; game = Math.max(0, game - disc);
  }
  return { game, totalMinutes, saved };
}
