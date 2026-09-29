from fastapi import APIRouter
from app.api.routes import folders, health, objects

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(objects.router)
api_router.include_router(folders.router)
