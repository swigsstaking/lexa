#!/usr/bin/env python3
"""
bench_ollama_concurrency.py — Bench test de charge Ollama S36
Session 36 — 2026-04-16

Test : 3 clients simultanés × 3 agents × 5 itérations = 45 appels
Agents testés :
  1. /api/rag/classify       — ClassifierAgent (qwen3.5:27b-q8_0)
  2. /api/agents/fiscal-pp/ask — FiscalPpAgent (comptable-suisse)
  3. /api/agents/tva/ask     — TvaAgent (comptable-suisse)

Config DGX Spark : NUM_PARALLEL=2, MAX_LOADED=4
Objectif : mesurer p50/p95 latence sous contention réelle
"""

import json
import time
import threading
import urllib.request
import urllib.error
import statistics
from typing import List, Tuple

BASE_URL = "https://lexa.swigs.online"
QA_EMAIL = "qa@lexa.test"
QA_PASSWORD = "QaLexa-Fixed-2026!"
ITERATIONS = 5
N_CLIENTS = 3
TIMEOUT = 120  # secondes


def do_request(url: str, payload: dict, token: str) -> Tuple[str, float, int]:
    """Effectue un POST et retourne (status, duration_s, http_code)."""
    start = time.time()
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            resp.read()
            dur = time.time() - start
            return ("ok", dur, resp.status)
    except urllib.error.HTTPError as e:
        dur = time.time() - start
        return ("http_error", dur, e.code)
    except Exception as ex:
        dur = time.time() - start
        return ("error", dur, str(ex))


def login() -> str:
    """Authentification et récupération du token JWT."""
    url = f"{BASE_URL}/api/auth/login"
    payload = {"email": QA_EMAIL, "password": QA_PASSWORD}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read())
        token = body.get("token", "")
        if not token:
            raise RuntimeError(f"Login failed: {body}")
        print(f"[bench] Login OK — token: {token[:20]}...")
        return token


def client_worker(client_id: int, token: str, results: List, lock: threading.Lock):
    """Worker pour un client : 3 agents × 5 itérations."""
    agents = [
        (
            f"{BASE_URL}/api/rag/classify",
            {
                "date": "2026-01-15",
                "description": f"Test bench client {client_id}",
                "amount": -50,
                "currency": "CHF",
            },
            "classify",
        ),
        (
            f"{BASE_URL}/api/agents/fiscal-pp/ask",
            {
                "question": "Plafond pilier 3a VS 2026",
                "context": {"commune": "Sion"},
            },
            "fiscal-pp",
        ),
        (
            f"{BASE_URL}/api/agents/tva/ask",
            {"question": "Taux TVA normal Suisse 2026"},
            "tva",
        ),
    ]

    client_results = []
    for iteration in range(ITERATIONS):
        for url, payload, agent_name in agents:
            status, dur, code = do_request(url, payload, token)
            entry = {
                "client": client_id,
                "agent": agent_name,
                "iteration": iteration,
                "status": status,
                "duration": dur,
                "code": code,
            }
            client_results.append(entry)
            print(
                f"  [client-{client_id}] {agent_name} iter={iteration} "
                f"{status} {dur:.2f}s (HTTP {code})"
            )

    with lock:
        results.extend(client_results)


def compute_percentile(sorted_values: List[float], pct: float) -> float:
    """Calcul percentile sur liste triée."""
    if not sorted_values:
        return 0.0
    idx = int(len(sorted_values) * pct)
    idx = min(idx, len(sorted_values) - 1)
    return sorted_values[idx]


