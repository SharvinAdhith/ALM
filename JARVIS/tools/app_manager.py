"""
Production-grade App Manager for JARVIS (Windows).
- Hybrid PowerShell (Get-StartApps) + registry + exe + shortcuts scanner
- Smart fuzzy resolver (RapidFuzz if available, difflib fallback)
- Background UWP index refresh (Option C)
- Auto-add discovered apps to app_registry.json (but only when confident)
- Triple-threshold decision logic (EXCELLENT / GOOD / MIN_CONF)
"""

from __future__ import annotations
import os
import json
import subprocess
import threading
import time
import shutil
import sys
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
import difflib
import logging

# Try to import rapidfuzz for better fuzzy match quality; fallback to difflib
try:
    from rapidfuzz import fuzz, process
    _HAS_RAPIDFUZZ = True
except Exception:
    _HAS_RAPIDFUZZ = False

logger = logging.getLogger("app_manager")
logger.setLevel(logging.DEBUG)
ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(logging.Formatter("[AppManager] %(message)s"))
logger.addHandler(ch)

ROOT_DIR = Path(__file__).resolve().parent.parent  # repo root (tools/..)
TOOLS_DIR = Path(__file__).resolve().parent
CACHE_PATH = TOOLS_DIR / "app_cache.json"
REGISTRY_PATH = TOOLS_DIR / "app_registry.json"

# thresholds (percent)
EXCELLENT = 85
GOOD = 70
MIN_CONF = 50

# PowerShell enumeration commands
PS_ENUM_CMD = "Get-StartApps | ConvertTo-Json -Depth 4"

# Small helper for safe JSON writes
def _atomic_write_json(path: Path, data: Any):
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    tmp.replace(path)


class AppEntry:
    """
    Normalized entry for a candidate app in the index.
    - name: friendly name
    - kind: 'uwp' | 'exe' | 'lnk' | 'registry'
    - id_or_path: for UWP it's AppID, otherwise full path
    - source: where it came from
    """
    def __init__(self, name: str, kind: str, id_or_path: str, source: str):
        self.name = name
        self.kind = kind
        self.id_or_path = id_or_path
        self.source = source

    def to_dict(self):
        return {"name": self.name, "kind": self.kind, "id_or_path": self.id_or_path, "source": self.source}


