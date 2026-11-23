// @locs-version: 1.0
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseCronField(field: string, lower: number, upper: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    if (part === "*") {
      for (let value = lower; value <= upper; value += 1) values.add(value);
    } else if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10);
      for (let value = lower; value <= upper; value += step) values.add(value);
    } else if (part.includes("-") && !part.includes("/")) {
      const [start, end] = part.split("-").map(Number);
      for (let value = start; value <= end; value += 1) values.add(value);
    } else if (part.includes("/")) {
      const [base, stepText] = part.split("/");
      const [start, endText] = base.split("-").map(Number);
      const step = parseInt(stepText, 10);
      const end = Number.isNaN(endText) ? upper : endText;
      for (let value = start; value <= end; value += step) values.add(value);
    } else {
      const value = parseInt(part, 10);
      if (!Number.isNaN(value)) values.add(value);
    }
  }
  return values;
}

export function cronExpressionSummary(expr: string): string {
  if (!expr) return "";

  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
  if (minute === "0" && hour !== "*" && dayOfMonth === "*" && dayOfWeek === "*") {
    return `Daily at ${hour.padStart(2, "0")}:00 UTC`;
  }
  if (minute === "0" && hour !== "*" && dayOfMonth === "*" && dayOfWeek === "1-5") {
    return `Every weekday at ${hour.padStart(2, "0")}:00 UTC`;
  }
  if (minute === "0" && hour !== "*" && dayOfMonth === "*" && /^\d$/.test(dayOfWeek)) {
    return `Every ${WEEKDAY_NAMES[+dayOfWeek] ?? "week"} at ${hour.padStart(2, "0")}:00 UTC`;
  }
  if (minute.startsWith("*/")) {
    return `Every ${minute.slice(2)} minutes`;
  }
  if (minute === "0" && hour === "*") {
    return "Every hour";
  }
  if (minute !== "*" && hour === "*") {
    return `Every hour at :${minute.padStart(2, "0")} UTC`;
  }
  return expr;
}

export function nextCronFireTimes(
  expr: string,
  count: number = 3,
  fromDate: Date = new Date(),
): Date[] {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return [];

  try {
    const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;
    const minutes = parseCronField(minuteField, 0, 59);
    const hours = parseCronField(hourField, 0, 23);
    const months = parseCronField(monthField, 1, 12);
    const dayOfMonthStar = dayOfMonthField === "*";
    const dayOfWeekStar = dayOfWeekField === "*";
    const dayOfMonths = dayOfMonthStar ? new Set<number>() : parseCronField(dayOfMonthField, 1, 31);
    const dayOfWeeks = dayOfWeekStar ? new Set<number>() : parseCronField(dayOfWeekField, 0, 6);

    const result: Date[] = [];
    const cursor = new Date(fromDate);
    cursor.setUTCSeconds(0);
    cursor.setUTCMilliseconds(0);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

    let iterations = 0;
    while (result.length < count && iterations++ < 52560) {
      const dayOfMonthOk = dayOfMonthStar ? true : dayOfMonths.has(cursor.getUTCDate());
      const dayOfWeekOk = dayOfWeekStar ? true : dayOfWeeks.has(cursor.getUTCDay());
      const dateOk = !dayOfMonthStar && !dayOfWeekStar
        ? dayOfMonthOk || dayOfWeekOk
        : dayOfMonthOk && dayOfWeekOk;

      if (
        months.has(cursor.getUTCMonth() + 1)
        && dateOk
        && hours.has(cursor.getUTCHours())
        && minutes.has(cursor.getUTCMinutes())
      ) {
        result.push(new Date(cursor));
      }
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    }

    return result;
  } catch {
    return [];
  }
}
