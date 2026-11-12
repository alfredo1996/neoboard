-- Fluent Bit lua filter for NeoBoard's pino lines.
--  * severity: pino's numeric `level` as a name (the number stays as `level`)
--  * event time: the line's own `time` (epoch milliseconds), not the moment
--    Fluent Bit received it
local SEVERITY = {
  [10] = "trace", [20] = "debug", [30] = "info",
  [40] = "warn", [50] = "error", [60] = "fatal",
}

function neoboard(tag, timestamp, record)
  local changed = 0
  if SEVERITY[record["level"]] then
    record["severity"] = SEVERITY[record["level"]]
    changed = 1
  end
  if type(record["time"]) == "number" then
    timestamp = record["time"] / 1000
    changed = 1
  end
  return changed, timestamp, record
end
