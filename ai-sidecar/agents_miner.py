"""Sovereign Active-Learning & Analytical Mining Agent (Hana 6).

Processes raw operational metrics mined from PostgreSQL tables,
enforces Section 4 re-derivation checks (`The One Law: Fluency vs. Verification`),
and auto-distills verified patterns into candidate institutional facts (`[VERIFIED STATS]`)
saved in pgvector via `knowledge.save_fact`.
"""
import json
import logging
from typing import Any, Dict, List

import requests

from config import BACKEND_URL, internal_headers
import knowledge

logger = logging.getLogger("agents_miner")


def run_analytics_miner(workspace_id: str, payload_patterns: Dict[str, Any] = None) -> Dict[str, Any]:
    """Execute the active-learning mining loop for a workspace.

    If `payload_patterns` is provided from NATS (`events.analytics.mine_requested`),
    it processes those patterns directly. Otherwise, it invokes the backend's
    `/internal/analytics/mine` endpoint to re-derive metrics live.
    """
    logger.info(f"💎 [Miner Agent] Starting active-learning mining for workspace {workspace_id}")

    patterns = payload_patterns
    if not patterns:
        try:
            res = requests.post(
                f"{BACKEND_URL}/internal/analytics/mine",
                headers=internal_headers(workspace_id),
                timeout=30,
            )
            if res.status_code == 200:
                data = res.json()
                patterns = data.get("patterns", {})
            else:
                logger.error(f"❌ [Miner Agent] Backend returned {res.status_code}: {res.text}")
                return {"status": "error", "message": f"backend status {res.status_code}"}
        except Exception as e:
            logger.error(f"❌ [Miner Agent] HTTP request error: {e}")
            return {"status": "error", "message": str(e)}

    if not patterns:
        return {"status": "skipped", "message": "no patterns found"}

    # 1. Enforce Section 4 Mathematical Re-Derivation & Epistemic Verification
    insufficient: List[str] = []
    distilled_facts = verify_and_distill_patterns(patterns, insufficient)
    for note in insufficient:
        logger.info(f"🔍 [Miner Agent] {note}")

    # 2. Reconcile against the facts already in pgvector.
    #
    # The previous rule ("skip when the first 40 characters match") froze the
    # memory permanently: every fact of a given kind opens with the same fixed
    # Arabic prefix, so once "معدل إغلاق الصفقات الناجحة يبلغ 12%" was stored, an
    # updated 31% was rejected as a duplicate — forever. Agents then quoted a
    # months-old number carrying a [VERIFIED STATS] label.
    #
    # Facts are keyed by *kind* instead: a new figure for a kind we already track
    # replaces the stale one, so the memory stays true rather than merely unique.
    existing_facts = knowledge.list_facts(workspace_id) or []

    saved_count, replaced_count, unchanged_count = 0, 0, 0
    for new_fact in distilled_facts:
        key = _fact_key(new_fact)
        prior = next(
            (f for f in existing_facts
             if isinstance(f, dict) and f.get("content") and _fact_key(f["content"]) == key),
            None,
        )

        if prior is None:
            logger.info(f"💾 [Miner Agent] New fact: {new_fact}")
            knowledge.save_fact(workspace_id, new_fact)
            saved_count += 1
            continue

        if prior.get("content", "").strip() == new_fact.strip():
            unchanged_count += 1
            continue

        # Same metric, different figure — the stored one is now wrong.
        logger.info(f"♻️ [Miner Agent] Refreshing fact [{key}]: {prior.get('content')} → {new_fact}")
        if knowledge.save_fact(workspace_id, new_fact) and prior.get("id"):
            knowledge.delete_fact(workspace_id, prior["id"])
            replaced_count += 1
        else:
            logger.warning(f"⚠️ [Miner Agent] Could not save refreshed fact; keeping the old one for [{key}]")

    return {
        "status": "success",
        "workspace_id": workspace_id,
        "distilled_total": len(distilled_facts),
        "saved_to_pgvector": saved_count,
        "refreshed": replaced_count,
        "unchanged": unchanged_count,
        # Metrics the workspace does not yet have enough data to support.
        # Reported, never stored — see verify_and_distill_patterns.
        "insufficient_data": insufficient,
    }


