# Databricks notebook source
# MAGIC %md
# MAGIC # Device check for the plant data agent
# MAGIC
# MAGIC Answers what Piece 1 cannot know from outside your workspace, before Piece 2 is planned:
# MAGIC
# MAGIC | # | Question |
# MAGIC |---|---|
# MAGIC | 1 | Which serverless environment, Python and Spark you get, and whether the session settings can be set |
# MAGIC | 2 | Whether the package site can be reached with exact versions and fixed hashes |
# MAGIC | 3 | Whether the 178 allowed objects are all present with the expected fingerprint |
# MAGIC | 4 | How this engine shows the tables a query reads (needed by lock 4) |
# MAGIC | 5 | Whether serverless can reach `api.openai.com`, and which models the key can use |
# MAGIC | 6 | Whether Aura can be reached encrypted, and whether a write is refused in a read session |
# MAGIC
# MAGIC **What it does not do:** it reads no table rows, stores nothing, changes nothing outside this session, and prints no key, password, host or organisation ID. With a key it makes at most two tiny model calls, together under $0.001.
# MAGIC
# MAGIC **How to run:** fill in the settings cell, attach serverless, Run all. Copy everything between the two `COPY` lines at the end and send it back.
# MAGIC
# MAGIC **Never paste the key into any cell.** If the key is not in a secret scope yet, leave `KEY_SCOPE` empty: the key checks are skipped and everything else still runs.

# COMMAND ----------

CATALOG = "cmegtmdev"
SCHEMA = "manufacturing_coe"
KEY_SCOPE = ""  # fill in: name of the secret scope that holds the OpenAI key, or leave empty
KEY_NAME = ""  # fill in: name of the key inside that scope, or leave empty
AURA_SCOPE = "nexus_neo4j"
MAKE_MODEL_CALLS = True

# COMMAND ----------

import contextlib
import hashlib
import importlib.metadata as md
import io
import json
import os
import platform
import re
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from collections import Counter

if not (re.fullmatch(r"[A-Za-z0-9_]+", CATALOG) and re.fullmatch(r"[A-Za-z0-9_]+", SCHEMA)):
    raise ValueError("CATALOG and SCHEMA must be plain names")
FQN = f"`{CATALOG}`.`{SCHEMA}`"
REPORT = {}
_SCRUB = [
    (re.compile(r"sk-\S+"), "[key]"),
    (re.compile(r"(?i)bearer\s+\S+"), "Bearer [removed]"),
    (re.compile(r"(?i)[a-z0-9-]+\.databases\.neo4j\.io"), "[aura-host]"),
    (re.compile(r"(?i)\b(s3a?|abfss|gs|wasbs|dbfs)://\S+"), "[storage-path]"),
    (re.compile(r"(?i)\borg-[a-z0-9]{6,}"), "[org]"),
    (re.compile(r"(?i)\bproj_[a-z0-9]{6,}"), "[project]"),
    (re.compile(r"(?i)https?://[^\s/@:]+:[^\s/@]+@"), "https://[credentials]@"),
]


def scrub(text):
    s = str(text)
    for rx, rep in _SCRUB:
        s = rx.sub(rep, s)
    return s


def failure(e):
    return scrub(f"{type(e).__name__}: {e}")[:400]


def record(check, status, **facts):
    REPORT[check] = {"status": status, **facts}
    print(f"{check:<9} {status:<5} " + scrub(json.dumps(facts, default=str))[:700])

# COMMAND ----------

# MAGIC %md ## 1. Environment and session settings

# COMMAND ----------

def _ver(p):
    try:
        return md.version(p)
    except md.PackageNotFoundError:
        return None


def _memory_gb():
    try:
        return round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2**30, 1)
    except (ValueError, OSError, AttributeError):
        return None


record(
    "env", "INFO",
    runtime=os.environ.get("DATABRICKS_RUNTIME_VERSION"),
    python=platform.python_version(),
    spark=spark.version,
    spark_connect="connect" in type(spark).__module__,
    memory_gb=_memory_gb(),
    preinstalled={p: _ver(p) for p in ["openai", "httpx", "httpcore", "certifi", "pydantic", "pandas", "pyarrow", "databricks-sdk", "sqlglot", "neo4j", "pytz"]},
    proxy_variables=sorted(k for k in os.environ if "proxy" in k.lower()),
    openai_variables=sorted(k for k in os.environ if k.upper().startswith("OPENAI")),
)


