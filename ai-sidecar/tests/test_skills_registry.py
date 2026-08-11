"""Offline tests for the orchestrator system-prompt modes (needs only PyYAML).

Regression under test: when no specific persona was selected, the prompt loaded
EVERY skill module and told the model to embody all of them, so opening e.g. a
CRM agent produced a generic "I am the sovereign system — analytics AND legal AND
PM AND accounts" identity instead of one focused specialist. The prompt now has
two clean modes: a single-persona identity, and an honest router.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from skills_registry import skills_registry as R


class TestSinglePersona(unittest.TestCase):
    def setUp(self):
        self.persona = next(iter(R.registry))  # a real catalog id

    def test_names_only_the_selected_persona(self):
        p = R.generate_system_prompt(self.persona)
        # Exactly one persona's focus block — not the whole catalog.
        self.assertEqual(p.count("Strategic Focus:"), 1)

    def test_forbids_impersonating_others(self):
        p = R.generate_system_prompt(self.persona)
        self.assertIn("do not claim to perform other specialties", p.lower())

    def test_is_not_router_mode(self):
        p = R.generate_system_prompt(self.persona)
        self.assertNotIn("ROUTER", p)

    def test_case_insensitive_resolution(self):
        p = R.generate_system_prompt(self.persona.upper())
        self.assertEqual(p.count("Strategic Focus:"), 1)


class TestRouterMode(unittest.TestCase):
    def test_no_persona_is_router_not_all_skills(self):
        p = R.generate_system_prompt(None)
        self.assertIn("ROUTER", p)
        # The exact defect: instructing the model to be every skill at once.
        self.assertNotIn("Embody", p)
        self.assertIn("must NOT claim to personally perform every skill", p)

    def test_router_asks_when_ambiguous(self):
        self.assertIn("ask", R.generate_system_prompt(None).lower())

    def test_router_lists_specialists_as_options(self):
        p = R.generate_system_prompt(None)
        self.assertIn("route to exactly one", p)
        # every catalog persona appears as a routing option
        for data in R.registry.values():
            self.assertIn(data["name"], p)

    def test_unknown_persona_falls_back_to_router(self):
        p = R.generate_system_prompt("no_such_persona")
        self.assertIn("ROUTER", p)


class TestBothModesShareRules(unittest.TestCase):
    def test_stop_gate_and_epistemic_rules_present_in_both(self):
        for prompt in (R.generate_system_prompt(next(iter(R.registry))),
                       R.generate_system_prompt(None)):
            self.assertIn("Parameter Stop-Gate", prompt)
            self.assertIn("[VERIFIED]", prompt)


class TestDomainScoping(unittest.TestCase):
    """The ingested agency personas are grouped by domain so each Septimus
    specialist sees only its own catalogue, while the orchestrator sees all."""

    def test_domains_are_populated(self):
        d = R.domains()
        for expected in ("finance", "sales", "marketing", "pm", "sovereign"):
            self.assertIn(expected, d)
            self.assertGreater(d[expected], 0)

    def test_persona_carries_domain_and_specialist(self):
        for v in R.registry.values():
            self.assertIn("domain", v)
            self.assertIn("specialist", v)

    def test_personas_for_domain_is_scoped(self):
        sales = R.personas_for_domain("sales")
        self.assertTrue(sales)
        self.assertTrue(all(p["domain"] == "sales" for p in sales))
        # a finance persona must not leak into the sales pool
        self.assertNotIn("finance", {p["domain"] for p in sales})

    def test_router_scoped_to_domain_lists_only_that_domain(self):
        p = R.generate_system_prompt(domain="finance")
        self.assertIn("for the finance domain", p)
        for fin in R.personas_for_domain("finance"):
            self.assertIn(fin["name"], p)
        # a marketing persona name should not appear in the finance router
        mkt = R.personas_for_domain("marketing")[0]
        self.assertNotIn(mkt["name"], p)

    def test_search_scoped_to_domain(self):
        hits = R.search_skills("financial model forecast", domain="finance")
        self.assertTrue(all(h["domain"] == "finance" for h in hits))

    def test_unknown_domain_yields_empty_pool(self):
        self.assertEqual(R.personas_for_domain("no_such_domain"), [])


if __name__ == "__main__":
    unittest.main()
