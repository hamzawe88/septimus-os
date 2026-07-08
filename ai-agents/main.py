import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from dotenv import load_dotenv
from pydantic import BaseModel
from events.nats_listener import start_nats_listener

try:
    from agents.rag_query import RAGQueryEngine
    from agents.sprint_planner import plan_sprint
    from agents.subtask_generator import generate_subtasks
    rag_query_engine = RAGQueryEngine()
except ImportError:
    rag_query_engine = None
    plan_sprint = None
    generate_subtasks = None

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Modern FastAPI lifespan context manager.
    Replaces the deprecated @app.on_event("startup") pattern.
    """
    # ── Startup ──────────────────────────────────────────────
    print("🚀 Starting Septimus AI Agent Team Orchestrator...")
    nats_task = asyncio.create_task(start_nats_listener())

    yield  # Application is running

    # ── Shutdown ─────────────────────────────────────────────
    print("🛑 Shutting down AI Agent Team...")
    nats_task.cancel()
    try:
        await nats_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Septimus AI Agent Team",
    description="LangGraph-powered AI orchestration layer for Septimus OS",
    version="0.1.0",
    lifespan=lifespan,
)

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    question: str
    entity_id: str = None

@app.post("/api/v1/ai/query", summary="Query Documents (RAG)")
def query_documents(req: QueryRequest):
    """Answers questions based on uploaded documents in ChromaDB."""
    if not rag_query_engine:
        return {"error": "RAG Engine not initialized (missing dependencies)."}
    
    answer = rag_query_engine.ask(req.question, req.entity_id)
    return {"status": "success", "answer": answer}

class PlanSprintRequest(BaseModel):
    capacity: int
    backlog: list

@app.post("/api/v1/ai/plan-sprint", summary="AI Sprint Planner")
def ai_plan_sprint(req: PlanSprintRequest):
    if not plan_sprint:
        return {"error": "plan_sprint module not initialized"}
    selected_ids = plan_sprint(req.capacity, req.backlog)
    return {"status": "success", "selected_task_ids": selected_ids}

class GenerateSubtasksRequest(BaseModel):
    title: str
    description: str = ""

@app.post("/api/v1/ai/generate-subtasks", summary="AI Subtask Generator")
def ai_generate_subtasks(req: GenerateSubtasksRequest):
    if not generate_subtasks:
        return {"error": "generate_subtasks module not initialized"}
    subtasks = generate_subtasks(req.title, req.description)
    return {"status": "success", "subtasks": subtasks}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