class AppManager:
    def __init__(self, auto_add: bool = True, background_refresh: bool = True, refresh_interval: int = 300):
        """
        auto_add: when a candidate is successfully launched with EXCELLENT confidence, add it to app_registry.json
        background_refresh: run PS enumeration in background after startup
        refresh_interval: seconds between auto refresh (if background_refresh True)
        """
        self.auto_add = auto_add
        self.background_refresh = background_refresh
        self.refresh_interval = refresh_interval

        self._index: List[AppEntry] = []
        self._name_map: Dict[str, AppEntry] = {}  # normalized name -> entry (latest)
        self._lock = threading.RLock()

        # Ensure registry file exists
        if not REGISTRY_PATH.exists():
            try:
                _atomic_write_json(REGISTRY_PATH, {})
            except Exception as e:
                logger.debug(f"Could not create registry path: {e}")

        # Load cache immediately (fast) then spawn refresh thread
        self._load_cache()
        if self.background_refresh:
            t = threading.Thread(target=self._background_refresher, daemon=True)
            t.start()

    # ----------------- low-level utils -----------------
    @staticmethod
    def _normalize(s: str) -> str:
        return ''.join(ch.lower() for ch in s if ch.isalnum() or ch.isspace()).strip()

    @staticmethod
    def _pwsh_exe() -> Optional[str]:
        # Prefer pwsh (PowerShell 7+) if available, else powershell.exe (Windows PowerShell)
        for name in ("pwsh", "powershell"):
            path = shutil.which(name)
            if path:
                return path
        return None

    @staticmethod
    def _run_powershell(cmd: str, timeout: int = 8) -> Tuple[int, str, str]:
        """
        Run PowerShell (pwsh or powershell) with the provided command and return (code, stdout, stderr).
        Uses -NoProfile -NonInteractive to avoid profile execution.
        """
        exe = AppManager._pwsh_exe()
        if not exe:
            raise RuntimeError("No PowerShell (pwsh/powershell) found on PATH.")

        # Compose full call: exe -NoProfile -Command "<cmd>"
        call = [exe, "-NoProfile", "-NonInteractive", "-Command", cmd]
        try:
            proc = subprocess.run(call, capture_output=True, text=True, timeout=timeout)
            return proc.returncode, proc.stdout, proc.stderr
        except subprocess.TimeoutExpired as e:
            return -1, "", f"Timeout: {e}"
        except Exception as e:
            return -1, "", str(e)

    @staticmethod
    def _is_uwp_identifier(id_or_path: str) -> bool:
        """
        Heuristic to detect UWP/AppUserModelIDs:
         - contains '!' (many AppIDs include !App)
         - contains '.' but is not a full filesystem path (no slashes/backslashes)
         - or starts with Microsoft. or contains an AppUserModelID-like pattern
        """
        if not id_or_path:
            return False
        p = str(id_or_path)
        if "!" in p:
            return True
        if p.startswith("Microsoft.") or p.startswith("microsoft."):
            return True
        # If it's not an absolute path and contains a dot (e.g. Telegram.TelegramDesktop), treat as UWP-like
        if (not os.path.isabs(p)) and ("." in p) and ("\\" not in p and "/" not in p):
            return True
        return False

    # ----------------- indexing -----------------
    def _load_cache(self):
        """Load cached index from CACHE_PATH if it exists."""
        try:
            if CACHE_PATH.exists():
                with open(CACHE_PATH, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                with self._lock:
                    self._index = [AppEntry(**r) for r in raw.get("index", [])]
                    self._rebuild_name_map()
                logger.info(f"Loaded app cache ({len(self._index)} entries).")
            else:
                logger.info("No app cache found; will build index on background refresh.")
        except Exception as e:
            logger.warning(f"Failed to load cache: {e}")

    def _save_cache(self):
        try:
            with self._lock:
                data = {"index": [e.to_dict() for e in self._index], "ts": time.time()}
            _atomic_write_json(CACHE_PATH, data)
            logger.info("Saved app cache.")
        except Exception as e:
            logger.warning(f"Failed to save cache: {e}")

    def _rebuild_name_map(self):
        self._name_map = {}
        for e in self._index:
            key = self._normalize(e.name)
            self._name_map[key] = e

    def _append_or_replace_entry(self, entry: AppEntry):
        # Replace any entry with same kind+id_or_path or same normalized name
        with self._lock:
            replaced = False
            for i, ex in enumerate(self._index):
                if (ex.id_or_path == entry.id_or_path and ex.kind == entry.kind) or (self._normalize(ex.name) == self._normalize(entry.name)):
                    self._index[i] = entry
                    replaced = True
                    break
            if not replaced:
                self._index.append(entry)
            self._rebuild_name_map()

    def _enumerate_uwp(self) -> List[AppEntry]:
        """
        Use PowerShell Get-StartApps -> JSON and parse Name + AppID
        """
        try:
            code, out, err = self._run_powershell(PS_ENUM_CMD, timeout=10)
            if code != 0:
                logger.warning(f"PowerShell failed: {err.strip()}")
                return []

            out = out.strip()
            if not out:
                return []

            # PowerShell's ConvertTo-Json may produce arrays or single objects.
            try:
                parsed = json.loads(out)
            except json.JSONDecodeError:
                # Attempt to extract JSON block if PS added BOM or warnings
                start = out.find("[")
                if start != -1:
                    parsed = json.loads(out[start:])
                else:
                    logger.warning("Failed to parse PowerShell JSON output.")
                    return []

            entries = []
            if isinstance(parsed, dict):
                # Single object -> wrap it
                parsed = [parsed]

            for item in parsed:
                # item should have Name and AppID
                name = item.get("Name") or item.get("name") or ""
                appid = item.get("AppID") or item.get("AppId") or item.get("AppID ")
                # Normalize weird shapes
                if not name or not appid:
                    continue
                e = AppEntry(name=name, kind="uwp", id_or_path=appid, source="powershell:Get-StartApps")
                entries.append(e)
            logger.info(f"Enumerated {len(entries)} UWP entries via PowerShell.")
            return entries
        except Exception as e:
            logger.exception(f"_enumerate_uwp failed: {e}")
            return []

    def _enumerate_registry_and_exes(self) -> List[AppEntry]:
        """
        Build simple exe index by scanning:
         - app_registry.json (user curated)
         - Program Files common places (fast scan)
         - Desktop shortcuts (.lnk) in common folders (Start Menu, Desktop)
        We keep this scan conservative and quick.
        """
        entries: List[AppEntry] = []

        # 1) load app_registry.json (user curated)
        try:
            with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                reg = json.load(f)
            for k, v in reg.items():
                kind = "uwp" if self._is_uwp_identifier(v) else "registry"
                entries.append(AppEntry(name=k, kind=kind, id_or_path=v, source="user:app_registry"))
        except Exception:
            pass

        # 2) quick scan standard folders for .lnk and common exes (non-recursive to avoid slow scans)
        candidate_dirs = [
            os.path.expanduser("~/Desktop"),
            os.path.expanduser("~/Start Menu"),
            r"C:\Program Files",
            r"C:\Program Files (x86)",
            os.path.expanduser("~/AppData/Local/Programs"),
            os.path.expanduser("~/AppData/Roaming/Microsoft/Windows/Start Menu/Programs"),
        ]
        seen_paths = set()

        for d in candidate_dirs:
            if not d:
                continue
            try:
                if os.path.isdir(d):
                    for name in os.listdir(d)[:300]:  # cap per folder to avoid huge scanning time
                        p = os.path.join(d, name)
                        # If .lnk -> treat as shortcut
                        if p.lower().endswith(".lnk") or p.lower().endswith(".url"):
                            nm = os.path.splitext(os.path.basename(p))[0]
                            entries.append(AppEntry(name=nm, kind="lnk", id_or_path=p, source=f"scan:{d}"))
                            seen_paths.add(os.path.abspath(p))
                        # If exe -> include top-level exes
                        elif p.lower().endswith(".exe"):
                            nm = os.path.splitext(os.path.basename(p))[0]
                            abs_p = os.path.abspath(p)
                            if abs_p not in seen_paths:
                                entries.append(AppEntry(name=nm, kind="exe", id_or_path=abs_p, source=f"scan:{d}"))
                                seen_paths.add(abs_p)
            except Exception:
                continue

        # 3) optionally scan Program Files for well-known exe in top-level folders (lightweight)
        for base in (r"C:\Program Files", r"C:\Program Files (x86)"):
            if not os.path.isdir(base):
                continue
            try:
                for child in os.listdir(base)[:200]:
                    child_path = os.path.join(base, child)
                    if os.path.isdir(child_path):
                        # check for common exe names inside folder root
                        for exe_name in (f"{child}.exe", f"{child.lower()}.exe", f"{child.replace(' ', '')}.exe"):
                            p = os.path.join(child_path, exe_name)
                            if os.path.isfile(p):
                                entries.append(AppEntry(name=child, kind="exe", id_or_path=os.path.abspath(p), source="scan:ProgramFiles"))
                                break
            except Exception:
                continue

        logger.info(f"Enumerated {len(entries)} registry/exe/lnk candidates.")
        return entries

    def build_index(self, force_refresh: bool = False):
        """
        Full rebuild of the internal index (UWP + registry/exe). This is the heavy operation.
        """
        try:
            uwp = self._enumerate_uwp()
            exe = self._enumerate_registry_and_exes()
            combined = uwp + exe

            with self._lock:
                # Merge combined entries into index, replacing duplicates intelligently
                for e in combined:
                    self._append_or_replace_entry(e)

            # Save to cache for faster startup next time
            self._save_cache()
            logger.info("Index build complete.")
        except Exception as e:
            logger.exception(f"build_index failed: {e}")

    def _background_refresher(self):
        """
        Smart background: first full refresh (on separate thread), then periodic incremental refresh.
        """
        try:
            logger.info("Background refresher: starting full index build...")
            self.build_index(force_refresh=True)
        except Exception as e:
            logger.warning(f"Background initial build failed: {e}")

        # periodic refresh loop
        while True:
            try:
                time.sleep(self.refresh_interval)
                logger.debug("Background refresher: periodic refresh...")
                self.build_index(force_refresh=True)
            except Exception as e:
                logger.debug(f"Background refresher loop error: {e}")

    # ----------------- search & fuzzy matching -----------------
    def _score(self, query: str, candidate: str) -> float:
        """
        Returns a percent score (0-100).
        Uses RapidFuzz if present for better quality; else difflib SequenceMatcher ratio*100.
        """
        if _HAS_RAPIDFUZZ:
            try:
                return float(fuzz.token_sort_ratio(query, candidate))
            except Exception:
                pass
        # fallback
        return difflib.SequenceMatcher(None, query, candidate).ratio() * 100.0

    def find_candidates(self, query: str, top_k: int = 8) -> List[Dict[str, Any]]:
        """
        Return ranked candidate list with confidence scores.
        """
        qn = self._normalize(query)
        with self._lock:
            all_entries = list(self._index)

        scored = []
        for e in all_entries:
            name_norm = self._normalize(e.name)
            score = self._score(qn, name_norm)
            scored.append((score, e))
        # sort desc
        scored.sort(key=lambda x: x[0], reverse=True)
        out = []
        for score, e in scored[:top_k]:
            out.append({
                "name": e.name,
                "kind": e.kind,
                "id_or_path": e.id_or_path,
                "source": e.source,
                "score": int(round(score)),
            })
        return out

    # ----------------- launch helpers -----------------
    def _launch_uwp(self, appid: str) -> Dict[str, Any]:
        r"""
        Launch UWP app using explorer.exe shell:AppsFolder\<AppID>
        Use explorer.exe which reliably opens AppUserModelIDs.
        """
        try:
            uri = f"shell:AppsFolder\\{appid}"
            subprocess.Popen(["explorer.exe", uri], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return {"status": "launched", "method": "uwp", "path": appid}
        except Exception as e:
            return {"error": str(e), "method": "uwp", "path": appid}

    def _launch_exe_or_lnk(self, path: str) -> Dict[str, Any]:
        """
        Launch an executable or shortcut safely.
        First try os.startfile (Windows preferred). If that fails, try subprocess.Popen([path]).
        """
        try:
            # startfile handles .lnk and .url and typical exe launching on Windows
            os.startfile(path)
            return {"status": "launched", "method": "startfile", "path": path}
        except Exception as e:
            # fallback: try Popen with path only
            try:
                subprocess.Popen([path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                return {"status": "launched", "method": "popen", "path": path}
            except Exception as e2:
                return {"error": f"{e} | {e2}", "method": "popen", "path": path}

    # ----------------- public: resolution & launch -----------------
    def resolve_best(self, query: str) -> Dict[str, Any]:
        """
        Find the best candidate for the query and return structured result with confidence.
        Applies triple-threshold logic and returns 'confidence_level' = excellent|good|low
        """
        candidates = self.find_candidates(query, top_k=8)
        if not candidates:
            return {"error": "no_candidates", "candidates": []}

        best = candidates[0]
        conf = best["score"]

        if conf >= EXCELLENT:
            level = "excellent"
        elif conf >= GOOD:
            level = "good"
        elif conf >= MIN_CONF:
            level = "low"
        else:
            # below MIN_CONF -> treat as no_candidates
            return {"error": "low_confidence", "candidates": candidates}

        return {"match": best, "candidates": candidates, "confidence_level": level}

    def resolve_and_launch(self, query: str) -> Dict[str, Any]:
        """
        Resolve best candidate and attempt to launch. If successful and auto_add True AND confidence is EXCELLENT, add to app_registry.json.
        For GOOD confidences we will be cautious: try alternatives and do not auto_add.
        For LOW confidences we return low_confidence.
        """
        res = self.resolve_best(query)
        # propagate no_candidates / low_confidence properly
        if "error" in res:
            return {"error": res.get("error"), "app": query, "candidates": res.get("candidates", [])}

        best = res["match"]
        confidence_level = res.get("confidence_level", "low")
        candidates = res.get("candidates", [])

        # Try best candidate first
        tried = []
        def _attempt_launch_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
            kind = entry["kind"]
            path = entry["id_or_path"]
            name = entry["name"]
            launch_result = {"app": name, "path": path, "match_confidence": entry["score"], "kind": kind, "matched_key": name, "source": entry.get("source")}
            try:
                if kind == "uwp" or self._is_uwp_identifier(path):
                    r = self._launch_uwp(path)
                else:
                    r = self._launch_exe_or_lnk(path)
                launch_result.update(r)
            except Exception as e:
                launch_result.update({"error": str(e)})
            return launch_result

        # If excellent -> launch best and auto-add on success
        if confidence_level == "excellent":
            launch_result = _attempt_launch_entry(best)
            # only auto_add if the launch succeeded
            if launch_result.get("status") == "launched" and self.auto_add:
                try:
                    self._auto_add_to_registry(best["name"], best["id_or_path"])
                except Exception as e:
                    logger.debug(f"Auto add failed: {e}")
            return launch_result

        # If good -> try best, but if it fails, try other GOOD candidates (score >= GOOD)
        if confidence_level == "good":
            launch_result = _attempt_launch_entry(best)
            if launch_result.get("status") == "launched":
                # do NOT auto_add for GOOD matches (to prevent poisoning registry)
                return launch_result

            # Try other candidates with score >= GOOD
            for cand in candidates[1:]:
                if cand["score"] >= GOOD:
                    lr = _attempt_launch_entry(cand)
                    if lr.get("status") == "launched":
                        # do not auto-add; but update cache so future exact matches are easier
                        with self._lock:
                            self._append_or_replace_entry(AppEntry(name=cand["name"], kind=cand["kind"], id_or_path=cand["id_or_path"], source=cand.get("source","resolved")))
                        return lr
            # no successful launch among GOOD candidates
            return {"error": "launch_failed", "app": query, "reason": "Attempted top GOOD matches but none launched", "candidates": candidates}

        # confidence_level == "low"
        # Return candidates for human confirmation (FunctionRouter should surface)
        return {"error": "low_confidence", "app": query, "candidates": candidates}

    def _auto_add_to_registry(self, name: str, path: str):
        """Add mapping name -> path to app_registry.json (persists automatically).
           Only called for EXCELLENT matches that launched successfully.
        """
        try:
            try:
                with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = {}
            # If entry already exists with same path, skip
            if data.get(name) == path:
                return
            data[name] = path
            _atomic_write_json(REGISTRY_PATH, data)
        except Exception as e:
            logger.debug(f"_auto_add_to_registry write failed: {e}")
        # Also update runtime index (detect kind correctly)
        kind = "uwp" if self._is_uwp_identifier(path) else "registry"
        self._append_or_replace_entry(AppEntry(name=name, kind=kind, id_or_path=path, source="auto_add"))
        logger.info(f"Auto-added '{name}' -> {path} to app_registry.json")

    # ----------------- helper for interactive/debugging -----------------
    def pretty_print_candidates(self, query: str, top_k: int = 8):
        c = self.find_candidates(query, top_k=top_k)
        for i, x in enumerate(c, 1):
            print(f"{i}. {x['name']} ({x['kind']}) [{x['score']}%] -> {x['id_or_path']} ({x['source']})")


# -------------------- quick test harness --------------------
if __name__ == "__main__":
    # CLI test while developing
    am = AppManager(auto_add=True, background_refresh=True, refresh_interval=600)
    print("AppManager running. Type a command (e.g., 'Photos', 'Outlook', 'Spotify') or 'exit'.")
    while True:
        try:
            q = input("Open> ").strip()
            if not q:
                continue
            if q.lower() in ("exit", "quit"):
                break
            print("Candidates:")
            am.pretty_print_candidates(q)
            print("Attempting launch...")
            r = am.resolve_and_launch(q)
            print("RESULT:", json.dumps(r, indent=2))
        except KeyboardInterrupt:
            break
        except Exception as e:
            print("Error:", e)
