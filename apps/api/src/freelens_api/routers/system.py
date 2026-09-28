from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..schemas import HealthResponse
from ..services.hindsight import hindsight

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
async def health(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    database_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        database_ok = False
    hindsight_ok = await hindsight.health()
    return HealthResponse(
        status="healthy" if database_ok and hindsight_ok else "degraded",
        database=database_ok,
        hindsight=hindsight_ok,
    )

