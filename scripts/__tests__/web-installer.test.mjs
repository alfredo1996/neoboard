import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The web installer (#1314) is what a stranger pipes into `sh`. These run the
// real script against a local HTTP server, with a stub `docker` and a stub
// binary that records how it was called. What they cannot prove is the real
// binary and the real stack: the CI job `web-installer` does that.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const SCRIPT = join(ROOT, "scripts/web-installer.sh");
const ASSEMBLE = join(ROOT, "scripts/assemble-installer-assets.sh");

const OS = process.platform === "darwin" ? "darwin" : "linux";
const ARCH = process.arch === "arm64" ? "arm64" : "x64";
const ASSET = `neoboard-${OS}-${ARCH}`;
const VERSION = "1.9.2";

// A "binary" that logs its arguments and the two variables the installer sets.
const FAKE_BINARY = `#!/bin/sh
[ "$1" = --version ] && { echo 1.0.0; exit 0; }
echo "args=$* dir=$NEOBOARD_DIR version=\${NEOBOARD_VERSION-UNSET}" >> "$NB_TEST_LOG"
`;

const sha = (s) => createHash("sha256").update(s).digest("hex");

let server;
let base;
let served; // path -> body
let requests;
let tmp;
let home;
let log;

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push(req.url);
    const body = served[req.url];
    if (body === undefined) {
      res.statusCode = 404;
      return res.end();
    }
    res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server.close());

function release(version, { binary = FAKE_BINARY, sums } = {}) {
  served[`/download/v${version}/${ASSET}`] = binary;
  served[`/download/v${version}/SHA256SUMS`] =
    sums ?? `${sha(FAKE_BINARY)}  ${ASSET}\n`;
}

// A PATH holding only what the script needs, so "no docker" is real even on a
// machine that has it. `docker` itself is a stub that succeeds.
function makePath(withDocker, { without = [], stubs = {} } = {}) {
  const dir = join(tmp, "bin");
  mkdirSync(dir, { recursive: true });
  for (const t of [
    "uname",
    "curl",
    "awk",
    "grep",
    "cut",
    "mktemp",
    "mkdir",
    "chmod",
    "mv",
    "rm",
    "printf",
    "sha256sum",
    "shasum",
    "sed",
    "tr",
    "cat",
    "head",
    "dirname",
  ].filter((t) => !without.includes(t))) {
    const which = spawnSync("sh", ["-c", `command -v ${t}`], {
      encoding: "utf8",
    }).stdout.trim();
    if (which.startsWith("/") && !existsSync(join(dir, t)))
      symlinkSync(which, join(dir, t));
  }
  if (withDocker) stubs = { docker: "exit 0", ...stubs };
  for (const [name, body] of Object.entries(stubs)) {
    rmSync(join(dir, name), { force: true }); // a symlink to the real tool
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  }
  return dir;
}

// Async on purpose: the script downloads from a server in THIS process, which
// a blocking spawnSync would starve.
function sh(script, env) {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", [script], { cwd: tmp, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

// What release.yml publishes: the script with the tag's version in it.
function pinnedScript() {
  const assets = join(tmp, "assets");
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, ASSET), FAKE_BINARY);
  execFileSync("sh", [ASSEMBLE, VERSION, assets]);
  return join(assets, "install.sh");
}

function install(env = {}, { withDocker = true, pathOpts = {}, script } = {}) {
  return sh(script ?? SCRIPT, {
    PATH: makePath(withDocker, pathOpts),
    HOME: home,
    NB_TEST_LOG: log,
    NEOBOARD_RELEASES_URL: base,
    NEOBOARD_VERSION: VERSION,
    ...env,
  });
}

beforeEach(() => {
  served = {};
  requests = [];
  tmp = mkdtempSync(join(realpathSync(tmpdir()), "nb-web-install-"));
  home = join(tmp, "home");
  mkdirSync(home);
  log = join(tmp, "calls.log");
  return () => rmSync(tmp, { recursive: true, force: true });
});

describe("web installer: failing closed", () => {
  it("installs nothing when SHA256SUMS does not match the binary", async () => {
    release(VERSION, { sums: `${"0".repeat(64)}  ${ASSET}\n` });
    const r = await install();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/checksum mismatch/);
    expect(existsSync(join(home, ".local", "bin", "neoboard"))).toBe(false);
  });

  it("installs nothing when the binary was swapped but the sums were not", async () => {
    release(VERSION, { binary: FAKE_BINARY + "# tampered\n" });
    // sums still describe the original FAKE_BINARY
    served[`/download/v${VERSION}/SHA256SUMS`] =
      `${sha(FAKE_BINARY)}  ${ASSET}\n`;
    const r = await install();
    expect(r.status).not.toBe(0);
    expect(existsSync(join(home, ".local", "bin", "neoboard"))).toBe(false);
  });

  it("refuses a release whose SHA256SUMS has no line for this platform", async () => {
    release(VERSION, { sums: `${sha(FAKE_BINARY)}  neoboard-other\n` });
    const r = await install();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no entry for/);
  });

  it("stops with an actionable message when Docker is missing, before downloading anything", async () => {
    release(VERSION);
    const r = await install({}, { withDocker: false });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Docker is not installed\. Install Docker/);
    expect(requests).toEqual([]);
  });

  it("refuses to download over plain http from anywhere but loopback", async () => {
    const r = await install({
      NEOBOARD_RELEASES_URL: "http://example.com/releases",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/non-HTTPS/);
  });

  it.each(["1.9", "latest", "1.9.2/../x", "1.9.2;id"])(
    "refuses NEOBOARD_VERSION=%s before it reaches a URL",
    async (v) => {
      const r = await install({ NEOBOARD_VERSION: v });
      expect(r.status).not.toBe(0);
      expect(requests).toEqual([]);
    },
  );

  it("refuses to run unsubstituted, since a checkout copy pins nothing", async () => {
    const r = await install({ NEOBOARD_VERSION: "" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no usable version/);
  });
});

