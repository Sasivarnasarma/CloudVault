"""
Writes the CI report (gates, tests, build artifact) as Markdown for the workflow's summary page.

Reads step outcomes and test counts from environment variables set by the `report` job in
.github/workflows/ci.yml, and prints the Markdown (CI appends it to $GITHUB_STEP_SUMMARY).
Run it locally with any of those variables set to preview the report.
"""

import os

RESULTS = {
    "success": "✅ Passed",
    "failure": "❌ Failed",
    "cancelled": "⚪ Cancelled",
    "skipped": "⏭️ Skipped",
    "": "⚪ Not run",
}


def env(name: str) -> str:
    return os.environ.get(name, "").strip()


def combine(*outcomes: str) -> str:
    """One result for a gate made of several steps: failed if any failed, passed if all passed."""
    for state in ("failure", "cancelled"):
        if state in outcomes:
            return state
    if all(o == "skipped" for o in outcomes):
        return "skipped"
    if all(o in ("success", "skipped") for o in outcomes):
        return "success"
    return ""


GATES = [
    ("🎨", "Format", "Prettier (web app) and Ruff (API) formatting", ("WEB_FORMAT", "API_FORMAT")),
    ("🔍", "Lint", "oxlint (web app) and Ruff (API) code-quality rules", ("WEB_LINT", "API_LINT")),
    ("🧠", "Typecheck", "TypeScript across the web app", ("WEB_TYPECHECK",)),
    ("🧪", "Unit tests", "Vitest (web app) and pytest (API)", ("WEB_TESTS", "API_TESTS")),
    ("📦", "Build", "Production build of the web app", ("WEB_BUILD",)),
    ("🐳", "Docker image", "One image with the API and the web app", ("IMAGE",)),
    (
        "🔥",
        "Smoke test",
        "Runs the image next to MinIO: health, web app, upload, download, search, trash, non-root",
        ("IMAGE_SMOKE",),
    ),
    ("🛡️", "Audit", "Known vulnerabilities in shipped dependencies", ("WEB_AUDIT", "API_AUDIT")),
]


def count(prefix: str) -> dict[str, int] | None:
    values = {k: env(f"{prefix}_{k.upper()}") for k in ("total", "passed", "failed", "skipped")}
    if not values["total"]:
        return None
    return {k: int(v or 0) for k, v in values.items()}


def report() -> str:
    gates = [(icon, name, what, combine(*(env(v) for v in names))) for icon, name, what, names in GATES]
    failed = [name for _, name, _, result in gates if result == "failure"]
    sha = env("SHA")
    run = env("RUN_NUMBER")
    run_url = env("RUN_URL")

    if failed:
        headline = f"🔴 **{len(failed)} {'check' if len(failed) == 1 else 'checks'} failed** ({', '.join(failed)})"
    elif all(result in ("success", "skipped") for *_, result in gates):
        headline = "🟢 **All checks passed**"
    else:
        headline = "🟡 **Some checks didn't run**"
    meta = [headline]
    if sha:
        meta.append(f"Commit `{sha[:12]}`")
    if run:
        meta.append(f"Workflow run [#{run}]({run_url})" if run_url else f"Workflow run #{run}")

    lines = ["# ☁️ CloudVault CI Report", "", " · ".join(meta), ""]
    lines += ["| Gate | Result | What it verifies |", "| --- | --- | --- |"]
    lines += [
        f"| {icon} **{name}** | {RESULTS.get(result, '⚪ ' + result)} | {what} |" for icon, name, what, result in gates
    ]

    suites = [("Web app (Vitest)", count("WEB_TESTS")), ("API (pytest)", count("API_TESTS"))]
    suites = [(name, c) for name, c in suites if c]
    if suites:
        lines += [
            "",
            "## 🧪 Test Suite Results",
            "",
            "| Suite | Total | Passed | Failed | Skipped |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
        for name, c in suites:
            mark = " ✅" if not c["failed"] else " ❌"
            lines.append(f"| {name} | {c['total']} | {c['passed']}{mark} | {c['failed']} | {c['skipped']} |")
        if len(suites) > 1:
            total = {k: sum(c[k] for _, c in suites) for k in ("total", "passed", "failed", "skipped")}
            lines.append(
                f"| **All** | **{total['total']}** | **{total['passed']}** | **{total['failed']}** | **{total['skipped']}** |"
            )

    if env("WEB_BUILD") == "success":
        lines += [
            "",
            "## 📦 Build Artifact",
            "",
            "The production build of the web app has been uploaded as **web-dist**. Download it from the "
            "**Artifacts** section at the bottom of this run's summary page.",
        ]
    image = env("IMAGE")
    if image == "success":
        pushed = env("IMAGE_PUSHED") == "true"
        lines += [
            "",
            "## 🐳 Docker Image",
            "",
            f"Published to `{env('IMAGE_NAME')}`."
            if pushed and env("IMAGE_NAME")
            else "Built (published only from `main` and version tags).",
        ]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    print(report(), end="")
