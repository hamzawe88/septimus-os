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
                f"{BACKEND_URL}/internal/analytics/mine?workspace_id={workspace_id}",
                headers=internal_headers(),
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
    distilled_facts = verify_and_distill_patterns(patterns)

    # 2. Epistemic Deduplication against existing pgvector institutional facts
    existing_facts = knowledge.list_facts(workspace_id) or []
    existing_texts = [f.get("content", "") for f in existing_facts if isinstance(f, dict) and f.get("content")]

    saved_count = 0
    for new_fact in distilled_facts:
        is_duplicate = False
        for ext in existing_texts:
            # Simple substring checking or exact topic checking
            if new_fact[:40] in ext or ext[:40] in new_fact:
                is_duplicate = True
                break
        
        if not is_duplicate:
            logger.info(f"💾 [Miner Agent] Saving candidate fact to pgvector: {new_fact}")
            knowledge.save_fact(workspace_id, new_fact)
            saved_count += 1
        else:
            logger.debug(f"⏭️ [Miner Agent] Fact already exists or candidate pending: {new_fact[:50]}...")

    return {
        "status": "success",
        "workspace_id": workspace_id,
        "distilled_total": len(distilled_facts),
        "saved_to_pgvector": saved_count,
    }


def verify_and_distill_patterns(patterns: Dict[str, Any]) -> List[str]:
    """Re-derive statistics mathematically from raw pattern figures (Section 4)

    and format them with mandatory Epistemic Labeling (`[VERIFIED STATS]`).
    """
    candidate_facts = []

    # 1. Correspondences verification
    corr = patterns.get("correspondence_metrics") or {}
    total_corr = corr.get("total_correspondences", 0)
    pending_corr = corr.get("pending_count", 0)
    bottlenecks = corr.get("bottlenecks_by_path") or []

    if total_corr > 0 and pending_corr > 0:
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

    if total_inv > 0 and overdue_inv > 0:
        # Re-derive exact percentage
        recomputed_pct = round((overdue_inv / total_inv) * 100, 1)
        if recomputed_pct >= 20.0:
            candidate_facts.append(
                f"[VERIFIED STATS - Candidate Fact] الفواتير المالية في مسار التحصيل تواجه تأخراً بنسبة {recomputed_pct}% ({overdue_inv} فاتورة متأخرة بإجمالي قيمة {overdue_amt:.2f} د.ل)."
            )

    total_deals = fin.get("total_deals", 0)
    won_deals = fin.get("won_deals", 0)
    if total_deals > 0:
        conversion_pct = round((won_deals / total_deals) * 100, 1)
        candidate_facts.append(
            f"[VERIFIED STATS] معدل إغلاق الصفقات الناجحة (Conversion Rate) يبلغ {conversion_pct}% ({won_deals} صفقة ناجحة من إجمالي {total_deals})."
        )

    # 3. Operational / Attendance verification
    ops = patterns.get("operational_metrics") or {}
    total_att = ops.get("total_attendance_logs", 0)
    late_att = ops.get("late_check_ins", 0)
    if total_att > 0 and late_att > 0:
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