def _conf(k):
    try:
        return spark.conf.get(k)
    except Exception as e:
        return "unreadable: " + type(e).__name__


WANTED = {"spark.sql.session.timeZone": "UTC", "spark.databricks.execution.timeout": "120"}
before = {k: _conf(k) for k in ["spark.sql.ansi.enabled", *WANTED]}
set_ok = {}
for k, v in WANTED.items():
    try:
        spark.conf.set(k, v)
        set_ok[k] = _conf(k) == v
    except Exception as e:
        set_ok[k] = failure(e)
try:
    spark.sql("SELECT CAST('x' AS INT) AS v").collect()
    cast_text = "no error: ANSI off"
except Exception as e:
    cast_text = "error: ANSI on (" + type(e).__name__ + ")"
restored = {}
for k in WANTED:
    if str(before[k]).startswith("unreadable"):
        restored[k] = "not restored, original unreadable"
        continue
    try:
        spark.conf.set(k, before[k])
        restored[k] = True
    except Exception as e:
        restored[k] = failure(e)
record("session", "PASS" if all(v is True for v in set_ok.values()) else "FAIL", before=before, set_ok=set_ok, cast_text_to_int=cast_text, restored=restored)

# COMMAND ----------

# MAGIC %md ## 2. Packages: exact versions, wheels only, fixed hashes, installed into a temporary folder of this session only

# COMMAND ----------

PINS = [
    ("sqlglot", "30.31.0", "51a876a43edecf8ee6fd4c872cf6713d899c4234256bba0be96a8c7c8d8781e8"),
    ("neo4j", "6.4.1", "f56a281c74355522fc2642df8919bec450115431531b8f3f6fe1cc17acb57a27"),
    ("pytz", "2026.6", "7fed3fee8fd6bd4a2b7b75a8d56021d0624127bf69bd5691f115db929ac570b3"),
]
PKG_DIR = tempfile.mkdtemp(prefix="agent_check_pkgs_")
PACKAGES_READY = False


def _install():
    req = os.path.join(tempfile.mkdtemp(prefix="agent_check_req_"), "requirements.txt")
    with open(req, "w", encoding="utf-8") as f:
        f.write("".join(f"{n}=={v} --hash=sha256:{h}\n" for n, v, h in PINS))
    cmd = [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--no-deps",
           "--only-binary=:all:", "--require-hashes", "--no-cache-dir", "--target", PKG_DIR, "-r", req]
    t0 = time.time()
    try:
        run = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
        rc, tail = run.returncode, scrub((run.stderr or "")[-500:])
    except subprocess.TimeoutExpired:
        rc, tail = "timeout after 240 s", ""
    out = {"pip_exit": rc, "seconds": round(time.time() - t0, 1)}
    if rc != 0:
        out["pip_error_tail"] = tail
    try:
        cfg = subprocess.run([sys.executable, "-m", "pip", "config", "list"], capture_output=True, text=True, timeout=30)
        out["pip_index_settings"] = sorted({line.split("=", 1)[0] for line in cfg.stdout.splitlines() if "index" in line.lower()})
    except (subprocess.TimeoutExpired, OSError) as e:
        out["pip_index_settings"] = failure(e)
    out["pip_variables"] = sorted(k for k in os.environ if k.upper().startswith("PIP_"))
    return rc == 0, out


try:
    ok, out = _install()
    if ok:
        installed = {d.metadata["Name"].lower(): d.version for d in md.distributions(path=[PKG_DIR])}
        out["installed_in_check_folder"] = installed
        already = [n for n, _, _ in PINS if n in sys.modules]
        out["already_loaded_by_environment"] = already
        sys.path.insert(0, PKG_DIR)
        loaded = {}
        for n in ("sqlglot", "neo4j"):
            try:
                m = __import__(n)
                loaded[n] = {"version": getattr(m, "__version__", None), "from_check_folder": os.path.abspath(m.__file__).startswith(os.path.abspath(PKG_DIR))}
            except Exception as e:
                loaded[n] = failure(e)
        out["loaded"] = loaded
        pinned = {n: v for n, v, _ in PINS}
        PACKAGES_READY = all(installed.get(n) == v for n, v in pinned.items()) and all(
            isinstance(x, dict) and x["from_check_folder"] and x["version"] == pinned[n] for n, x in loaded.items())
        if PACKAGES_READY:
            import sqlglot
            out["sqlglot_round_trip"] = sqlglot.parse_one("SELECT a FROM t WHERE b = 'x'", read="databricks").sql(dialect="databricks")
    record("packages", "PASS" if PACKAGES_READY else "FAIL", **out)