# Stable identity of a derived metric, independent of the figures inside it.
# Two facts sharing a key describe the same measurement at different times.
_FACT_KINDS = (
    ("correspondence_backlog", ("نسبة تراكم",)),
    ("correspondence_path_bottleneck", ("المسار المؤسسي",)),
    ("invoice_overdue", ("الفواتير المالية",)),
    ("deal_conversion", ("معدل إغلاق الصفقات",)),
    ("attendance_late", ("التأخر في تسجيل الحضور",)),
)


def _fact_key(text: str) -> str:
    """Classify a distilled fact by the metric it reports.

    Path-scoped facts additionally carry their path segment, so two different
    bottlenecked departments stay separate entries rather than overwriting
    each other.
    """
    body = (text or "").strip()
    for key, markers in _FACT_KINDS:
        if any(m in body for m in markers):
            if key == "correspondence_path_bottleneck":
                start = body.find("('")
                end = body.find("')", start)
                if start != -1 and end != -1:
                    return f"{key}:{body[start + 2:end]}"
            return key
    # Unrecognised shape (e.g. a candidate_insight from the Go backend): fall
    # back to the full text so it is only ever deduplicated against itself.
    return f"raw:{body}"


# Smallest denominator that makes a percentage a statement about the business
# rather than about noise. Below this, the arithmetic is still correct and the
# conclusion is still worthless: one won deal out of one is not "a 100%
# conversion rate", yet it was being stored as [VERIFIED STATS] — and the
# reasoning constitution then instructs every agent to lead its answer with that
# figure. `[VERIFIED]` must mean checked, not merely computed.
_MIN_SAMPLE = {
    "correspondence": 5,
    "invoices": 5,
    "deals": 5,
    "attendance": 10,
}


