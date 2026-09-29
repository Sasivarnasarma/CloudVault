from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(example="ok")
    app_name: str
    version: str
    storage_provider: str
    bucket: str
