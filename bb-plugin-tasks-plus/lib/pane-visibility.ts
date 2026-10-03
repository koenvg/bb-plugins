import { createContext } from "react";

/** A retained editor may outlive its visible host tab. Overlays must not. */
export const PaneVisibilityContext = createContext(true);
