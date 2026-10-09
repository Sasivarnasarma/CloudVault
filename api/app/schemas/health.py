from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(examples=["ok"])
    app_name: str
    version: str
    storage_provider: str
    bucket: str
    storage_connected: bool