except Exception as e:
    record("packages", "FAIL", error=failure(e))

# COMMAND ----------

# MAGIC %md ## 3. Allowed list: names only, no rows

# COMMAND ----------

EXPECTED = """
gold_graph_edges gold_graph_nodes gold_v_asset gold_v_asset_specs gold_v_batch gold_v_batch_inspection
gold_v_batch_movements gold_v_capa gold_v_change_notice gold_v_change_notice_tasks gold_v_change_request
gold_v_characteristic gold_v_complaint gold_v_container gold_v_container_history gold_v_container_process_data
gold_v_customer gold_v_defect gold_v_delivery gold_v_deviation gold_v_eight_d gold_v_employee
gold_v_employee_certifications gold_v_gauge gold_v_gauge_calibrations gold_v_hold gold_v_item_revision gold_v_lab_test
gold_v_material gold_v_measure_point gold_v_ncr gold_v_order_confirmations gold_v_pm gold_v_pm_audit
gold_v_problem_report gold_v_production_order gold_v_resource gold_v_scar gold_v_serial gold_v_spec_parameters
gold_v_spec_revisions gold_v_tool_instance gold_v_vendor gold_v_work_center gold_v_work_order gold_v_work_order_status
silver_cmms__a_pm silver_cmms__asset silver_cmms__assetmeter silver_cmms__assetspec silver_cmms__failurecode
silver_cmms__failurelist silver_cmms__failurereport silver_cmms__inventory silver_cmms__item silver_cmms__jobplan
silver_cmms__labor silver_cmms__labtrans silver_cmms__locations silver_cmms__matusetrans silver_cmms__measurement
silver_cmms__measurepoint silver_cmms__meterreading silver_cmms__person silver_cmms__pm silver_cmms__sr
silver_cmms__workorder silver_cmms__wostatus silver_erp__aenr silver_erp__afko silver_erp__afpo silver_erp__afru
silver_erp__afvc silver_erp__afvv silver_erp__aufk silver_erp__crco silver_erp__crhd silver_erp__crtx silver_erp__csks
silver_erp__eina silver_erp__eine silver_erp__ekbe silver_erp__eket silver_erp__ekko silver_erp__ekpo silver_erp__eord
silver_erp__jest silver_erp__kna1 silver_erp__knmt silver_erp__lfa1 silver_erp__likp silver_erp__lips silver_erp__makt
silver_erp__mapl silver_erp__mara silver_erp__marc silver_erp__mard silver_erp__mast silver_erp__mbew silver_erp__mcha
silver_erp__mkpf silver_erp__mseg silver_erp__pa0001 silver_erp__pa0002 silver_erp__pa0105 silver_erp__plko
silver_erp__plpo silver_erp__qals silver_erp__qamr silver_erp__qamv silver_erp__qave silver_erp__qmel silver_erp__qmfe
silver_erp__qmsm silver_erp__qmur silver_erp__qpct silver_erp__resb silver_erp__stko silver_erp__stpo silver_erp__t001
silver_erp__t001l silver_erp__t001w silver_erp__t024 silver_erp__t024d silver_erp__tj02t silver_erp__vbak
silver_erp__vbap silver_erp__vbep silver_erp__vbrk silver_erp__vbrp silver_mes__audit_log silver_mes__component_issue
silver_mes__container silver_mes__data_collection silver_mes__defect silver_mes__employee
silver_mes__employee_certification silver_mes__history_mainline silver_mes__hold silver_mes__mfg_order
silver_mes__product silver_mes__resource silver_mes__resource_status_history silver_mes__serial_test_result
silver_mes__shift_performance silver_mes__spec silver_mes__spec_parameter silver_mes__tool_life
silver_mes__workflow_step silver_plm__tc_bom_line silver_plm__tc_bop_operation silver_plm__tc_change_notice
silver_plm__tc_change_relation silver_plm__tc_change_request silver_plm__tc_characteristic silver_plm__tc_control_plan
silver_plm__tc_dataset silver_plm__tc_dfmea silver_plm__tc_item silver_plm__tc_item_revision silver_plm__tc_pfmea
silver_plm__tc_problem_report silver_plm__tc_user silver_plm__tc_workflow_task silver_qms__audit_finding
silver_qms__calibration silver_qms__capa silver_qms__customer_complaint silver_qms__deviation silver_qms__eight_d
silver_qms__gauge silver_qms__internal_audit silver_qms__lab_test silver_qms__lpa_result silver_qms__ncr
silver_qms__ncr_trace silver_qms__ppap silver_qms__scar
""".split()
EXPECTED_FP = "d9b7723b23cca21e"


