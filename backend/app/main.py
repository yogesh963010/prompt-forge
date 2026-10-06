"""PromptForge Backend FastAPI Application."""
from fastapi import FastAPI, Depends, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError, OperationalError

from .database.connection import get_db, verify_database_connection
from .routes.auth import router as auth_router
from .routes.prompt_systems import router as prompt_systems_router
from .routes.modules import router as modules_router
from .routes.module_references import router as module_references_router
from .routes.composer import router as composer_router
from .routes.tests import router as tests_router
from .routes.versions import router as versions_router
from .routes.runs import router as runs_router
from .routes.providers import router as providers_router
from .routes.sharing import router as sharing_router
from .routes.conversations import router as conversations_router
from .routes.assistants import router as assistants_router
from .routes.documents import router as documents_router
from .routes.rag import router as rag_router
from .routes.ai_providers import router as ai_providers_router

app = FastAPI(
    title="PromptForge API",
    description="Modular prompt development, testing, and composition platform",
    version="0.1.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router)
app.include_router(prompt_systems_router)
app.include_router(modules_router)
app.include_router(module_references_router)
app.include_router(composer_router)
app.include_router(tests_router)
app.include_router(versions_router)
app.include_router(runs_router)
app.include_router(providers_router)
app.include_router(sharing_router)
app.include_router(sharing_router, prefix="/api")
app.include_router(conversations_router)
app.include_router(assistants_router)
app.include_router(documents_router)
app.include_router(documents_router, prefix="/api")
app.include_router(rag_router)
app.include_router(rag_router, prefix="/api")
app.include_router(ai_providers_router)
app.include_router(ai_providers_router, prefix="/api")


@app.get("/", tags=["General"])
def read_root():
    """Root welcome endpoint."""
    return {"message": "Welcome to PromptForge API"}


@app.get("/health", tags=["Health"])
def health_check():
    """General application liveness health check."""
    return {"status": "ok"}


@app.get("/health/db", tags=["Health"])
async def db_health_check(db: AsyncSession = Depends(get_db)):
    """PostgreSQL database connectivity health check.
    
    Verifies that the database engine can execute queries and the session is healthy asynchronously.
    """
    try:
        # Execute lightweight ping query asynchronously
        await db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "connected",
        }
    except (OperationalError, SQLAlchemyError):
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "error",
                "database": "disconnected",
                "detail": "Database is unreachable or connection failed.",
            },
        )
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "error",
                "database": "disconnected",
                "detail": "An unexpected error occurred during database check.",
            },
        )
