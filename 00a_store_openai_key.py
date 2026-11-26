# Databricks notebook source
# MAGIC %md
# MAGIC # Store the OpenAI key in its own secret scope
# MAGIC
# MAGIC The key is typed into a hidden password box that this notebook opens. It is never typed into a cell, so it never enters the notebook's saved code or revision history.
# MAGIC
# MAGIC | Step | What happens |
# MAGIC |---|---|
# MAGIC | 1 | Creates the scope if it does not exist. Databricks gives its creator full rights |
# MAGIC | 2 | Reads who can access the scope. If anyone besides you is listed, it stops; if it created the scope in this run, it deletes the empty scope again |
# MAGIC | 3 | Opens a hidden password box and stores what you type. It never prints it, only its length and how it starts (`sk-proj-`, `sk-`, ...) |
# MAGIC | 4 | Checks the access list again and reads the value back to confirm it was stored exactly |
# MAGIC
# MAGIC **Run it twice:**
# MAGIC
# MAGIC 1. With `STEP = "dummy"`: make up a word that is in no cell, for example a fruit and a number, and type it in the box. Afterwards press Ctrl+F and search the page for your word, and look through the notebook's revision history too. It must not appear anywhere. If it does, stop and report back; do not do run 2.
# MAGIC 2. With `STEP = "real"`: paste the real key in the box. It overwrites the dummy value.
# MAGIC
# MAGIC Then use Clear all outputs. Send back only the lines between the two `COPY` markers.
# MAGIC
# MAGIC **Who can read the key afterwards:** you, and workspace admins (they can read every scope, and no setting changes that). Nobody else, unless you grant it.

# COMMAND ----------

KEY_SCOPE = "nexus_openai"
KEY_NAME = "api_key"
STEP = "dummy"  # fill in: "dummy" for the first run, then "real" for the second run

# COMMAND ----------

import getpass
import json
import re


class Stop(Exception):
    pass


def _perm(a):
    return str(getattr(a.permission, "value", a.permission)).upper()


def _others(w, scope, me):
    return [{"principal": a.principal if a.principal != me else "you", "permission": _perm(a)}
            for a in w.secrets.list_acls(scope=scope) if not (a.principal == me and _perm(a) == "MANAGE")]


def _shown(acl):
    return [{"principal": x["principal"] if "@" not in x["principal"] else "another user", "permission": x["permission"]} for x in acl]


def _kind(v):
    return next((p for p in ("sk-proj-", "sk-svcacct-", "sk-admin-", "sk-") if v.startswith(p)), "other")


def _check_value(step, v):
    if step == "dummy":
        if v.startswith("sk-"):
            raise Stop("dummy run: this looks like a real key; nothing stored. Type a made-up word")
        if not re.fullmatch(r"[A-Za-z0-9]{6,40}", v):
            raise Stop("dummy run: type a made-up word of 6 to 40 letters or digits")
        return
    if not re.fullmatch(r"sk-[A-Za-z0-9_\-]{20,300}", v):
        raise Stop(f"real run: this does not look like an OpenAI key (length {len(v)}, starts with {_kind(v)}); nothing stored")


def store_key(w, read_value, secrets_get, scope=KEY_SCOPE, key=KEY_NAME, step=STEP):
    if not (re.fullmatch(r"[A-Za-z0-9_.\-]{1,128}", scope) and re.fullmatch(r"[A-Za-z0-9_.\-]{1,128}", key)):
        raise Stop("KEY_SCOPE and KEY_NAME must be plain names")
    if step not in ("dummy", "real"):
        raise Stop('STEP must be "dummy" or "real"')
    out = {"step": step, "scope": scope, "key": key}
    me = w.current_user.me().user_name
    existing = {s.name for s in w.secrets.list_scopes()}
    created = False
    if scope in existing:
        keys = sorted(s.key for s in w.secrets.list_secrets(scope=scope))
        if any(k != key for k in keys):
            raise Stop(f"scope {scope} already holds other entries ({len(keys)}); it is not ours, nothing changed")
    else:
        try:
            w.secrets.create_scope(scope=scope)
        except Exception as e:
            raise Stop(f"could not create scope {scope}: {type(e).__name__}: {e}"[:300]) from None
        created = True
    out["scope_created_now"] = created
    others = _others(w, scope, me)
    if others:
        if created:
            w.secrets.delete_scope(scope=scope)
        raise Stop(f"others can access the scope: {_shown(others)}; "
                   + ("the empty scope was deleted again" if created else "nothing stored") + "; the key was not asked for")
    out["access_before"] = "only you (plus workspace admins)"
    value = read_value(f"{'Type your made-up word' if step == 'dummy' else 'Paste the OpenAI key'} and press Enter (hidden): ").strip()
    try:
        _check_value(step, value)
        try:
            w.secrets.put_secret(scope=scope, key=key, string_value=value)
        except Exception as e:
            raise Stop("storing failed: " + f"{type(e).__name__}: {e}".replace(value, "[value]")[:300]) from None
        out["stored_length"] = len(value)
        out["stored_kind"] = _kind(value) if step == "real" else "dummy"
        out["read_back_matches"] = secrets_get(scope, key) == value
    finally:
        value = None
    others = _others(w, scope, me)
    out["access_after"] = "only you (plus workspace admins)" if not others else _shown(others)
    out["entries_in_scope"] = sorted(s.key for s in w.secrets.list_secrets(scope=scope))
    out["status"] = "PASS" if out["read_back_matches"] and not others and out["entries_in_scope"] == [key] else "FAIL"
    return out


# COMMAND ----------

from databricks.sdk import WorkspaceClient

try:
    result = store_key(WorkspaceClient(), getpass.getpass, dbutils.secrets.get)
except Stop as e:
    result = {"step": STEP, "status": "STOPPED", "reason": str(e)}
print("===== COPY FROM HERE =====")
print(json.dumps(result, indent=1))
print("===== COPY TO HERE =====")