def _fp(names):
    return hashlib.sha256("\n".join(sorted(names)).encode()).hexdigest()[:16]


def _prefix(n):
    for p in ["silver_", "bronze_", "gold_v_", "gold_graph_", "gold_", "pdm_", "v2_", "ops_", "agent_"]:
        if n.startswith(p):
            return p
    return "other"


LIVE = []
try:
    if len(EXPECTED) != 178 or _fp(EXPECTED) != EXPECTED_FP:
        raise ValueError("the list in this notebook is damaged")
    rows = spark.sql(f"SHOW TABLES IN {FQN}").collect()
    LIVE = sorted({r["tableName"] for r in rows if not r["isTemporary"]})
    like_allowed = {n for n in LIVE if (n.startswith("silver_") and not n.endswith("__history")) or n.startswith("gold_v_") or n in ("gold_graph_nodes", "gold_graph_edges")}
    missing = sorted(set(EXPECTED) - set(LIVE))
    record(
        "allowed", "PASS" if not missing else "FAIL",
        expected=len(EXPECTED), present=len(set(EXPECTED) & set(LIVE)), missing=missing,
        new_objects_matching_allowed_pattern=sorted(like_allowed - set(EXPECTED)),
        fingerprint_of_present=_fp(set(EXPECTED) & set(LIVE)),
        objects_in_schema_by_prefix=dict(Counter(_prefix(n) for n in LIVE)),
        usage_table_names_taken=[n for n in ("agent_usage_log", "agent_answer_cache") if n in LIVE],
    )
except Exception as e:
    record("allowed", "FAIL", error=failure(e))

# COMMAND ----------

# MAGIC %md ## 4. Query plans: which real tables a query would read (EXPLAIN only, nothing is read)

# COMMAND ----------

_REL = re.compile(r"Relation\s+([`\w.]+?)\[")
_VIEW = re.compile(r"View \(\s*([`\w.]+)")


def _analyzed(txt):
    a = txt.find("== Analyzed Logical Plan ==")
    if a < 0:
        return ""
    b = txt.find("== Optimized Logical Plan ==", a + 1)
    return txt[a:b] if b > a else txt[a:]


def _plan(sql, args=None):
    t0 = time.time()
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        spark.sql(sql, args=args).explain(mode="extended")
    txt = buf.getvalue()
    ana = _analyzed(txt)
    return {
        "ms": int((time.time() - t0) * 1000),
        "sections": re.findall(r"== ([^=\n]+?) ==", txt),
        "relations": sorted({m.replace("`", "") for m in _REL.findall(ana)}),
        "views": sorted({m.replace("`", "") for m in _VIEW.findall(ana)}),
        "parameters_bound": "namedparameter" not in ana.lower() and "UNBOUND_SQL_PARAMETER" not in ana,
        "analyzed_plan": scrub(ana)[:2500],
    }


def _explain_statement(sql, args=None):
    ana = _analyzed(spark.sql("EXPLAIN EXTENDED " + sql, args=args).collect()[0][0])
    return {"relations": sorted({m.replace("`", "") for m in _REL.findall(ana)}),
            "parameters_bound": "namedparameter" not in ana.lower() and "UNBOUND_SQL_PARAMETER" not in ana}


def _short(names):
    return sorted(n.rsplit(".", 1)[-1] for n in names)


