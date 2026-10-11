import type { KeyDefinition, LanguagePack } from "@typenow/language-packs";
import { englishPack } from "@typenow/language-packs/en";
import { Keycap } from "./ui";

export function KeyboardMap({
  pack = englishPack,
  nextCode,
  nextShift = false,
}: {
  pack?: LanguagePack;
  nextCode?: string;
  nextShift?: boolean;
}) {
  const keys = Object.values(pack.keyMap);
  const rows = pack.keyboard.rows
    .map(({ id, offset }) => ({
      id,
      offset,
      keys: keys.filter((key) => key.row === id).sort((a, b) => a.column - b.column),
    }))
    .filter(({ keys }) => keys.length > 0);

  return (
    <div className="keyboard-map" aria-label="Keyboard layout" role="group">
      {rows.map(({ id, offset, keys: rowKeys }) => (
        <div
          className={`keyboard-row ${id === "modifier" ? "keyboard-row--modifier" : ""}`}
          dir={pack.direction}
          key={rowKeys[0].row}
          style={{ marginInlineStart: `calc(var(--keyboard-key-pitch) * ${offset})` }}
        >
          {rowKeys.map((key) => (
            <Keycap
              aria-label={`${key.label}, ${key.finger.replace("-", " ")}`}
              aria-current={key.code === nextCode || (nextShift && (key.code === "ShiftLeft" || key.code === "ShiftRight")) ? "true" : undefined}
              className={`${key.row === "space" ? "keycap--space" : ""} ${key.row === "modifier" ? "keycap--modifier" : ""} ${key.code === nextCode || (nextShift && (key.code === "ShiftLeft" || key.code === "ShiftRight")) ? "keycap--next" : ""}`}
              key={key.code}
              role="img"
            >
              {key.label}
            </Keycap>
          ))}
        </div>
      ))}
    </div>
  );
}

export function HandMap({
  pack = englishPack,
  highlightedCodes = [],
}: {
  pack?: LanguagePack;
  highlightedCodes?: readonly string[];
}) {
  const keys = Object.values(pack.keyMap);
  const fingers = [...new Set(keys.map((key) => key.finger))];
  return (
    <div className="hand-map" aria-label="Keys grouped by the finger used" role="group">
      {fingers.map((finger) => {
        const fingerKeys = keys
          .filter((key) => key.finger === finger)
          .sort((a, b) => pack.keyboard.rows.findIndex((row) => row.id === a.row) - pack.keyboard.rows.findIndex((row) => row.id === b.row) || a.column - b.column)
        if (fingerKeys.length === 0) return null;
        return (
          <div className="finger-group" key={finger}>
            <span>{finger.replace("-", " ")}</span>
            <strong>
              {fingerKeys.map((key) => (
                <span
                  className={highlightedCodes.includes(key.code) ? "finger-key--highlighted" : ""}
                  key={key.code}
                >
                  {key.label}
                </span>
              ))}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

export function Heatmap({
  pack = englishPack,
  values = {},
  valueFormat = "count",
}: {
  pack?: LanguagePack;
  values?: Readonly<Record<string, number>>;
  valueFormat?: "count" | "percent";
}) {
  const keys: readonly KeyDefinition[] = Object.values(pack.keyMap);
  const maximum = Math.max(0, ...Object.values(values));
  return (
    <div className="keyboard-map" aria-label="Keyboard heatmap" role="group">
      {pack.keyboard.rows
        .map(({ id, offset }) => ({
          offset,
          keys: keys.filter((key) => key.row === id).sort((a, b) => a.column - b.column),
        }))
        .filter(({ keys: rowKeys }) => rowKeys.length > 0)
        .map(({ offset, keys: rowKeys }) => (
          <div
            className="keyboard-row"
            dir={pack.direction}
            key={rowKeys[0].row}
            style={{ marginInlineStart: `calc(var(--keyboard-key-pitch) * ${offset})` }}
          >
            {rowKeys.map((key) => {
              const value = values[key.code];
              const level = value === undefined || maximum === 0 ? 0 : Math.ceil((value / maximum) * 6);
              const shownValue = value === undefined
                ? "—"
                : valueFormat === "percent"
                  ? `${Math.round(value * 100)}%`
                  : String(value);
              const describedValue = value === undefined
                ? "no data"
                : valueFormat === "percent"
                  ? `${Math.round(value * 100)}% error rate`
                  : `${value} error${value === 1 ? "" : "s"}`;
              return (
                <span
                  aria-label={
                    `${key.label}: ${describedValue}, ${key.finger.replace("-", " ")} finger, ${key.row} row`
                  }
                  className={`keycap heat-key heat-key--${level} ${key.row === "space" ? "keycap--space" : ""}`}
                  key={key.code}
                  role="img"
                >
                  <span>{key.label}</span>
                  <small>{shownValue}</small>
                </span>
              );
            })}
          </div>
        ))}
    </div>
  );
}
