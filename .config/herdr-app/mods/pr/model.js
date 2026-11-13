// Pure helpers for the PR panel: fed with gh / jk JSON.

// A Jenkins build URL → { jobPath, number } for `jk run view`, or null.
// https://jenkins/job/a/job/b/job/PR-1/12/display/redirect → { jobPath: "a/b/PR-1", number: 12 }
export function jenkinsBuild(url) {
  const m = /^https?:\/\/[^/]+((?:\/job\/[^/]+)+)\/(\d+)(?:\/|$)/.exec(url ?? "");
  if (!m) return null;
  return { jobPath: m[1].split("/job/").filter(Boolean).map(decodeURIComponent).join("/"), number: Number(m[2]) };
}

// gh's statusCheckRollup (StatusContext or CheckRun) → [{ name, state: "ok" | "ko" | "running", url }].
export function checks(rollup) {
  return (rollup ?? []).map((c) => {
    const s = (c.conclusion || c.state || c.status || "").toUpperCase();
    const state = ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(s) ? "ok"
      : ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(s) ? "ko" : "running";
    return { name: c.context || c.name || "?", state, url: c.targetUrl || c.detailsUrl || null };
  });
}

export function minutes(ms) {
  const m = Math.round((ms ?? 0) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