PLAN_READY = False
try:
    bronze = "bronze_erp__mseg" if "bronze_erp__mseg" in LIVE else next((n for n in LIVE if n.startswith("bronze_")), None)
    cases = {
        "view": (f"SELECT count(*) AS n FROM {FQN}.`gold_v_batch`", None),
        "join_with_parameter": (f"SELECT m.`bwart`, count(*) AS n FROM {FQN}.`silver_erp__mseg` AS m JOIN {FQN}.`gold_v_batch` AS b ON b.`material` = m.`matnr` WHERE m.`bwart` = :p0 GROUP BY m.`bwart`", {"p0": "101"}),
    }
    if bronze:
        cases["outside_list"] = (f"SELECT count(*) AS n FROM {FQN}.`{bronze}`", None)
    plans = {}
    for name, (sql, args) in cases.items():
        try:
            plans[name] = _plan(sql, args)
        except Exception as e:
            plans[name] = {"error": failure(e)}
    try:
        plans["explain_statement_with_parameter"] = _explain_statement(*cases["join_with_parameter"])
    except Exception as e:
        plans["explain_statement_with_parameter"] = {"error": failure(e)}
    try:
        spark.sql(f"SELECT `matnr` FROM {FQN}.`silver_erp__mseg`").createOrReplaceTempView("agent_check_step")
        plans["session_view"] = _plan("SELECT count(*) AS n FROM agent_check_step")
    except Exception as e:
        plans["session_view"] = {"error": failure(e)}
    finally:
        try:
            spark.catalog.dropTempView("agent_check_step")
        except Exception as e:
            plans["session_view_drop"] = failure(e)
    PLAN_READY = (
        all(plans[n].get("relations") and plans[n].get("parameters_bound") for n in [*cases, "session_view"] if n in plans)
        and "silver_erp__mseg" in _short(plans.get("session_view", {}).get("relations", []))
        and (not bronze or bronze in _short(plans.get("outside_list", {}).get("relations", [])))
    )
    record("plans", "PASS" if PLAN_READY else "FAIL", **plans)
except Exception as e:
    record("plans", "FAIL", error=failure(e))

# COMMAND ----------

# MAGIC %md ## 5. Secrets: names only, never values

# COMMAND ----------

KEY_READY = False
AURA_READY = False


def _key_shape():
    k = dbutils.secrets.get(KEY_SCOPE, KEY_NAME)
    kind = next((p for p in ("sk-proj-", "sk-svcacct-", "sk-admin-", "sk-") if k.startswith(p)), "other")
    return {"kind": kind, "length": len(k), "surrounding_whitespace": k != k.strip()}


try:
    scopes = {s.name for s in dbutils.secrets.listScopes()}

    def _keys(scope):
        return {k.key for k in dbutils.secrets.list(scope)} if scope in scopes else set()

    facts = {"scopes_visible": len(scopes), "aura_scope_found": AURA_SCOPE in scopes,
             "aura_keys_present": sorted(_keys(AURA_SCOPE) & {"aura_uri", "aura_user", "aura_password"})}
    AURA_READY = len(facts["aura_keys_present"]) == 3
    if KEY_SCOPE:
        facts["key_scope_found"] = KEY_SCOPE in scopes
        facts["key_found"] = KEY_NAME in _keys(KEY_SCOPE)
        KEY_READY = facts["key_found"]
        if KEY_READY:
            facts["key_shape"] = _key_shape()
    else:
        facts["key_checks"] = "skipped, KEY_SCOPE empty"
    record("secrets", "PASS" if AURA_READY and (KEY_READY or not KEY_SCOPE) else "FAIL", **facts)
except Exception as e:
    record("secrets", "FAIL", error=failure(e))

# COMMAND ----------

# MAGIC %md ## 6. Network: can serverless reach OpenAI over TLS (no key sent)

# COMMAND ----------

import httpx

OPENAI_HOST = "api.openai.com"


def _tls_probe(host):
    ctx = ssl.create_default_context()
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    t0 = time.time()
    with socket.create_connection((host, 443), timeout=10) as raw:
        with ctx.wrap_socket(raw, server_hostname=host) as s:
            issuer = dict(x[0] for x in s.getpeercert().get("issuer", ()))
            return {"tls": s.version(), "certificate_issuer": issuer.get("organizationName"), "ms": int((time.time() - t0) * 1000)}


