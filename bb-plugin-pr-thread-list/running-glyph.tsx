import "./running-glyph.css";

// Each frame is one glyph-width wide, with one bright cell in spiral order.
const spiral = [0, 1, 2, 5, 8, 7, 6, 3, 4];

export const RunningGlyph = () => (
  <span data-running-glyph="" aria-hidden="true" className="bb-thread-lattice">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity=".35">
      {spiral.map((cell) => (
        <rect
          key={cell}
          x={(cell % 3) * 6}
          y={Math.floor(cell / 3) * 6}
          width="4"
          height="4"
          rx="1"
        />
      ))}
    </svg>
    <span className="bb-thread-lattice-strip">
      <svg width="108" height="12" viewBox="0 0 144 16" fill="currentColor">
        {spiral.map((cell, frame) => (
          <rect
            key={cell}
            x={frame * 16 + (cell % 3) * 6}
            y={Math.floor(cell / 3) * 6}
            width="4"
            height="4"
            rx="1"
          />
        ))}
      </svg>
    </span>
  </span>
);
