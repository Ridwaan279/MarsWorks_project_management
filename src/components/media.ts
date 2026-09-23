"use client";

import { useEffect, useState } from "react";

/**
 * True when the primary input is a finger rather than a mouse.
 *
 * Used to decide where drag gestures may start. A mouse can grab a whole card
 * safely, because a click and a drag are distinguishable by intent and the
 * pointer never needs the card's surface for anything else. A finger needs
 * that surface to scroll, so on touch the drag has to be confined to a handle.
 *
 * Matching on `pointer: coarse` rather than on width: a small window on a
 * laptop still has a mouse, and a tablet with a wide screen still does not.
 *
 * Starts false so the server and the first client render agree; the effect
 * corrects it after mount, which means the card is briefly draggable
 * everywhere on a touch device. That is the safe direction to be wrong in --
 * the handle still works, and dnd-kit's press delay covers the gap.
 */
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return coarse;
}