def _unauthenticated(trust_env):
    with httpx.Client(trust_env=trust_env, follow_redirects=False, timeout=httpx.Timeout(15.0, connect=10.0)) as h:
        return h.get(f"https://{OPENAI_HOST}/v1/models").status_code


NETWORK_READY = False
facts = {}
try:
    facts["direct_tls"] = _tls_probe(OPENAI_HOST)
except Exception as e:
    facts["direct_tls"] = failure(e)
try:
    facts["direct_status_without_key"] = _unauthenticated(False)
    NETWORK_READY = facts["direct_status_without_key"] == 401
except Exception as e:
    facts["direct_status_without_key"] = failure(e)
if not NETWORK_READY:
    try:
        facts["status_through_environment_proxy"] = _unauthenticated(True)
    except Exception as e:
        facts["status_through_environment_proxy"] = failure(e)
record("network", "PASS" if NETWORK_READY else "FAIL", **facts)

# COMMAND ----------

# MAGIC %md ## 7. Model access: which models the key can use, one tiny call each (skipped without a key)

# COMMAND ----------

PRICES = {"luna": (0.10, 0.01, 0.50), "gpt-4o-mini": (0.15, 0.075, 0.60)}
PING = {
    "type": "function", "name": "ping", "description": "Connectivity test.", "strict": True,
    "parameters": {"type": "object", "properties": {"n": {"type": "integer"}}, "required": ["n"], "additionalProperties": False},
}


MAX_REPLY_BYTES = 1_000_000


class _KeyAuth(httpx.Auth):
    def auth_flow(self, request):
        if request.url.scheme != "https" or request.url.host != OPENAI_HOST or request.url.port not in (None, 443):
            raise RuntimeError("host not allowed")
        for h in ("OpenAI-Organization", "OpenAI-Project", "Cookie"):
            request.headers.pop(h, None)
        request.headers["Authorization"] = "Bearer " + dbutils.secrets.get(KEY_SCOPE, KEY_NAME).strip()
        try:
            yield request
        finally:
            request.headers["Authorization"] = "removed"


class _ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(f"http {status}, code {code}")
        self.status, self.code, self.message = status, code, message


class _BadReply(Exception):
    pass


def _client(transport=None):
    return httpx.Client(base_url=f"https://{OPENAI_HOST}/v1", auth=_KeyAuth(), trust_env=False, follow_redirects=False,
                        verify=True, timeout=httpx.Timeout(60.0, connect=10.0), transport=transport,
                        headers={"Accept": "application/json"})


def _call(c, method, path, body=None):
    if path not in ("/models", "/responses"):
        raise ValueError("path not allowed")
    with c.stream(method, path, json=body) as r:
        buf = bytearray()
        for chunk in r.iter_bytes():
            buf += chunk
            if len(buf) > MAX_REPLY_BYTES:
                raise _BadReply("reply larger than allowed")
        status = r.status_code
        ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
        limits = {k.lower(): v for k, v in r.headers.items() if k.lower().startswith("x-ratelimit-")}
    if 300 <= status < 400:
        raise _BadReply(f"redirect {status} refused")
    d = None
    if ctype == "application/json":
        try:
            d = json.loads(bytes(buf))
        except ValueError:
            d = None
    if status >= 400:
        err = d.get("error") if isinstance(d, dict) else None
        err = err if isinstance(err, dict) else {}
        code = err.get("code") if isinstance(err.get("code"), str) else None
        msg = err.get("message") if isinstance(err.get("message"), str) else "no readable error body"
        raise _ApiError(status, code, scrub(msg)[:200])
    if status != 200 or not isinstance(d, dict):
        raise _BadReply(f"unexpected reply: http {status}, type {ctype[:40] or 'none'}")
    return d, limits


def _need(d, key, typ):
    v = d.get(key) if isinstance(d, dict) else None
    if not isinstance(v, typ) or (typ is int and (isinstance(v, bool) or v < 0)):
        raise _BadReply(f"field {key} missing or wrong type")
    return v


def _optional_count(d, outer, inner):
    v = d.get(outer)
    if v is None:
        return None
    v = v.get(inner) if isinstance(v, dict) else "bad"
    if v is None:
        return None
    if not isinstance(v, int) or isinstance(v, bool) or v < 0:
        raise _BadReply(f"field {outer}.{inner} wrong type")
    return v