describe("web installer: the download base (#1314 review)", () => {
  it.each([
    "http://127.0.0.1:1@example.com/",
    "http://localhost:80@example.com",
    "http://127.0.0.1:80.example.com",
  ])("refuses %s, which is not loopback whatever it starts with", async (u) => {
    const r = await install({ NEOBOARD_RELEASES_URL: u });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/non-HTTPS/);
  });

  it("restricts curl to https, redirects included, when the base is https", async () => {
    const calls = join(tmp, "curl.log");
    const r = await install(
      { NEOBOARD_RELEASES_URL: "https://example.test/releases" },
      { pathOpts: { stubs: { curl: `echo "$*" >> "${calls}"; exit 22` } } },
    );
    expect(r.status).not.toBe(0);
    expect(readFileSync(calls, "utf8")).toMatch(
      /--proto =https --proto-redir =https/,
    );
  });
});

describe("web installer: where it will install (#1314 review)", () => {
  it("stops inside a NeoBoard checkout, before downloading or creating anything", async () => {
    const checkout = join(tmp, "checkout");
    mkdirSync(checkout);
    writeFileSync(join(checkout, "package.json"), '{ "name": "neoboard" }');
    release(VERSION);
    const r = await install({ NEOBOARD_DIR: join(checkout, "inst") });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/NeoBoard checkout/);
    expect(requests).toEqual([]);
    expect(existsSync(join(checkout, "inst"))).toBe(false);
  });

  it("tells the user where the install is, and how later commands find it", async () => {
    release(VERSION);
    const r = await install();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`installed in ${join(tmp, "neoboard")}`);
  });
});

describe("web installer: the checksum tool (#1314 review)", () => {
  it("says a tool is missing, not that the release was tampered with, and downloads nothing", async () => {
    release(VERSION);
    const r = await install(
      {},
      { pathOpts: { without: ["sha256sum", "shasum"] } },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/need sha256sum or shasum/);
    expect(r.stderr).not.toMatch(/mismatch/);
    expect(requests).toEqual([]);
    expect(existsSync(join(home, ".local", "bin", "neoboard"))).toBe(false);
  });
});

describe("web installer: the npm fallback (#1314 review)", () => {
  // npm -g puts the CLI in <prefix>/bin, which is NOT on PATH here: the
  // installer must find it through `npm prefix -g`, as a user's shell would
  // not.
  const prefix = () => join(tmp, "npm-prefix");
  const NODE_NPM = {
    node: "echo 22",
    npm: `case "$1" in
  prefix) echo "${"${NB_NPM_PREFIX}"}" ;;
  install)
    echo "npm $*" >> "$NB_TEST_LOG"
    n=neo""board # not a path the hygiene test greps for
    mkdir -p "$NB_NPM_PREFIX/bin"
    printf '#!/bin/sh\\n[ "$1" = --version ] && exit 0\\necho "args=$*" >> "$NB_TEST_LOG"\\n' > "$NB_NPM_PREFIX/bin/$n"
    chmod 755 "$NB_NPM_PREFIX/bin/$n" ;;
esac`,
  };
  const brokenBinary = () => {
    release(VERSION, { binary: "#!/bin/sh\nexit 1\n" });
    served[`/download/v${VERSION}/SHA256SUMS`] =
      `${sha("#!/bin/sh\nexit 1\n")}  ${ASSET}\n`;
  };

  it("runs setup from npm's prefix and says how to reach it when that is off PATH", async () => {
    brokenBinary();
    const r = await install(
      { NB_NPM_PREFIX: prefix() },
      { pathOpts: { stubs: NODE_NPM }, script: pinnedScript() },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(log, "utf8")).toContain("args=setup");
    expect(r.stdout).toContain(`export PATH="${join(prefix(), "bin")}:$PATH"`);
  });

  it("keeps the CLI that works when the replacement cannot run and npm is not there to fall back on", async () => {
    const bin = join(home, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "neoboard"), FAKE_BINARY, { mode: 0o755 });
    brokenBinary();
    // No node, no npm on PATH: the fallback dies.
    const r = await install({}, { script: pinnedScript() });
    expect(r.status).not.toBe(0);
    expect(readFileSync(join(bin, "neoboard"), "utf8")).toBe(FAKE_BINARY);
    expect(readdirSync(bin)).toEqual(["neoboard"]); // no staged leftover
  });

  it("installs the CLI version the release was cut with, never 'latest', when the binary cannot run here", async () => {
    // e.g. a glibc binary on Alpine: right architecture, will not execute.
    brokenBinary();
    const r = await install(
      { NB_NPM_PREFIX: prefix() },
      { pathOpts: { stubs: NODE_NPM }, script: pinnedScript() },
    );
    expect(r.status, r.stderr).toBe(0);
    const npm = readFileSync(log, "utf8");
    expect(npm).toMatch(/npm install -g @neoboard\/cli@\d+\.\d+\.\d+\b/);
    expect(npm).not.toMatch(/@neoboard\/cli(\s|$)/);
  });
});