def run_bench(run_num: int, token: str) -> dict:
    """Lance un run complet et retourne les stats."""
    print(f"\n{'='*60}")
    print(f"RUN {run_num}/3 — {N_CLIENTS} clients × {ITERATIONS} iter × 3 agents")
    print(f"{'='*60}")

    results = []
    lock = threading.Lock()
    threads = []

    t_start = time.time()
    for cid in range(N_CLIENTS):
        t = threading.Thread(
            target=client_worker, args=(cid, token, results, lock), daemon=True
        )
        threads.append(t)

    # Démarrage simultané des 3 clients
    for t in threads:
        t.start()

    for t in threads:
        t.join(timeout=TIMEOUT * 2)

    total_dur = time.time() - t_start

    # Stats globales
    ok_results = [r for r in results if r["status"] == "ok"]
    err_results = [r for r in results if r["status"] != "ok"]
    durations = sorted([r["duration"] for r in ok_results])

    p50 = compute_percentile(durations, 0.50)
    p95 = compute_percentile(durations, 0.95)
    p99 = compute_percentile(durations, 0.99)
    avg = statistics.mean(durations) if durations else 0
    total_requests = N_CLIENTS * ITERATIONS * len(["classify", "fiscal-pp", "tva"])

    # Stats par agent
    by_agent = {}
    for agent_name in ["classify", "fiscal-pp", "tva"]:
        agent_durs = sorted(
            [r["duration"] for r in ok_results if r["agent"] == agent_name]
        )
        if agent_durs:
            by_agent[agent_name] = {
                "count": len(agent_durs),
                "p50": compute_percentile(agent_durs, 0.50),
                "p95": compute_percentile(agent_durs, 0.95),
                "avg": statistics.mean(agent_durs),
                "min": min(agent_durs),
                "max": max(agent_durs),
            }

    stats = {
        "run": run_num,
        "total_requests": total_requests,
        "ok": len(ok_results),
        "errors": len(err_results),
        "total_wall_time_s": round(total_dur, 2),
        "p50": round(p50, 3),
        "p95": round(p95, 3),
        "p99": round(p99, 3),
        "avg": round(avg, 3),
        "by_agent": {k: {sk: round(sv, 3) for sk, sv in v.items()} for k, v in by_agent.items()},
        "error_details": [
            {"client": r["client"], "agent": r["agent"], "code": r["code"]}
            for r in err_results
        ],
    }

    print(f"\n--- Run {run_num} résultats ---")
    print(f"  Total: {len(ok_results)}/{total_requests} OK, {len(err_results)} erreurs")
    print(f"  Wall time: {total_dur:.1f}s")
    print(f"  p50={p50:.2f}s  p95={p95:.2f}s  p99={p99:.2f}s  avg={avg:.2f}s")
    for agent_name, s in by_agent.items():
        print(
            f"  [{agent_name}] p50={s['p50']:.2f}s  p95={s['p95']:.2f}s  "
            f"avg={s['avg']:.2f}s  min={s['min']:.2f}s  max={s['max']:.2f}s"
        )

    return stats


def aggregate_runs(runs: List[dict]) -> dict:
    """Agrège les 3 runs."""
    all_p50 = [r["p50"] for r in runs]
    all_p95 = [r["p95"] for r in runs]
    all_p99 = [r["p99"] for r in runs]
    all_avg = [r["avg"] for r in runs]
    total_ok = sum(r["ok"] for r in runs)
    total_err = sum(r["errors"] for r in runs)
    total_req = sum(r["total_requests"] for r in runs)

    return {
        "runs": 3,
        "total_requests": total_req,
        "total_ok": total_ok,
        "total_errors": total_err,
        "success_rate_pct": round(total_ok / total_req * 100, 1) if total_req > 0 else 0,
        "avg_p50_s": round(statistics.mean(all_p50), 3),
        "avg_p95_s": round(statistics.mean(all_p95), 3),
        "avg_p99_s": round(statistics.mean(all_p99), 3),
        "avg_latency_s": round(statistics.mean(all_avg), 3),
        "p50_range": f"{min(all_p50):.2f}–{max(all_p50):.2f}s",
        "p95_range": f"{min(all_p95):.2f}–{max(all_p95):.2f}s",
    }


def main():
    print("[bench_ollama_concurrency] Démarrage S36")
    print(f"Config: {N_CLIENTS} clients, {ITERATIONS} iter, 3 agents, 3 runs")
    print(f"DGX Spark: NUM_PARALLEL=2, MAX_LOADED=4")
    print(f"Base URL: {BASE_URL}")

    token = login()

    all_runs = []
    for run_num in range(1, 4):
        stats = run_bench(run_num, token)
        all_runs.append(stats)
        if run_num < 3:
            print(f"\n[bench] Pause 5s entre runs...")
            time.sleep(5)

    agg = aggregate_runs(all_runs)

    print(f"\n{'='*60}")
    print("RÉSULTATS AGRÉGÉS — 3 RUNS")
    print(f"{'='*60}")
    print(f"  Total: {agg['total_ok']}/{agg['total_requests']} ({agg['success_rate_pct']}%)")
    print(f"  p50 moyen:  {agg['avg_p50_s']:.3f}s  (range: {agg['p50_range']})")
    print(f"  p95 moyen:  {agg['avg_p95_s']:.3f}s  (range: {agg['p95_range']})")
    print(f"  p99 moyen:  {agg['avg_p99_s']:.3f}s")
    print(f"  Lat. moy.:  {agg['avg_latency_s']:.3f}s")

    # Sauvegarde JSON pour le rapport
    output = {"config": {"num_parallel": 2, "max_loaded": 4, "clients": N_CLIENTS, "iterations": ITERATIONS}, "runs": all_runs, "aggregate": agg}
    output_path = "bench_ollama_s36_results.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n[bench] Résultats JSON: {output_path}")
    return output


if __name__ == "__main__":
    main()