def _parse_models(d):
    if d.get("object") != "list":
        raise _BadReply("not a model list")
    return sorted(_need(m, "id", str) for m in _need(d, "data", list))


def _parse_response(d):
    if d.get("object") != "response":
        raise _BadReply("not a response object")
    items = []
    for o in _need(d, "output", list):
        t = _need(o, "type", str)
        item = {"type": t}
        if t == "function_call":
            item.update(name=_need(o, "name", str), arguments=_need(o, "arguments", str), call_id=_need(o, "call_id", str))
        elif t == "reasoning":
            ec = o.get("encrypted_content")
            if ec is not None and not isinstance(ec, str):
                raise _BadReply("field encrypted_content wrong type")
            item["encrypted"] = bool(ec)
        items.append(item)
    u = _need(d, "usage", dict)
    usage = {"input": _need(u, "input_tokens", int), "output": _need(u, "output_tokens", int),
             "cached": _optional_count(u, "input_tokens_details", "cached_tokens") or 0,
             "reasoning": _optional_count(u, "output_tokens_details", "reasoning_tokens")}
    if usage["cached"] > usage["input"]:
        raise _BadReply("cached tokens exceed input tokens")
    return _need(d, "status", str), _need(d, "model", str), items, usage


def _api_error(e):
    if isinstance(e, _ApiError):
        return {"error": "api", "http_status": e.status, "code": e.code, "message": e.message}
    return {"error": failure(e)}


def _tiny(c, model, reasoning):
    body = {"model": model, "input": "Call the ping tool with n set to 7.", "tools": [PING], "tool_choice": "required",
            "parallel_tool_calls": False, "max_output_tokens": 800, "store": False}
    if reasoning:
        body["reasoning"] = {"effort": "low"}
        body["include"] = ["reasoning.encrypted_content"]
    t0 = time.time()
    d, limits = _call(c, "POST", "/responses", body)
    status, reported, items, u = _parse_response(d)
    p_in, p_cached, p_out = PRICES["luna" if reasoning else "gpt-4o-mini"]
    call = next((o for o in items if o["type"] == "function_call"), None)
    try:
        args = json.loads(call["arguments"]) if call else None
    except ValueError:
        args = None
    return {
        "status": status, "model_reported": reported, "ms": int((time.time() - t0) * 1000),
        "output_types": [o["type"] for o in items],
        "tool_called": bool(call and call["name"] == "ping"),
        "arguments_ok": args == {"n": 7},
        "encrypted_reasoning_returned": any(o.get("encrypted") for o in items if o["type"] == "reasoning"),
        "tokens": u,
        "cost_usd": round(((u["input"] - u["cached"]) * p_in + u["cached"] * p_cached + u["output"] * p_out) / 1e6, 6),
        "rate_limits": limits,
    }


def _model_check(transport=None):
    out = {}
    with _client(transport) as c:
        try:
            ids = _parse_models(_call(c, "GET", "/models")[0])
            out["models_listed"] = len(ids)
            out["relevant_ids"] = [i for i in ids if "luna" in i or i.startswith("gpt-4o-mini") or i.startswith("gpt-6")]
        except Exception as e:
            ids = None
            out["models_listed"] = _api_error(e)
        luna = "gpt-6-luna" if ids is None or "gpt-6-luna" in ids else next((i for i in ids if "luna" in i), None)
        mini = "gpt-4o-mini" if ids is None or "gpt-4o-mini" in ids else None
        out["calls"] = {}
        if MAKE_MODEL_CALLS:
            for model, reasoning in ((luna, True), (mini, False)):
                if not model:
                    continue
                try:
                    out["calls"][model] = _tiny(c, model, reasoning)
                except Exception as e:
                    out["calls"][model] = _api_error(e)
    usable = [m for m, r in out["calls"].items() if r.get("tool_called") and r.get("arguments_ok")]
    out["chosen_by_auto"] = next((m for m in usable if "luna" in m), usable[0] if usable else None)
    if not MAKE_MODEL_CALLS:
        return "INFO", out
    return ("PASS" if usable else "FAIL"), out


