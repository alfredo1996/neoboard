-- Fluent Bit lua filter for NeoBoard's pino lines (the filter sets
-- time_as_table On, so `timestamp` is {sec, nsec}).
--  * severity: pino's numeric `level` as a name (the number stays as `level`)
--  * event time: the line's own `time` (epoch milliseconds), not the moment
--    Fluent Bit received it, kept to the millisecond
--  * time: a runtime's string `time` (a plain-text line) becomes `runtime_time`.
--    pino's `time` is a number, and a daily index maps `time` from whichever
--    kind arrives first, then rejects the other.
--  * err: the app logs it as an object in some places and a string in others,
--    and OpenSearch maps a field to the first type it sees, then rejects the
--    other. A string becomes { message = <string> }.
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
  local t = record["time"]
  if type(t) == "number" then
    timestamp = { sec = math.floor(t / 1000), nsec = math.floor(t % 1000) * 1000000 }
    changed = 1
  end
  if type(t) == "string" then
    record["runtime_time"] = t
    record["time"] = nil
    changed = 1
  end
  if type(record["err"]) == "string" then
    record["err"] = { message = record["err"] }
    changed = 1
  end
  return changed, timestamp, record
end
