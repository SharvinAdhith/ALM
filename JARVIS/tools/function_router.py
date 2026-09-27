# tools/function_router.py
import json
import os
import uuid
import webbrowser
import datetime as dt
from typing import Callable, Dict, Any, Optional, List, Tuple
# at top of file
from tools.app_manager import AppManager


# ========== Tool registry ==========

class ToolSpec:
    def __init__(self, name: str, description: str, args_schema: Dict[str, str], requires_confirmation: bool=False):
        self.name = name
        self.description = description
        self.args_schema = args_schema
        self.requires_confirmation = requires_confirmation

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, Tuple[Callable[..., Any], ToolSpec]] = {}

    def register(self, fn: Callable[..., Any], spec: ToolSpec):
        self._tools[spec.name] = (fn, spec)

    def get(self, name: str):
        return self._tools.get(name)

    def manifest(self) -> List[Dict[str, Any]]:
        out = []
        for name, (fn, spec) in self._tools.items():
            out.append({
                "name": spec.name,
                "description": spec.description,
                "args_schema": spec.args_schema,
                "requires_confirmation": spec.requires_confirmation
            })
        return out

# ========== Router ==========

class FunctionRouter:
    """
    FunctionRouter coordinates LLM-driven function calls:
      - ask LLM whether to respond or call a tool (returns JSON ACTION object)
      - validate args, execute tool, append tool_result to context
      - re-call LLM which MUST return final {"action":"respond","text":"..."}
    """

    def __init__(self, gpt_responder, memory_engine, allowed_read_dirs: Optional[List[str]] = None, actions_log: str = "actions.log"):
        self.gpt = gpt_responder
        self.memory = memory_engine
        self.registry = ToolRegistry()
        self.allowed_read_dirs = allowed_read_dirs or ["."]
        self.actions_log = actions_log
        self.app_manager = AppManager(auto_add=True, background_refresh=True)   # default registry path tools/app_registry.json   
        self._register_default_tools()

    # ---------------- default tools ----------------
    def _register_default_tools(self):
        # get_time
        def get_time():
            now = dt.datetime.now()
            return {"iso": now.isoformat(), "human": now.strftime("%A, %b %d %Y %H:%M:%S")}

        self.registry.register(get_time, ToolSpec(
            name="get_time",
            description="Return the current local time as ISO and human-readable.",
            args_schema={}
        ))

        # open_url (robust)
        def open_url(url: str):
            try:
                # prefer new tab (2)
                opened = webbrowser.open(url, new=2)
            except Exception as e:
                opened = False
            # fallback on Windows to os.startfile
            if not opened and os.name == "nt":
                try:
                    os.startfile(url)
                    opened = True
                except Exception as e:
                    # final fallback: return error
                    return {"error": f"Could not open URL: {e}"}
            if opened:
                return {"status": "opened", "url": url}
            return {"status": "attempted", "url": url}

        self.registry.register(open_url, ToolSpec(
            name="open_url",
            description="Open a URL in the user's default browser. Args: { 'url': 'https://example.com' }",
            args_schema={"url": "string"}
        ))

        # list_files
        def list_files(path: str = ".", limit: int = 50):
            path = os.path.abspath(path)
            try:
                items = os.listdir(path)
                items = items[:limit]
                return {"path": path, "items": items}
            except Exception as e:
                return {"error": str(e)}

        self.registry.register(list_files, ToolSpec(
            name="list_files",
            description="List files in a directory (safe). Args: path, limit.",
            args_schema={"path": "path", "limit": "int"}
        ))

        # read_file (safe: only inside allowed_read_dirs)
        def read_file(path: str, max_chars: int = 2000):
            abs_path = os.path.abspath(path)
            allowed = False
            for d in self.allowed_read_dirs:
                if abs_path.startswith(os.path.abspath(d)):
                    allowed = True
                    break
            if not allowed:
                return {"error": "Access denied to path."}
            try:
                with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                    data = f.read(max_chars)
                return {"path": abs_path, "content": data}
            except Exception as e:
                return {"error": str(e)}

        self.registry.register(read_file, ToolSpec(
            name="read_file",
            description="Read a file (only inside allowed directories). Args: path, max_chars",
            args_schema={"path": "path", "max_chars": "int"}
        ))

        # set_reminder
        def set_reminder(time_iso: str, message: str):
            key = f"reminder:{uuid.uuid4()}"
            value = {"time": time_iso, "message": message}
            try:
                self.memory.remember(key, json.dumps(value))
                return {"id": key, "time": time_iso, "message": message}
            except Exception as e:
                return {"error": str(e)}

        self.registry.register(set_reminder, ToolSpec(
            name="set_reminder",
            description="Set a local reminder (stored in memory.json). Args: time_iso, message",
            args_schema={"time_iso": "string", "message": "string"}
        ))


        def open_app(app_name: str):
            """
            Normalize app name → use enterprise AppManager → return full result dict.
            """
            ALIASES = {
                "photo": "photos",
                "gallery": "photos",
                "image": "photos",
                "mail": "outlook",
                "email": "outlook",
                "msg": "whatsapp",
                "message": "whatsapp",
                "chat": "whatsapp",
                "code": "vs code",
                "vscode": "vs code",
            }
            raw = app_name or ""
            clean = raw.lower().strip()

            # normalize typical user phrasing
            for prefix in ("open ", "launch ", "start ", "run "):
                if clean.startswith(prefix):
                    clean = clean[len(prefix):].strip()
            
            # remove useless filler words
            for filler in ("my ",):
                if clean.startswith(filler):
                    clean = clean[len(filler):].strip()

            # normalize plurals → singular
            if clean.endswith("s"):
                clean = clean[:-1]

            clean = clean.replace(" app", "").strip()
            
            if clean in ALIASES:
                clean = ALIASES[clean]

            result = self.app_manager.resolve_and_launch(clean)
            return result

        self.registry.register(open_app, ToolSpec(
            name="open_app",
            description="Open a desktop application by natural language name (Photos, WhatsApp, VS Code, Outlook).",
            args_schema={"app_name": "string"}
        ))

        
        # register_app
        def register_app(app_name: str, path: str):
            try:
                return self.app_manager.register_app(app_name, path)
            except Exception as e:
                return {"error": str(e)}

        self.registry.register(register_app, ToolSpec(
            name="register_app",
            description="Teach JARVIS a mapping from app name to executable path. Args: { 'app_name': 'Spotify', 'path': 'C:\\...\\Spotify.exe' }",
            args_schema={"app_name": "string", "path": "path"},
            requires_confirmation=True
        ))

        # list_registered_apps
        def list_registered_apps():
            try:
                return self.app_manager.list_apps()
            except Exception as e:
                return {"error": str(e)}

        self.registry.register(list_registered_apps, ToolSpec(
            name="list_registered_apps",
            description="List apps that the user taught JARVIS.",
            args_schema={}
        ))

        # ── web_search ────────────────────────────────────────────────────
        def web_search(query: str):
            """Search Google for any query and open the results in the browser."""
            from urllib.parse import quote_plus
            url = f"https://www.google.com/search?q={quote_plus(query)}"
            try:
                webbrowser.open(url, new=2)
                return {"status": "opened", "query": query, "url": url}
            except Exception as e:
                return {"error": str(e)}

        self.registry.register(web_search, ToolSpec(
            name="web_search",
            description=(
                "Search the web for any topic or question. Opens Google results in the browser. "
                "Use for: news, facts, how-to, current events, anything requiring a live web lookup."
            ),
            args_schema={"query": "string"}
        ))

        # ── youtube_play ──────────────────────────────────────────────────
        def youtube_play(query: str):
            """Search YouTube and open the results so the user can watch/listen."""
            query_clean = query.lower().replace('search youtube for', '').replace('search a video in youtube', '').replace('youtube', '').replace('search', '').strip()
            if not query_clean:
                url = "https://www.youtube.com"
            else:
                from urllib.parse import quote_plus
                url = f"https://www.youtube.com/results?search_query={quote_plus(query_clean)}"
            try:
                webbrowser.open(url, new=2)
                return {"status": "opened", "query": query_clean, "url": url}
            except Exception as e:
                return {"error": str(e)}

        self.registry.register(youtube_play, ToolSpec(
            name="youtube_play",
            description=(
                "Search YouTube and open the results page. If the user just wants to open YouTube, pass an empty string as query. "
                "Use for: 'play [song]', 'open youtube', 'search a video in youtube for [topic]'."
            ),
            args_schema={"query": "string"}
        ))

        # ── image_search ──────────────────────────────────────────────────
        def image_search(query: str):
            """Open Google Image search for the given query."""
            from urllib.parse import quote_plus
            url = f"https://www.google.com/search?q={quote_plus(query)}&tbm=isch"
            try:
                webbrowser.open(url, new=2)
                return {"status": "opened", "query": query, "url": url}
            except Exception as e:
                return {"error": str(e)}

        self.registry.register(image_search, ToolSpec(
            name="image_search",
            description=(
                "Search for and display images on Google Images. "
                "Use for: 'show me images of [topic]', 'find pictures of [topic]', "
                "'what does [thing] look like', 'image search [query]'."
            ),
            args_schema={"query": "string"}
        ))

        # ── open_maps ─────────────────────────────────────────────────────
        def open_maps(location: str):
            """Open Google Maps for a location or directions query."""
            from urllib.parse import quote_plus
            url = f"https://www.google.com/maps/search/{quote_plus(location)}"
            try:
                webbrowser.open(url, new=2)
                return {"status": "opened", "location": location, "url": url}
            except Exception as e:
                return {"error": str(e)}

        self.registry.register(open_maps, ToolSpec(
            name="open_maps",
            description=(
                "Open Google Maps for a location, address, or directions. "
                "Use for: 'show map of [place]', 'directions to [address]', 'where is [place]'."
            ),
            args_schema={"location": "string"}
        ))


    def _coerce_and_validate_args(self, spec: ToolSpec, args: Dict[str, Any]) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        coerced = {}
        for name, typ in (spec.args_schema or {}).items():
            if name not in args:
                return False, f"Missing required arg: {name}", {}
            val = args[name]
            try:
                if typ == "string":
                    coerced[name] = str(val)
                elif typ == "int":
                    coerced[name] = int(val)
                elif typ == "bool":
                    coerced[name] = bool(val)
                elif typ == "path":
                    coerced[name] = str(val)
                else:
                    coerced[name] = val
            except Exception as e:
                return False, f"Invalid type for {name}: {e}", {}
        return True, None, coerced

    def _build_system_prompt(self, tool_manifest: List[Dict[str, Any]]) -> str:
        """
        Strongly-worded system prompt for the tool-planning LLM.

        Goals:
        - Prevent schema drift (model returning ad-hoc JSON like {"action":"open_url", ...}).
        - Force the model to only use two actions: "respond" and "call_tool".
        - Provide exact examples using the currently available tools (manifest).
        - Require a final "respond" after any tool call (when <tool_result> appears in context).
        - If the model is uncertain, it must ask a clarifying question using `respond`.
        """
        # Build a short, precise manifest list (tool name + args schema) for the model
        manifest_text = "\n".join([
            f"- {t['name']}: {t['description']}. Args: {t['args_schema']}. requires_confirmation={t['requires_confirmation']}"
            for t in tool_manifest
        ])

        # List of allowed actions for clarity
        allowed_actions = '["respond", "call_tool"]'

        sys = (
            "You are JARVIS's TOOL PLANNER. STRICT RULES follow — READ CAREFULLY.\n\n"

            "OVERVIEW:\n"
            "You will receive: (1) a short conversation context, and (2) the user's request.\n"
            "Your job is to decide whether to (A) answer directly, or (B) ask the system to run a tool.\n\n"

            "CRITICAL BEHAVIOR SPEC (ENFORCE EXACT JSON ONLY):\n"
            "1) You MUST return EXACTLY one JSON object and NOTHING else (no extra commentary, no markdown).\n"
            f"   Allowed JSON objects (only these forms) are: {allowed_actions}.\n\n"

            "2) If you can answer without calling any tool, return EXACTLY:\n"
            "{\"action\": \"respond\", \"text\": \"<final user-facing answer>\"}\n"
            "   IMPORTANT: NEVER use 'respond' to announce that you are performing an action. If the user asks you to search, play, open, or do something, you MUST use 'call_tool'.\n\n"
            
            "3) If you need to call a tool (e.g. to open youtube or search the web), return EXACTLY one object and NOTHING else, with this form:\n"
            "{\"action\": \"call_tool\", \"tool\": \"<tool_name>\", \"args\": { ... }}\n"
            "   - <tool_name> must be one of the tools listed below (use the exact tool name).\n"
            "   - args must be a JSON object matching the tool's args_schema. Do NOT invent extra fields.\n\n"

            "4) AFTER the tool is executed by the system, the system will call you again and the context will include\n"
            "   a <tool_result> block containing the tool output. When you see <tool_result> in the context,\n"
            "   you MUST return EXACTLY a RESPOND object and NOTHING else. DO NOT CALL ANOTHER TOOL.\n"
            "   Example (after tool result):\n"
            "{\"action\": \"respond\", \"text\": \"I opened the page for you.\"}\n\n"

            "5) NEVER return tool-specific shortcut objects like {\"action\":\"open_url\", ...} or {\"action\":\"list_files\", ...}.\n"
            "   Those are invalid. If you want to open a URL, CALL the open_url tool using the 'call_tool' form above.\n\n"

            "6) If you are uncertain about the user's intent or required arguments, DO NOT call a tool. Instead return\n"
            "{\"action\": \"respond\", \"text\": \"<brief clarifying question>\"}\n"
            "   (Examples: ask for a URL, ask which directory, ask which app name)\n\n"

            "7) Keep JSON minimal. The 'text' field should be concise and user-facing. Use temperature 0 behavior.\n\n"

            "AVAILABLE TOOLS (manifest):\n"
            f"{manifest_text}\n\n"

            "EXAMPLES (exact, minimal forms you MUST follow):\n"
            "A) Respond example:\n"
            "{\"action\": \"respond\", \"text\": \"I can help with that. Do you mean X or Y?\"}\n\n"
            "B) Call tool examples (use exact tool names):\n"
            # We will show examples for common tools if present in manifest_text
            "Example: call get_time (no args):\n"
            "{\"action\": \"call_tool\", \"tool\": \"get_time\", \"args\": {}}\n\n"
            "Example: call open_url:\n"
            "{\"action\": \"call_tool\", \"tool\": \"open_url\", \"args\": {\"url\": \"https://example.com\"}}\n\n"
            "Example: call web_search (for any factual or current web query):\n"
            "{\"action\": \"call_tool\", \"tool\": \"web_search\", \"args\": {\"query\": \"latest news on AI\"}}\n\n"
            "Example: call youtube_play (ALWAYS use this to play songs/videos):\n"
            "{\"action\": \"call_tool\", \"tool\": \"youtube_play\", \"args\": {\"query\": \"Sweater Weather The Neighbourhood\"}}\n\n"
            "Example: call image_search (when user asks to see images/pictures):\n"
            "{\"action\": \"call_tool\", \"tool\": \"image_search\", \"args\": {\"query\": \"golden retriever puppy\"}}\n\n"
            "Example: call open_maps (for location, map, directions requests):\n"
            "{\"action\": \"call_tool\", \"tool\": \"open_maps\", \"args\": {\"location\": \"Eiffel Tower, Paris\"}}\n\n"
            "Example: call open_app:\n"
            "{\"action\": \"call_tool\", \"tool\": \"open_app\", \"args\": {\"app_name\": \"spotify\"}}\n\n"

            "RESPONSE VALIDATION NOTES:\n"
            "- Your output MUST be parseable JSON exactly as shown. If the system cannot parse your JSON, the request will be rejected.\n"
            "- If you produce anything other than the exact required JSON object, the router will ignore it and respond with an error.\n\n"

            "SAFETY:\n"
            "- Do not attempt to perform destructive actions. If the user requests risky actions (delete files, run arbitrary code), ask for explicit confirmation using a 'respond' clarifying question.\n"
            "- Do not return any sensitive credentials or secrets.\n\n"

            "SUMMARY:\n"
            "- Use only the two action forms exactly as provided: 'respond' or 'call_tool'.\n"
            "- Use the exact tool names from the manifest. Match arg names/types.\n"
            "- If uncertain, ask a short clarifying question using 'respond'.\n\n"
            "Now plan: given the user and context, return one JSON object exactly as specified above.\n"
        )
        return sys

    def _call_llm_once(self, user_input: str, semantic_context: str, history: Optional[List[Dict[str, Any]]] = None) -> Optional[str]:
        manifest = self.registry.manifest()
        sys = self._build_system_prompt(manifest)
        
        messages = [{"role": "system", "content": sys}]
        for turn in (history or [])[-12:]:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            if role not in ("user", "assistant"):
                role = "assistant"
            if content:
                messages.append({"role": role, "content": content})
                
        messages.append({"role": "user", "content": f"<context>\n{semantic_context}\n</context>\nUser: {user_input}\nResponse (MUST BE EXACT JSON ONLY):"})
        
        try:
            resp = self.gpt.client.chat.completions.create(
                model=self.gpt.deployment,
                messages=messages,
            )
            text = resp.choices[0].message.content.strip()
            print(f"[FunctionRouter] LLM raw output:\n{text}\n---")
            return text
        except Exception as e:
            print(f"[FunctionRouter._call_llm_once] LLM call failed: {e}")
            return None

    def _parse_json_from_text(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            start = text.find("{")
            if start == -1:
                return None
            last = text.rfind("}")
            if last == -1:
                return None
            json_text = text[start:last+1]
            parsed = json.loads(json_text)
            if parsed and parsed.get("action") == "open_url":
                # normalize into call_tool
                parsed = {
                    "action": "call_tool",
                    "tool": "open_url",
                    "args": {"url": parsed.get("url")}
                }
            print(f"[FunctionRouter] Parsed JSON action: {parsed}")
            return parsed
        except Exception as e:
            print(f"[FunctionRouter] JSON parse failed: {e}\nText was:\n{text}")
            return None

    def _log_action(self, tool_name: str, args: Dict[str, Any], result: Dict[str, Any]):
        entry = {
            "timestamp": dt.datetime.now().isoformat(),
            "tool": tool_name,
            "args": args,
            "result": result
        }
        try:
            with open(self.actions_log, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, default=str) + "\n")
        except Exception as e:
            print(f"[FunctionRouter] Failed to write actions log: {e}")

    def format_human_readable(self, text: str) -> str:
        """Converts raw tool-call JSON string into human-readable action completion prose."""
        if not text or not isinstance(text, str):
            return str(text)
        try:
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                parsed = json.loads(text[start:end+1])
                if isinstance(parsed, dict):
                    action = parsed.get("action")
                    tool = parsed.get("tool") or (action if action != "respond" else None)
                    args = parsed.get("args") or {}

                    if action == "respond" and parsed.get("text"):
                        return parsed.get("text")

                    if tool == "image_search":
                        query = args.get("query", "your request")
                        return f"Opened Google Chrome and searched for images of '{query}'."
                    elif tool == "web_search":
                        query = args.get("query", "your search")
                        return f"Opened Google Chrome tab with search results for '{query}'."
                    elif tool == "youtube_play":
                        query = args.get("query", "video")
                        return f"Opened YouTube in Google Chrome to play '{query}'."
                    elif tool == "open_maps":
                        loc = args.get("location", "the location")
                        return f"Opened Google Maps for '{loc}'."
                    elif tool == "open_app":
                        app = args.get("app_name", "the application")
                        return f"Launched '{app}' on your system."
                    elif tool == "open_url":
                        url = args.get("url", "the webpage")
                        return f"Opened '{url}' in Google Chrome."
                    elif tool:
                        return f"Action completed: '{tool}' executed successfully."
        except Exception:
            pass
        return text

    # ---------------- orchestrator ----------------
    def plan_and_execute(self, user_input: str, semantic_context: str = "", history: Optional[List[Dict[str, Any]]] = None) -> str:
        MAX_STEPS = 4
        step = 0
        last_llm_text = None
        executed_tools = []

        while step < MAX_STEPS:
            step += 1
            print(f"[FunctionRouter] Step {step} — calling LLM")
            llm_text = self._call_llm_once(user_input, semantic_context, history=history)
            last_llm_text = llm_text
            if not llm_text:
                return "I'm having trouble contacting my thinker right now."

            parsed = self._parse_json_from_text(llm_text)
            if not parsed:
                # LLM didn't follow structured output -> return raw text (safe fallback)
                print("[FunctionRouter] LLM did not return structured JSON; returning text as reply.")
                return self.format_human_readable(llm_text.strip())

            action = parsed.get("action")
            if action == "respond":
                text = parsed.get("text", "")
                print(f"[FunctionRouter] Final respond: {text}")
                return self.format_human_readable(text)

            if action == "call_tool":
                tool_name = parsed.get("tool")
                args = parsed.get("args", {})

                entry = self.registry.get(tool_name)
                if not entry:
                    return f"Tool '{tool_name}' is not available."

                fn, spec = entry
                ok, err, coerced = self._coerce_and_validate_args(spec, args)
                if not ok:
                    # Ask LLM to replan with validation failure
                    user_input = f"Tool validation failed: {err}. Original user query: {user_input}"
                    print(f"[FunctionRouter] Tool validation failed: {err}")
                    continue

                # Execute tool (safe)
                try:
                    print(f"[FunctionRouter] Executing tool '{tool_name}' with args: {coerced}")
                    result = fn(**coerced)
                    print(f"[FunctionRouter] Tool result: {result}")
                    executed_tools.append((tool_name, coerced))
                except Exception as e:
                    print(f"[FunctionRouter] Tool execution error: {e}")
                    return f"Tool '{tool_name}' execution failed: {e}"

                # Log action
                self._log_action(tool_name, coerced, result)

                # Append tool result to semantic_context and ask LLM to respond in next iteration
                result_block = json.dumps({"tool": tool_name, "result": result}, default=str)
                semantic_context = (semantic_context or "") + "\n\n" + f"<tool_result> {result_block} </tool_result>"

                # continue loop for LLM to produce final respond; LLM MUST return respond now due to prompt
                continue

            # Unknown action -> return the raw llm_text
            print("[FunctionRouter] Unknown action returned by LLM; returning raw.")
            return self.format_human_readable(llm_text)

        # If tools were executed but max steps exhausted before LLM sent respond
        if executed_tools:
            tool_name, coerced = executed_tools[-1]
            return self.format_human_readable(json.dumps({"action": "call_tool", "tool": tool_name, "args": coerced}))

        # exhausted steps
        print("[FunctionRouter] Max steps exhausted; returning last LLM output.")
        if last_llm_text:
            return self.format_human_readable(last_llm_text)
        return "I couldn't complete that task right now."