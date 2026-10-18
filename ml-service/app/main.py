import hmac
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException

from app.api import health, insights, score, workflow
from app.workflow.graph import build_investigation_graph


def require_internal_key(
    key: str | None = Header(
        default=None,
        alias="X-Internal-API-Key",
    ),
):
    expected = os.environ.get("ML_INTERNAL_API_KEY")

    if not expected:
        # In test and local development environments without an API key set, allow requests
        return

    if key is None or not hmac.compare_digest(
        key,
        expected,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid internal API key",
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    database_url = os.environ.get("LANGGRAPH_DB_URL")

    if database_url:
        from langgraph.checkpoint.postgres import PostgresSaver

        with PostgresSaver.from_conn_string(
            database_url
        ) as checkpointer:
            checkpointer.setup()

            app.state.investigation_graph = (
                build_investigation_graph(checkpointer)
            )

            yield
    else:
        from langgraph.checkpoint.memory import MemorySaver

        checkpointer = MemorySaver()
        app.state.investigation_graph = (
            build_investigation_graph(checkpointer)
        )

        yield


app = FastAPI(
    title="FraudShield ML Service",
    version="0.2.0",
    lifespan=lifespan,
)

app.include_router(
    health.router,
    prefix="/api/ml",
)

for protected_router in (
    score.router,
    insights.router,
    workflow.router,
):
    app.include_router(
        protected_router,
        prefix="/api/ml",
        dependencies=[Depends(require_internal_key)],
    )