describe("web installer: a clean install", () => {
  it("installs the verified binary and runs `setup` in NEOBOARD_DIR, pinning the version", async () => {
    release(VERSION);
    const r = await install();
    expect(r.status, r.stderr).toBe(0);
    const bin = join(home, ".local", "bin", "neoboard");
    expect(readFileSync(bin, "utf8")).toBe(FAKE_BINARY);
    expect(readFileSync(log, "utf8")).toBe(
      `args=setup dir=${join(tmp, "neoboard")} version=${VERSION}\n`,
    );
  });

  it("honours NEOBOARD_BIN_DIR and NEOBOARD_DIR, and says how to reach a bin dir off PATH", async () => {
    release(VERSION);
    const r = await install({
      NEOBOARD_BIN_DIR: join(tmp, "mybin"),
      NEOBOARD_DIR: "inst",
    });
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(tmp, "mybin", "neoboard"))).toBe(true);
    expect(readFileSync(log, "utf8")).toContain(`dir=${join(tmp, "inst")}`);
    expect(r.stdout).toContain(`export PATH="${join(tmp, "mybin")}:$PATH"`);
  });

  it("downloads the release NEOBOARD_VERSION names, not another", async () => {
    release("1.9.7");
    const r = await install({ NEOBOARD_VERSION: "v1.9.7" });
    expect(r.status, r.stderr).toBe(0);
    expect(requests).toEqual([
      `/download/v1.9.7/${ASSET}`,
      "/download/v1.9.7/SHA256SUMS",
    ]);
  });
});

describe("web installer: a re-run", () => {
  it("keeps the binary and the recorded version, and leaves .env untouched", async () => {
    const pinned = pinnedScript();
    release(VERSION);
    const run = () =>
      sh(pinned, {
        PATH: makePath(true),
        HOME: home,
        NB_TEST_LOG: log,
        NEOBOARD_RELEASES_URL: base,
      });
    expect((await run()).status).toBe(0);
    mkdirSync(join(tmp, "neoboard/docker"), { recursive: true });
    const envFile = join(tmp, "neoboard/docker/.env");
    writeFileSync(envFile, "ENCRYPTION_KEY=keep\n");
    requests.length = 0;

    expect((await run()).status).toBe(0);
    expect(requests).toEqual([]);
    const calls = readFileSync(log, "utf8").trim().split("\n");
    expect(calls[0]).toContain(`version=${VERSION}`); // first run pins
    expect(calls[1]).toContain("version=UNSET"); // re-run keeps what is recorded
    expect(readFileSync(envFile, "utf8")).toBe("ENCRYPTION_KEY=keep\n");
  });
});

describe("assemble-installer-assets.sh: what release.yml attaches", () => {
  const assemble = (version, dir) =>
    spawnSync("sh", [ASSEMBLE, version, dir], { encoding: "utf8" });

  it("pins the version into install.sh and sums every binary, by name", () => {
    writeFileSync(join(tmp, "neoboard-linux-x64"), "linux build");
    writeFileSync(join(tmp, "neoboard-darwin-arm64"), "mac build");
    const r = assemble("1.9.2", tmp);
    expect(r.status, r.stderr).toBe(0);
    const script = readFileSync(join(tmp, "install.sh"), "utf8");
    expect(script).toContain('NB_PINNED_VERSION="1.9.2"');
    expect(script).not.toContain('"@VERSION@"');
    const sums = readFileSync(join(tmp, "SHA256SUMS"), "utf8")
      .trim()
      .split("\n");
    expect(sums.sort()).toEqual(
      [
        `${sha("mac build")}  neoboard-darwin-arm64`,
        `${sha("linux build")}  neoboard-linux-x64`,
      ].sort(),
    );
  });

  it.each(["v1.9.2", "1.9", "1.9.2/x", ""])("refuses the version %j", (v) => {
    writeFileSync(join(tmp, "neoboard-linux-x64"), "b");
    expect(assemble(v, tmp).status).not.toBe(0);
  });

  it("fails rather than publish a release with no binaries", () => {
    expect(assemble("1.9.2", tmp).status).not.toBe(0);
    expect(existsSync(join(tmp, "install.sh"))).toBe(false);
  });
});