def verify_and_distill_patterns(patterns: Dict[str, Any], insufficient: List[str] = None) -> List[str]:
    """Re-derive statistics mathematically from raw pattern figures (Section 4)
    and format them with mandatory Epistemic Labeling (`[VERIFIED STATS]`).

    Metrics whose sample is too small are skipped and, when `insufficient` is
    provided, reported into it with an `[INSUFFICIENT DATA]` note — the label the
    SOVEREIGN_ANALYTICS_TRACKER persona mandates and that nothing emitted before.
    These notes are deliberately NOT saved to pgvector: institutional memory is
    for established facts, and "we don't know yet" is not one.
    """
    candidate_facts = []
    insufficient = insufficient if insufficient is not None else []

    # 1. Correspondences verification
    corr = patterns.get("correspondence_metrics") or {}
    total_corr = corr.get("total_correspondences", 0)
    pending_corr = corr.get("pending_count", 0)
    bottlenecks = corr.get("bottlenecks_by_path") or []

    if 0 < total_corr < _MIN_SAMPLE["correspondence"] and pending_corr > 0:
        insufficient.append(
            f"[INSUFFICIENT DATA] المراسلات: {total_corr} خطاب فقط — دون الحد الأدنى "
            f"({_MIN_SAMPLE['correspondence']}) لاشتقاق نسبة تراكم ذات دلالة."
        )
    elif total_corr >= _MIN_SAMPLE["correspondence"] and pending_corr > 0:
        pending_pct = round((pending_corr / total_corr) * 100, 1)
        if pending_pct >= 30.0:
            candidate_facts.append(
                f"[VERIFIED STATS] المراسلات الرسمية تواجه نسبة تراكم تبلغ {pending_pct}% ({pending_corr} خطاب معلق من إجمالي {total_corr})."
            )

    for b in bottlenecks:
        if not isinstance(b, dict):
            continue
        path = b.get("path_segment", "general")
        count = b.get("pending_count", 0)
        avg_days = float(b.get("avg_days_open", 0.0))
        if count >= 2 or avg_days >= 3.0:
            candidate_facts.append(
                f"[VERIFIED STATS - Candidate Fact] المراسلات في المسار المؤسسي ('{path}') تعاني من تراكم ({count} معاملة معلقة) بمتوسط تأخير {avg_days} أيام."
            )

    # 2. Finance & CRM verification
    fin = patterns.get("finance_crm_metrics") or {}
    total_inv = fin.get("total_invoices", 0)
    overdue_inv = fin.get("overdue_invoices", 0)
    overdue_amt = float(fin.get("overdue_amount", 0.0))
    # Currency travels with the workspace's finance data. Hard-coding "د.ل" made
    # every tenant's overdue figure read as Libyan dinar regardless of their
    # actual currency; fall back to a neutral code only when none is supplied.
    currency = fin.get("currency") or "LYD"

    if 0 < total_inv < _MIN_SAMPLE["invoices"] and overdue_inv > 0:
        insufficient.append(
            f"[INSUFFICIENT DATA] الفواتير: {total_inv} فاتورة فقط — دون الحد الأدنى "
            f"({_MIN_SAMPLE['invoices']}) لاشتقاق نسبة تأخر ذات دلالة."
        )
    elif total_inv >= _MIN_SAMPLE["invoices"] and overdue_inv > 0:
        # Re-derive exact percentage
        recomputed_pct = round((overdue_inv / total_inv) * 100, 1)
        if recomputed_pct >= 20.0:
            candidate_facts.append(
                f"[VERIFIED STATS - Candidate Fact] الفواتير المالية في مسار التحصيل تواجه تأخراً بنسبة {recomputed_pct}% ({overdue_inv} فاتورة متأخرة بإجمالي قيمة {overdue_amt:.2f} {currency})."
            )

    total_deals = fin.get("total_deals", 0)
    won_deals = fin.get("won_deals", 0)
    if 0 < total_deals < _MIN_SAMPLE["deals"]:
        insufficient.append(
            f"[INSUFFICIENT DATA] الصفقات: {total_deals} صفقة فقط — دون الحد الأدنى "
            f"({_MIN_SAMPLE['deals']}) لاشتقاق معدل إغلاق ذي دلالة."
        )
    elif total_deals >= _MIN_SAMPLE["deals"]:
        conversion_pct = round((won_deals / total_deals) * 100, 1)
        candidate_facts.append(
            f"[VERIFIED STATS] معدل إغلاق الصفقات الناجحة (Conversion Rate) يبلغ {conversion_pct}% ({won_deals} صفقة ناجحة من إجمالي {total_deals})."
        )

    # 3. Operational / Attendance verification
    ops = patterns.get("operational_metrics") or {}
    total_att = ops.get("total_attendance_logs", 0)
    late_att = ops.get("late_check_ins", 0)
    if 0 < total_att < _MIN_SAMPLE["attendance"] and late_att > 0:
        insufficient.append(
            f"[INSUFFICIENT DATA] الحضور: {total_att} سجل فقط — دون الحد الأدنى "
            f"({_MIN_SAMPLE['attendance']}) لاشتقاق معدل تأخر ذي دلالة."
        )
    elif total_att >= _MIN_SAMPLE["attendance"] and late_att > 0:
        recomputed_late = round((late_att / total_att) * 100, 1)
        if recomputed_late >= 15.0:
            candidate_facts.append(
                f"[VERIFIED STATS - Candidate Fact] معدلات التأخر في تسجيل الحضور والانصراف تبلغ {recomputed_late}% ({late_att} حالة تأخير من إجمالي {total_att} سجل)."
            )

    # Include any pre-candidate insights from Go backend if re-derived
    for insight in (patterns.get("candidate_insights") or []):
        if isinstance(insight, str) and insight not in candidate_facts:
            candidate_facts.append(insight)

    return candidate_facts