if not KEY_READY:
    record("models", "SKIP", reason="no key found in the settings cell's scope")
elif not NETWORK_READY:
    record("models", "SKIP", reason="api.openai.com not reachable, see network")
else:
    try:
        status, out = _model_check()
        record("models", status, **out)
    except Exception as e:
        record("models", "FAIL", error=failure(e))

try:
    from databricks.sdk import WorkspaceClient
    eps = list(WorkspaceClient().serving_endpoints.list())
    external = []
    for ep in eps:
        for se in (getattr(getattr(ep, "config", None), "served_entities", None) or []):
            em = getattr(se, "external_model", None)
            if em is not None and "openai" in str(getattr(em, "provider", "")).lower():
                external.append({"endpoint": ep.name, "model": getattr(em, "name", None)})
    record("serving", "INFO", endpoints_visible=len(eps), openai_external_endpoints=external)
except Exception as e:
    record("serving", "INFO", error=failure(e))

# COMMAND ----------

# MAGIC %md ## 8. Aura: encrypted connection, read works, write refused in a read session (inside a transaction that is always rolled back)

# COMMAND ----------

def _aura_check(allowed_schemes=("neo4j+s",)):
    import neo4j
    uri = dbutils.secrets.get(AURA_SCOPE, "aura_uri")
    scheme = uri.split("://", 1)[0].lower()
    if scheme not in allowed_schemes:
        return "FAIL", {"scheme": scheme, "reason": "scheme refused, only " + ", ".join(allowed_schemes)}
    out = {"scheme": scheme, "driver": neo4j.__version__}
    t0 = time.time()
    drv = neo4j.GraphDatabase.driver(uri, auth=(dbutils.secrets.get(AURA_SCOPE, "aura_user"), dbutils.secrets.get(AURA_SCOPE, "aura_password")), connection_timeout=30.0)
    try:
        drv.verify_connectivity()
        out["connect_ms"] = int((time.time() - t0) * 1000)
        out["server"] = drv.get_server_info().agent
        with drv.session(default_access_mode=neo4j.READ_ACCESS) as s:
            out["read"] = s.run("RETURN 1 AS one").single()["one"] == 1
        with drv.session(default_access_mode=neo4j.READ_ACCESS) as s:
            try:
                with s.begin_transaction() as tx:
                    tx.run("CREATE (p:AgentDeviceCheckProbe) RETURN count(p) AS c").consume()
                    tx.rollback()
                out["write_in_read_session"] = "NOT refused (rolled back, nothing kept)"
            except neo4j.exceptions.Neo4jError as e:
                out["write_in_read_session"] = "refused: " + str(e.code or type(e).__name__)
    finally:
        drv.close()
    ok = out.get("read") is True and out["write_in_read_session"].startswith("refused")
    return ("PASS" if ok else "FAIL"), out


if not (PACKAGES_READY and AURA_READY):
    record("aura", "SKIP", reason="neo4j package or Aura secrets missing, see packages and secrets")
else:
    try:
        status, out = _aura_check()
        record("aura", status, **out)
    except Exception as e:
        record("aura", "FAIL", error=failure(e))

# COMMAND ----------

# MAGIC %md ## 9. Report

# COMMAND ----------

def _secrets_absent(text):
    found = []
    pairs = [(AURA_SCOPE, k) for k in ("aura_uri", "aura_user", "aura_password")]
    if KEY_READY:
        pairs.append((KEY_SCOPE, KEY_NAME))
    for scope, key in pairs:
        try:
            v = dbutils.secrets.get(scope, key)
        except Exception as e:
            found.append(f"{key} (could not be checked: {type(e).__name__})")
            continue
        if len(v) >= 6 and v in text:
            found.append(key)
    return not found, found


REPORT["_notebook"] = {"version": "2026-11-26.2", "order": list(REPORT)}
text = scrub(json.dumps(REPORT, indent=1, default=str))
clean, leaked = _secrets_absent(text)
if not clean:
    raise RuntimeError("report withheld, secret check failed for: " + ", ".join(leaked))
for k, v in REPORT.items():
    if k != "_notebook":
        print(f"{k:<9} {v['status']}")
print("secrets absent from report: yes")
print("===== COPY FROM HERE =====")
print(text)
print("===== COPY TO HERE =====")
