from langgraph.graph import END, START, StateGraph

from app.workflow.nodes import (
    apply_rules,
    finalize,
    gather_evidence,
    human_review,
    prepare_case,
)
from app.workflow.state import InvestigationState


def build_investigation_graph(checkpointer):
    builder = StateGraph(InvestigationState)

    builder.add_node("gather_evidence", gather_evidence)
    builder.add_node("apply_rules", apply_rules)
    builder.add_node("prepare_case", prepare_case)
    builder.add_node("human_review", human_review)
    builder.add_node("finalize", finalize)

    builder.add_edge(START, "gather_evidence")
    builder.add_edge("gather_evidence", "apply_rules")
    builder.add_edge("apply_rules", "prepare_case")
    builder.add_edge("prepare_case", "human_review")
    builder.add_edge("human_review", "finalize")
    builder.add_edge("finalize", END)

    return builder.compile(checkpointer=checkpointer)