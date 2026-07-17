export const BOARD_STYLES = Object.freeze([
  { id: "classic", name: "Classic", price: 0, board: "#41403e", cell: "#fffdf8", border: "#41403e", x: "#b42318", o: "#175cd3" },
  { id: "forest", name: "Forest", price: 9, board: "#31572c", cell: "#fff4d6", border: "#31572c", x: "#246b3b", o: "#9a5b00" },
  { id: "ocean", name: "Ocean", price: 19, board: "#12355b", cell: "#dff4ff", border: "#12355b", x: "#173f7a", o: "#007f8b" },
  { id: "sunset", name: "Sunset", price: 29, board: "#702632", cell: "#ffe1cf", border: "#702632", x: "#7d1731", o: "#b94700" },
  { id: "lavender", name: "Lavender", price: 39, board: "#553080", cell: "#f1e5ff", border: "#553080", x: "#63319a", o: "#b11c72" },
  { id: "mint", name: "Mint", price: 49, board: "#12635b", cell: "#dffff3", border: "#12635b", x: "#00675f", o: "#b53b35" },
  { id: "midnight", name: "Midnight", price: 59, board: "#55e7ff", cell: "#11131c", border: "#55e7ff", x: "#22dff5", o: "#ff4fc8" },
  { id: "desert", name: "Desert", price: 69, board: "#68452b", cell: "#f7dfad", border: "#68452b", x: "#70401f", o: "#007d7b" },
  { id: "neon", name: "Neon", price: 89, board: "#b8ff35", cell: "#24113d", border: "#b8ff35", x: "#b8ff35", o: "#ff4ba8" }
]);

export const STYLE_CATALOG = BOARD_STYLES;
export const DEFAULT_STYLE_ID = "classic";

export function getBoardStyle(id) {
  return BOARD_STYLES.find((style) => style.id === id) || BOARD_STYLES[0];
}

export function isBoardStyleId(id) {
  return BOARD_STYLES.some((style) => style.id === id);
}

export function styleTokens(styleOrId) {
  const style = typeof styleOrId === "string" ? getBoardStyle(styleOrId) : styleOrId;
  return `--board-color:${style.board};--board-surface:${style.cell};--cell-color:${style.cell};--cell-border-color:${style.border};--x-color:${style.x};--o-color:${style.o}`;
}
